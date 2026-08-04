const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const IS_LOCAL_DEV = !!(process.env.NETLIFY_DEV || process.env.NETLIFY_LOCAL);
const IS_SERVERLESS_RUNTIME = !!(
  process.env.LAMBDA_TASK_ROOT ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.NETLIFY
);

function findProjectRoot() {
  const seeds = [process.cwd(), __dirname];
  for (const seed of seeds) {
    let current = path.resolve(seed);
    while (true) {
      const hasNetlifyToml = fsSync.existsSync(path.join(current, "netlify.toml"));
      const hasIndexHtml = fsSync.existsSync(path.join(current, "index.html"));
      const hasDataDir = fsSync.existsSync(path.join(current, "data"));
      if (hasNetlifyToml && hasIndexHtml && hasDataDir) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const LOCAL_STORE_DIR = IS_SERVERLESS_RUNTIME && !IS_LOCAL_DEV
  ? path.join("/tmp", "measurement-pro-local-store")
  : path.join(PROJECT_ROOT, "data", ".local-store");
let storePromise = null;

function hasNetlifyBlobsEnv() {
  if (IS_LOCAL_DEV) return false;
  return !!(
    process.env.NETLIFY ||
    process.env.CONTEXT ||
    process.env.NETLIFY_BLOBS_CONTEXT ||
    (process.env.SITE_ID && process.env.NETLIFY_AUTH_TOKEN)
  );
}

function getNetlifyBlobsConfig() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID || "";
  const token = process.env.NETLIFY_AUTH_TOKEN || "";
  if (!siteID || !token) return null;
  return { name: "measurement-pro", siteID, token };
}

function getLocalFilePath(key) {
  const safeKey = String(key || "default").replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(LOCAL_STORE_DIR, `${safeKey}.json`);
}

async function getLocalStoreClient() {
  await fs.mkdir(LOCAL_STORE_DIR, { recursive: true });
  return {
    async get(key, options = {}) {
      try {
        const raw = await fs.readFile(getLocalFilePath(key), "utf8");
        if (options.type === "json") return JSON.parse(raw);
        return raw;
      } catch (error) {
        if (error && error.code === "ENOENT") return null;
        throw error;
      }
    },
    async setJSON(key, value) {
      await fs.mkdir(LOCAL_STORE_DIR, { recursive: true });
      await fs.writeFile(getLocalFilePath(key), JSON.stringify(value, null, 2), "utf8");
    },
  };
}

async function getStoreClient() {
  if (!storePromise) {
    storePromise = (async () => {
      if (hasNetlifyBlobsEnv()) {
        try {
          const mod = await import("@netlify/blobs");
          const config = getNetlifyBlobsConfig();
          if (config) return mod.getStore(config);
          return mod.getStore("measurement-pro");
        } catch (error) {
          console.warn("Falling back to local store because Netlify Blobs is unavailable:", error.message);
        }
      }
      return getLocalStoreClient();
    })();
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

async function deleteJson(key) {
  const store = await getStoreClient();
  if (typeof store.delete === "function") {
    await store.delete(key);
    return;
  }
  if (typeof store.setJSON === "function") {
    await store.setJSON(key, null);
  }
}

module.exports = {
  CORS_HEADERS,
  getJson,
  setJson,
  deleteJson,
};
