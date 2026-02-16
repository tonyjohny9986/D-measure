const { CORS_HEADERS, getJson, setJson } = require("./_store");
const { requireAuth, unauthorized } = require("./_auth");

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
    const { id } = JSON.parse(event.body || "{}");
    if (id === undefined || id === null) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing id" }),
      };
    }

    const jobs = await getJson("jobs", []);
    const safeJobs = Array.isArray(jobs) ? jobs : [];
    const nextJobs = safeJobs.filter((j) => String(j.id) !== String(id));

    await setJson("jobs", nextJobs);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, total: nextJobs.length }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
