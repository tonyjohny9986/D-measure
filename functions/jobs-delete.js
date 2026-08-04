const { CORS_HEADERS, getJson, setJson, deleteJson } = require("./_store");
const { requireAuth, unauthorized } = require("./_auth");

const JOB_INDEX_KEY = "jobs_index";
const LEGACY_JOBS_KEY = "jobs";

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
    const { id } = JSON.parse(event.body || "{}");
    if (id === undefined || id === null) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing id" }),
      };
    }

    const storeKey = getJobStoreKey(id);
    const index = await getJson(JOB_INDEX_KEY, []);
    const nextIndex = (Array.isArray(index) ? index : []).filter((key) => key !== storeKey);

    await setJson(JOB_INDEX_KEY, nextIndex);
    await deleteJson(storeKey);
    const legacyJobs = await getJson(LEGACY_JOBS_KEY, []);
    const nextLegacyJobs = (Array.isArray(legacyJobs) ? legacyJobs : []).filter((job) => job && job.id !== id);
    await setJson(LEGACY_JOBS_KEY, nextLegacyJobs);

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
