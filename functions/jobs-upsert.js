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
    const { job } = JSON.parse(event.body || "{}");
    if (!job || (!job.id && job.id !== 0)) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing job.id" }),
      };
    }

    const jobs = await getJson("jobs", []);
    const safeJobs = Array.isArray(jobs) ? jobs : [];
    const idx = safeJobs.findIndex((j) => String(j.id) === String(job.id));
    if (idx >= 0) {
      safeJobs[idx] = job;
    } else {
      safeJobs.push(job);
    }

    await setJson("jobs", safeJobs);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, total: safeJobs.length }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
