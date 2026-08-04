const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { getConfigValue } = require("./_config");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const IS_LOCAL_DEV = !!(process.env.NETLIFY_DEV || process.env.NETLIFY_LOCAL);
const IS_SERVERLESS_RUNTIME = !!(
  process.env.LAMBDA_TASK_ROOT ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY
);

function findProjectRoot() {
  const seeds = [process.cwd(), __dirname];
  for (const seed of seeds) {
    let current = path.resolve(seed);
    while (true) {
      const hasNetlifyToml = fsSync.existsSync(path.join(current, "netlify.toml"));
      const hasIndexHtml = fsSync.existsSync(path.join(current, "index.html"));
      const hasDataDir = fsSync.existsSync(path.join(current, "data"));
      if (hasNetlifyToml && hasIndexHtml && hasDataDir) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const LOCAL_STORE_DIR = IS_SERVERLESS_RUNTIME && !IS_LOCAL_DEV
  ? path.join("/tmp", "measurement-pro-local-store")
  : path.join(PROJECT_ROOT, "data", ".local-store");
let storePromise = null;

function hasSupabaseEnv() {
  return !!(
    getConfigValue("SUPABASE_URL") &&
    getConfigValue("SUPABASE_SERVICE_ROLE_KEY")
  );
}

function getSupabaseConfig() {
  const url = getConfigValue("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = getConfigValue("SUPABASE_SERVICE_ROLE_KEY");
  const table = getConfigValue("SUPABASE_STORE_TABLE", "app_kv") || "app_kv";
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, table };
}

function hasNetlifyBlobsEnv() {
  if (IS_LOCAL_DEV) return false;
  return !!(
    process.env.NETLIFY ||
    process.env.CONTEXT ||
    process.env.NETLIFY_BLOBS_CONTEXT ||
    (process.env.SITE_ID && process.env.NETLIFY_AUTH_TOKEN)
  );
}

function getNetlifyBlobsConfig() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "";
  const token = process.env.NETLIFY_AUTH_TOKEN || "";
  if (!siteID || !token) return null;
  return { name: "measurement-pro", siteID, token };
}

function getLocalFilePath(key) {
  const safeKey = String(key || "default").replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(LOCAL_STORE_DIR, `${safeKey}.json`);
}

async function getLocalStoreClient() {
  await fs.mkdir(LOCAL_STORE_DIR, { recursive: true });
  return {
    async get(key, options = {}) {
      try {
        const raw = await fs.readFile(getLocalFilePath(key), "utf8");
        if (options.type === "json") return JSON.parse(raw);
        return raw;
      } catch (error) {
        if (error && error.code === "ENOENT") return null;
        throw error;
      }
    },
    async setJSON(key, value) {
      await fs.mkdir(LOCAL_STORE_DIR, { recursive: true });
      await fs.writeFile(getLocalFilePath(key), JSON.stringify(value, null, 2), "utf8");
    },
  };
}

function buildSupabaseHeaders(config, extra = {}) {
  return {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function buildSupabaseUrl(config, query = "") {
  return `${config.url}/rest/v1/${encodeURIComponent(config.table)}${query}`;
}

async function readSupabaseError(response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    throw new Error(`Supabase request failed with status ${response.status}`);
  }
  try {
    const parsed = JSON.parse(text);
    throw new Error(parsed.message || parsed.error_description || parsed.error || text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(text);
    }
    throw error;
  }
}

async function getSupabaseStoreClient() {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase storage is not configured.");
  }

  return {
    async get(key, options = {}) {
      const query = `?select=value&key=eq.${encodeURIComponent(String(key))}&limit=1`;
      const response = await fetch(buildSupabaseUrl(config, query), {
        method: "GET",
        headers: buildSupabaseHeaders(config),
      });
      if (!response.ok) await readSupabaseError(response);
      const rows = await response.json();
      const value = Array.isArray(rows) && rows.length ? rows[0].value : null;
      if (value === null || value === undefined) return null;
      if (options.type === "json") return value;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    async setJSON(key, value) {
      const payload = [{ key: String(key), value }];
      const response = await fetch(buildSupabaseUrl(config), {
        method: "POST",
        headers: buildSupabaseHeaders(config, {
          Prefer: "return=minimal,resolution=merge-duplicates",
        }),
        body: JSON.stringify(payload),
      });
      if (!response.ok) await readSupabaseError(response);
    },
    async delete(key) {
      const response = await fetch(
        buildSupabaseUrl(config, `?key=eq.${encodeURIComponent(String(key))}`),
        {
          method: "DELETE",
          headers: buildSupabaseHeaders(config),
        }
      );
      if (!response.ok) await readSupabaseError(response);
    },
  };
}

async function getStoreClient() {
  if (!storePromise) {
    storePromise = (async () => {
      if (hasSupabaseEnv()) {
        return getSupabaseStoreClient();
      }
      if (hasNetlifyBlobsEnv()) {
        try {
          const mod = await import("@netlify/blobs");
          const config = getNetlifyBlobsConfig();
          if (config) return mod.getStore(config);
          return mod.getStore("measurement-pro");
        } catch (error) {
          if (IS_SERVERLESS_RUNTIME && !IS_LOCAL_DEV) {
            throw new Error(`Cloud data store unavailable: ${error.message}`);
          }
          console.warn("Falling back to local store because Netlify Blobs is unavailable:", error.message);
        }
      }
      if (IS_SERVERLESS_RUNTIME && !IS_LOCAL_DEV) {
        throw new Error("Cloud data store unavailable: Netlify Blobs is not configured for this production runtime.");
      }
      return getLocalStoreClient();
    })();
  }
  return storePromise;
}

async function getJson(key, fallback) {
  const store = await getStoreClient();
  const raw = await store.get(key, { type: "json" });
  return raw === null || raw === undefined ? fallback : raw;
}

async function setJson(key, value) {
  const store = await getStoreClient();
  await store.setJSON(key, value);
}

async function deleteJson(key) {
  const store = await getStoreClient();
  if (typeof store.delete === "function") {
    await store.delete(key);
    return;
  }
  if (typeof store.setJSON === "function") {
    await store.setJSON(key, null);
  }
}

module.exports = {
  CORS_HEADERS,
  getJson,
  setJson,
  deleteJson,
};
