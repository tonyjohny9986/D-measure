const { CORS_HEADERS, getJson, setJson } = require("./_store");
const { requireAuth, unauthorized } = require("./_auth");

const JOB_INDEX_KEY = "jobs_index";
const LEGACY_JOBS_KEY = "jobs";

function getJobStoreKey(id) {
  return `job_${String(id)}`;
}

function normalizeJob(job) {
  if (!job || (job.id === undefined || job.id === null)) return null;
  const next = { ...job };
  next.updatedAt = next.updatedAt || next.savedAt || new Date().toISOString();
  return next;
}

async function loadIndexedJobs() {
  const index = await getJson(JOB_INDEX_KEY, []);
  const keys = Array.isArray(index) ? index.filter(Boolean) : [];
  const jobs = await Promise.all(keys.map((key) => getJson(key, null)));
  return jobs.map(normalizeJob).filter(Boolean);
}

async function migrateLegacyJobsIfNeeded() {
  const index = await getJson(JOB_INDEX_KEY, []);
  if (Array.isArray(index) && index.length > 0) return;
  const legacyJobs = await getJson(LEGACY_JOBS_KEY, []);
  if (!Array.isArray(legacyJobs) || legacyJobs.length === 0) return;

  const normalizedJobs = legacyJobs.map(normalizeJob).filter(Boolean);
  const nextIndex = [];
  for (const job of normalizedJobs) {
    const key = getJobStoreKey(job.id);
    nextIndex.push(key);
    await setJson(key, job);
  }
  await setJson(JOB_INDEX_KEY, nextIndex);
}

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

    await migrateLegacyJobsIfNeeded();
    const jobs = await loadIndexedJobs();

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ jobs }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
