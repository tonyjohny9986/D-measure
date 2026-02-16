const fetch = require('node-fetch');
const { CORS_HEADERS } = require("./_store");
const { requireAuth, unauthorized } = require("./_auth");

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  try {
    const session = await requireAuth(event);
    if (!session) return unauthorized();
    const { refreshToken } = JSON.parse(event.body || '{}');

    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    if(!clientId||!clientSecret){
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing XERO_CLIENT_ID / XERO_CLIENT_SECRET in Netlify environment variables' }) };
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const response = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: `grant_type=refresh_token&refresh_token=${refreshToken}`
    });

    const data = await response.json();

    if (data.error) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: data.error_description || data.error }) };
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token
      })
    };

  } catch (error) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
};
