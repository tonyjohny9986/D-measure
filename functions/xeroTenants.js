exports.handler = async (event) => {
  try {
    const accessToken = event.queryStringParameters?.token;

    if (!accessToken) {
      return {
        statusCode: 400,
        body: "Missing access token",
      };
    }

    const res = await fetch("https://api.xero.com/connections", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const data = await res.text();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: data,
    };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
};
