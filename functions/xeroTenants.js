exports.handler = async (event) => {
  try {
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

    if (!token) {
      return { statusCode: 400, body: "Missing Authorization: Bearer <token>" };
    }

    const res = await fetch("https://api.xero.com/connections", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const text = await res.text();
    return {
      statusCode: res.status,
      headers: { "Content-Type": "application/json" },
      body: text,
    };
  } catch (e) {
    return { statusCode: 500, body: `xeroTenants error: ${e?.message || e}` };
  }
};
