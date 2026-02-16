const { CORS_HEADERS, requireAuth, unauthorized, createEmployee } = require("./_auth");

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
    const session = await requireAuth(event);
    if (!session) return unauthorized();
    if (session.role !== "admin") {
      return {
        statusCode: 403,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Admin access required" }),
      };
    }

    const { name, email, password, role } = JSON.parse(event.body || "{}");
    const created = await createEmployee({ name, email, password, role });
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ employee: created }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
