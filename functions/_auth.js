const crypto = require("crypto");
const { getJson, setJson, CORS_HEADERS } = require("./_store");

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
}

function createPasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: hashPassword(password, salt) };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = hashPassword(password, salt);
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(expectedHash || "", "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role || "employee",
    active: user.active !== false,
  };
}

function getAuthToken(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const query = event.queryStringParameters || {};
  return query.token || "";
}

async function ensureEmployeesSeeded() {
  const existing = await getJson("employees", []);
  if (Array.isArray(existing) && existing.length > 0) return existing;

  const fromEnv = process.env.EMPLOYEE_ACCOUNTS_JSON;
  if (fromEnv) {
    try {
      const parsed = JSON.parse(fromEnv);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const seeded = parsed
          .filter((u) => u && u.email && u.password)
          .map((u) => {
            const rec = createPasswordRecord(u.password);
            return {
              id: crypto.randomUUID(),
              name: u.name || u.email,
              email: normalizeEmail(u.email),
              role: u.role === "admin" ? "admin" : "employee",
              active: true,
              passwordSalt: rec.salt,
              passwordHash: rec.hash,
              createdAt: new Date().toISOString(),
            };
          });
        if (seeded.length > 0) {
          await setJson("employees", seeded);
          return seeded;
        }
      }
    } catch (e) {}
  }

  const adminEmail = normalizeEmail(process.env.EMPLOYEE_ADMIN_EMAIL || "admin@decovibes.local");
  const adminPassword = process.env.EMPLOYEE_ADMIN_PASSWORD || "ChangeMe123!";
  const rec = createPasswordRecord(adminPassword);
  const fallback = [
    {
      id: crypto.randomUUID(),
      name: "Admin",
      email: adminEmail,
      role: "admin",
      active: true,
      passwordSalt: rec.salt,
      passwordHash: rec.hash,
      createdAt: new Date().toISOString(),
      isDefaultBootstrap: true,
    },
  ];
  await setJson("employees", fallback);
  return fallback;
}

async function findEmployeeByEmail(email) {
  const users = await ensureEmployeesSeeded();
  const target = normalizeEmail(email);
  return users.find((u) => normalizeEmail(u.email) === target) || null;
}

async function listEmployees() {
  const users = await ensureEmployeesSeeded();
  return users.map(sanitizeUser);
}

async function createEmployee({ name, email, password, role }) {
  const users = await ensureEmployeesSeeded();
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Email is required");
  if (!password || String(password).length < 6) throw new Error("Password must be at least 6 characters");
  if (users.some((u) => normalizeEmail(u.email) === normalized)) {
    throw new Error("Employee already exists");
  }
  const rec = createPasswordRecord(password);
  const next = {
    id: crypto.randomUUID(),
    name: name || normalized,
    email: normalized,
    role: role === "admin" ? "admin" : "employee",
    active: true,
    passwordSalt: rec.salt,
    passwordHash: rec.hash,
    createdAt: new Date().toISOString(),
  };
  users.push(next);
  await setJson("employees", users);
  return sanitizeUser(next);
}

async function updateEmployee({ id, name, role, active, password, actorUserId }) {
  if (!id) throw new Error("Employee id is required");
  const users = await ensureEmployeesSeeded();
  const idx = users.findIndex((u) => String(u.id) === String(id));
  if (idx < 0) throw new Error("Employee not found");

  const current = users[idx];
  const next = { ...current };

  if (name !== undefined) {
    const trimmed = String(name || "").trim();
    next.name = trimmed || current.name;
  }

  if (role !== undefined) {
    const nextRole = role === "admin" ? "admin" : "employee";
    if (current.role === "admin" && nextRole !== "admin") {
      const activeAdmins = users.filter((u) => u.active !== false && u.role === "admin");
      if (activeAdmins.length <= 1) throw new Error("Cannot remove the last active admin");
    }
    next.role = nextRole;
  }

  if (active !== undefined) {
    const nextActive = !!active;
    if (!nextActive && String(current.id) === String(actorUserId)) {
      throw new Error("You cannot disable your own account");
    }
    if (current.role === "admin" && !nextActive) {
      const activeAdmins = users.filter((u) => u.active !== false && u.role === "admin");
      if (activeAdmins.length <= 1) throw new Error("Cannot disable the last active admin");
    }
    next.active = nextActive;
  }

  if (password !== undefined && password !== null && String(password) !== "") {
    if (String(password).length < 6) throw new Error("Password must be at least 6 characters");
    const rec = createPasswordRecord(password);
    next.passwordSalt = rec.salt;
    next.passwordHash = rec.hash;
  }

  users[idx] = next;
  await setJson("employees", users);
  return sanitizeUser(next);
}

async function createSessionForUser(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const session = {
    token,
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role || "employee",
    createdAt: new Date(now).toISOString(),
    expiresAt: now + SESSION_TTL_MS,
  };
  await setJson(`session:${token}`, session);
  return session;
}

async function getSession(token) {
  if (!token) return null;
  const session = await getJson(`session:${token}`, null);
  if (!session) return null;
  if (!session.expiresAt || Date.now() > session.expiresAt) return null;
  return session;
}

async function requireAuth(event) {
  const token = getAuthToken(event);
  const session = await getSession(token);
  if (!session) return null;
  return session;
}

function unauthorized() {
  return {
    statusCode: 401,
    headers: CORS_HEADERS,
    body: JSON.stringify({ error: "Unauthorized" }),
  };
}

module.exports = {
  CORS_HEADERS,
  normalizeEmail,
  verifyPassword,
  sanitizeUser,
  findEmployeeByEmail,
  listEmployees,
  createEmployee,
  updateEmployee,
  createSessionForUser,
  requireAuth,
  unauthorized,
};
