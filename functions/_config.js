const fs = require("fs");
const path = require("path");

const LOCAL_CONFIG_PATH = path.join(process.cwd(), "data", ".local-config.json");

let cachedLocalConfig = null;
let didLoadLocalConfig = false;

function loadLocalConfig() {
  if (didLoadLocalConfig) return cachedLocalConfig;
  didLoadLocalConfig = true;
  try {
    const raw = fs.readFileSync(LOCAL_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    cachedLocalConfig = parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    cachedLocalConfig = {};
  }
  return cachedLocalConfig;
}

function getConfigValue(key, fallback = "") {
  if (process.env[key]) return process.env[key];
  const localConfig = loadLocalConfig();
  const localValue = localConfig[key];
  return localValue == null || localValue === "" ? fallback : String(localValue);
}

module.exports = {
  LOCAL_CONFIG_PATH,
  getConfigValue,
};
