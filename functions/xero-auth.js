const fetch = require('node-fetch');
const { CORS_HEADERS, setJson } = require("./_store");
const { requireAuth, unauthorized } = require("./_auth");

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const session = await requireAuth(event);
    if (!session) return unauthorized();
    const { code } = JSON.parse(event.body || '{}');

    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    const redirectUri = process.env.XERO_REDIRECT_URI;

    if (!code) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing OAuth code' }) };
    }
    if (!clientId || !clientSecret || !redirectUri) {
      return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Missing XERO_CLIENT_ID / XERO_CLIENT_SECRET / XERO_REDIRECT_URI in Netlify environment variables' }) };
    }

    console.log('Xero auth attempt:', { clientId: clientId.substring(0,8)+'...', redirectUri });

    // Exchange code for token
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`
    });

    const tokenData = await tokenResponse.json();

    console.log('Token response status:', tokenResponse.status);

    if (tokenData.error) {
      console.error('Xero token error:', tokenData);
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: tokenData.error_description || tokenData.error }) };
    }

    if (!tokenData.access_token) {
      console.error('No access token received:', tokenData);
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No access token received from Xero' }) };
    }

    // Get tenant info
    const connectionsResponse = await fetch('https://api.xero.com/connections', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });

    const tenants = await connectionsResponse.json();
    const tenantCount = Array.isArray(tenants) ? tenants.length : 0;
    console.log('Tenants found:', tenantCount);
    if (!tenantCount) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'No Xero organisation connection found for this user.' })
      };
    }

    const tenant = tenants[0] || {};
    const now = Date.now();
    const expiresInSec = parseInt(tokenData.expires_in || 1800, 10);
    const tokenRecord = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName || "",
      expires_at: now + (Number.isFinite(expiresInSec) ? expiresInSec * 1000 : 1800 * 1000),
      updated_at: new Date().toISOString()
    };
    await setJson("xero_token", tokenRecord);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        connected: true,
        tenant_id: tenant.tenantId,
        tenant_name: tenant.tenantName || ""
      })
    };

  } catch (error) {
    console.error('Xero auth function error:', error);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
};
