const { getStore } = require("@netlify/blobs");

const store = getStore("measurement-pro");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

async function getJson(key, fallback) {
  const raw = await store.get(key, { type: "json" });
  return raw === null || raw === undefined ? fallback : raw;
}

async function setJson(key, value) {
  await store.setJSON(key, value);
}

module.exports = {
  store,
  CORS_HEADERS,
  getJson,
  setJson,
};
