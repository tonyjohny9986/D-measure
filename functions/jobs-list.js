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
    const jobs = await getJson("jobs", []);
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ jobs: Array.isArray(jobs) ? jobs : [] }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
