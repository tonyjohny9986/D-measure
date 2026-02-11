exports.handler = async () => {
  const ok =
    !!process.env.XERO_CLIENT_ID &&
    !!process.env.XERO_CLIENT_SECRET &&
    !!process.env.XERO_REDIRECT_URI;

  return {
    statusCode: ok ? 200 : 500,
    body: JSON.stringify(
      {
        hasClientId: !!process.env.XERO_CLIENT_ID,
        hasClientSecret: !!process.env.XERO_CLIENT_SECRET,
        hasRedirectUri: !!process.env.XERO_REDIRECT_URI,
      },
      null,
      2
    ),
  };
};
