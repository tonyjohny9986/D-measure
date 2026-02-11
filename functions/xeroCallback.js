exports.handler = async (event) => {
  try {
    const CLIENT_ID = process.env.XERO_CLIENT_ID;
    const CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
    const REDIRECT_URI = process.env.XERO_REDIRECT_URI;

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return {
        statusCode: 500,
        body: "Missing XERO_CLIENT_ID, XERO_CLIENT_SECRET or XERO_REDIRECT_URI in Netlify environment variables.",
      };
    }

    const code = event.queryStringParameters?.code;
    if (!code) return { statusCode: 400, body: "Missing ?code from Xero." };

    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    });

    const res = await fetch("https://identity.xero.com/connect/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const text = await res.text();
    if (!res.ok) return { statusCode: 500, body: `Token exchange failed: ${text}` };

    const token = JSON.parse(text);

    const base = new URL(REDIRECT_URI).origin;
    const redirectTo =
      `${base}/xero-callback.html` +
      `#access_token=${encodeURIComponent(token.access_token)}` +
      `&refresh_token=${encodeURIComponent(token.refresh_token || "")}` +
      `&expires_in=${encodeURIComponent(token.expires_in || "")}`;

    return { statusCode: 302, headers: { Location: redirectTo }, body: "" };
  } catch (e) {
    return { statusCode: 500, body: `xeroCallback error: ${e?.message || e}` };
  }
};
