const { CORS_HEADERS, getJson } = require("./_store");
const { requireAuth, unauthorized } = require("./_auth");

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
    const token = await getJson("xero_token", null);
    const connected = !!(token && token.refresh_token && token.tenant_id);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        connected,
        tenant_id: connected ? token.tenant_id : null,
        tenant_name: connected ? token.tenant_name || "" : "",
        updated_at: connected ? token.updated_at || null : null,
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
