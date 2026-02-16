const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

let storePromise = null;
async function getStoreClient() {
  if (!storePromise) {
    storePromise = import("@netlify/blobs").then((mod) =>
      mod.getStore({
        name: "measurement-pro",
        siteID: process.env.NETLIFY_SITE_ID || process.env.SITE_ID,
        token: process.env.NETLIFY_AUTH_TOKEN,
      })
    );
  }
  return storePromise;
}

async function getJson(key, fallback) {
  const store = await getStoreClient();
  const raw = await store.get(key, { type: "json" });
  return raw === null || raw === undefined ? fallback : raw;
}

async function setJson(key, value) {
  const store = await getStoreClient();
  await store.setJSON(key, value);
}

module.exports = {
  CORS_HEADERS,
  getJson,
  setJson,
};
