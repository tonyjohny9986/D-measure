const { CORS_HEADERS, requireAuth, unauthorized, updateEmployee } = require("./_auth");

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

    const { id, name, role, active, password } = JSON.parse(event.body || "{}");
    const employee = await updateEmployee({
      id,
      name,
      role,
      active,
      password,
      actorUserId: session.userId,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ employee }),
    };
  } catch (error) {
    return {
      statusCode: 400,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
