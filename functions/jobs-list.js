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

function mergeJobsByLatest(...jobLists) {
  const merged = new Map();
  jobLists.flat().filter(Boolean).forEach((job) => {
    const normalized = normalizeJob(job);
    if (!normalized) return;
    const existing = merged.get(normalized.id);
    if (!existing) {
      merged.set(normalized.id, normalized);
      return;
    }
    const existingTs = Date.parse(existing.updatedAt || existing.savedAt || 0) || 0;
    const nextTs = Date.parse(normalized.updatedAt || normalized.savedAt || 0) || 0;
    if (nextTs >= existingTs) {
      merged.set(normalized.id, normalized);
    }
  });
  return Array.from(merged.values());
}

async function migrateLegacyJobsIfNeeded() {
  const legacyJobs = await getJson(LEGACY_JOBS_KEY, []);
  if (!Array.isArray(legacyJobs) || legacyJobs.length === 0) return;

  const indexedJobs = await loadIndexedJobs();
  const mergedJobs = mergeJobsByLatest(indexedJobs, legacyJobs);
  const nextIndex = [];
  for (const job of mergedJobs) {
    const key = getJobStoreKey(job.id);
    nextIndex.push(key);
    await setJson(key, job);
  }
  await setJson(JOB_INDEX_KEY, nextIndex);
  await setJson(LEGACY_JOBS_KEY, mergedJobs);
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
    const indexedJobs = await loadIndexedJobs();
    const legacyJobs = await getJson(LEGACY_JOBS_KEY, []);
    const jobs = mergeJobsByLatest(indexedJobs, Array.isArray(legacyJobs) ? legacyJobs : []);

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
