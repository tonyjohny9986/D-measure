const { CORS_HEADERS, requireAuth, unauthorized, listEmployees } = require("./_auth");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }
  if (event.httpMethod !== "GET") {
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
    const users = await listEmployees();
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ employees: users }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
