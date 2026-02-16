const { requireAuth } = require("./_auth");

exports.handler = async (event) => {
  const session = await requireAuth(event);
  if (!session) {
    return {
      statusCode: 302,
      headers: { Location: "/" },
      body: ""
    };
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      body: 'Missing XERO_CLIENT_ID or XERO_REDIRECT_URI in Netlify environment variables.'
    };
  }

  const scopes = [
    'offline_access',
    'accounting.transactions',
    'accounting.contacts'
  ].join(' ');

  const state = 'deco123';
  const authUrl =
    'https://login.xero.com/identity/connect/authorize' +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&state=${encodeURIComponent(state)}`;

  return {
    statusCode: 302,
    headers: {
      Location: authUrl,
      'Cache-Control': 'no-store'
    },
    body: ''
  };
};
