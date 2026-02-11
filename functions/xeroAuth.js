exports.handler = async (event) => {
  try {
    const CLIENT_ID = process.env.XERO_CLIENT_ID;
    const REDIRECT_URI = process.env.XERO_REDIRECT_URI;

    if (!CLIENT_ID || !REDIRECT_URI) {
      return {
        statusCode: 500,
        body: "Missing XERO_CLIENT_ID or XERO_REDIRECT_URI in Netlify environment variables.",
      };
    }

    const state = Date.now().toString();
    const scope = "offline_access accounting.transactions accounting.settings";

    const authUrl =
      "https://login.xero.com/identity/connect/authorize" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(scope)}` +
      `&state=${encodeURIComponent(state)}`;

    return {
      statusCode: 302,
      headers: { Location: authUrl },
      body: "",
    };
  } catch (e) {
    return { statusCode: 500, body: `xeroAuth error: ${e?.message || e}` };
  }
};
