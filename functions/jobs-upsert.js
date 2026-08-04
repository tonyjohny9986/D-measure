const { CORS_HEADERS, getJson, setJson } = require("./_store");
const { requireAuth, unauthorized } = require("./_auth");

const JOB_INDEX_KEY = "jobs_index";

function getJobStoreKey(id) {
  return `job_${String(id)}`;
}

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

    const normalizedJob = {
      ...job,
      updatedAt: new Date().toISOString(),
    };
    const storeKey = getJobStoreKey(normalizedJob.id);
    const index = await getJson(JOB_INDEX_KEY, []);
    const nextIndex = Array.isArray(index) ? [...index] : [];
    if (!nextIndex.includes(storeKey)) {
      nextIndex.push(storeKey);
    }

    await setJson(storeKey, normalizedJob);
    await setJson(JOB_INDEX_KEY, nextIndex);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, total: nextIndex.length }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
