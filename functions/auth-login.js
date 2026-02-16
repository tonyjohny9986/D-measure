const {
  CORS_HEADERS,
  findEmployeeByEmail,
  verifyPassword,
  createSessionForUser,
  sanitizeUser,
} = require("./_auth");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { email, password } = JSON.parse(event.body || "{}");
    const user = await findEmployeeByEmail(email);
    if (!user || user.active === false) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Invalid email or password" }),
      };
    }

    const ok = verifyPassword(password, user.passwordSalt, user.passwordHash);
    if (!ok) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Invalid email or password" }),
      };
    }

    const session = await createSessionForUser(user);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        token: session.token,
        user: sanitizeUser(user),
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
