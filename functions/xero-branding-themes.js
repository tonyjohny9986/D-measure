const fetch = require("node-fetch");
const { CORS_HEADERS, getJson, setJson } = require("./_store");
const { requireAuth, unauthorized } = require("./_auth");

async function refreshAccessTokenIfNeeded(tokenRecord, clientId, clientSecret) {
  if (!tokenRecord || !tokenRecord.refresh_token) {
    throw new Error("Xero is not connected. Please connect once in Settings.");
  }

  const now = Date.now();
  const expiresAt = parseInt(tokenRecord.expires_at || 0, 10);
  const refreshWindowMs = 2 * 60 * 1000;
  if (expiresAt && expiresAt - now > refreshWindowMs && tokenRecord.access_token) {
    return tokenRecord;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(tokenRecord.refresh_token)}`,
  });
  const data = await response.json();
  if (!response.ok || data.error || !data.access_token) {
    const msg = data.error_description || data.error || "Failed to refresh Xero token";
    throw new Error(msg);
  }

  const expiresInSec = parseInt(data.expires_in || 1800, 10);
  const updated = {
    ...tokenRecord,
    access_token: data.access_token,
    refresh_token: data.refresh_token || tokenRecord.refresh_token,
    expires_at: Date.now() + (Number.isFinite(expiresInSec) ? expiresInSec * 1000 : 1800 * 1000),
    updated_at: new Date().toISOString(),
  };
  await setJson("xero_token", updated);
  return updated;
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

    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing XERO_CLIENT_ID / XERO_CLIENT_SECRET in Netlify environment variables" }),
      };
    }

    const stored = await getJson("xero_token", null);
    const token = await refreshAccessTokenIfNeeded(stored, clientId, clientSecret);
    const response = await fetch("https://api.xero.com/api.xro/2.0/BrandingThemes", {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Xero-tenant-id": token.tenant_id,
        Accept: "application/json",
      },
    });

    const text = await response.text();
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: text || "Failed to load branding themes" }),
      };
    }

    const data = text ? JSON.parse(text) : {};
    const themes = Array.isArray(data.BrandingThemes)
      ? data.BrandingThemes.map((theme) => ({
          id: theme.BrandingThemeID,
          name: theme.Name || "Unnamed Theme",
          sortOrder: Number.isFinite(theme.SortOrder) ? theme.SortOrder : parseInt(theme.SortOrder || 9999, 10) || 9999,
        }))
      : [];
    themes.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        themes,
        defaultThemeId: themes.length ? themes[0].id : "",
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
