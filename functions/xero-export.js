const fetch = require('node-fetch');
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

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(tokenRecord.refresh_token)}`
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
    updated_at: new Date().toISOString()
  };
  await setJson("xero_token", updated);
  return updated;
}

async function upsertContact({ accessToken, tenantId, job }) {
  const contactPayload = {
    Contacts: [
      {
        Name: job.clientName,
        EmailAddress: job.email || undefined,
        Phones: job.phone
          ? [
              {
                PhoneType: "MOBILE",
                PhoneNumber: job.phone,
              },
            ]
          : undefined,
      },
    ],
  };

  const contactResponse = await fetch("https://api.xero.com/api.xro/2.0/Contacts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Xero-tenant-id": tenantId,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(contactPayload),
  });

  const text = await contactResponse.text();
  if (!contactResponse.ok) {
    throw new Error(`Failed to sync contact: ${text}`);
  }

  const json = text ? JSON.parse(text) : {};
  const contact = json?.Contacts?.[0];
  if (!contact?.ContactID) {
    throw new Error("Failed to get ContactID from Xero");
  }
  return contact.ContactID;
}

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
    const { job, lineItems } = JSON.parse(event.body || '{}');
    if (!job?.clientName || !Array.isArray(lineItems) || lineItems.length===0) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing required payload fields (job.clientName, lineItems).' })
      };
    }

    const clientId = process.env.XERO_CLIENT_ID;
    const clientSecret = process.env.XERO_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing XERO_CLIENT_ID / XERO_CLIENT_SECRET in Netlify environment variables" })
      };
    }

    const stored = await getJson("xero_token", null);
    const token = await refreshAccessTokenIfNeeded(stored, clientId, clientSecret);
    const accessToken = token.access_token;
    const tenantId = token.tenant_id;
    const contactId = await upsertContact({ accessToken, tenantId, job });

    console.log('Creating quote for:', job.clientName);

    // Create Quote - Xero will auto-create contact if it doesn't exist
    const quoteData = {
      Contact: { 
        ContactID: contactId
      },
      Date: job.date,
      ExpiryDate: job.date,
      Reference: `QUOTE-${job.id}`,
      LineItems: lineItems,
      Status: "DRAFT"
    };

    // Xero expects a wrapper object: { Quotes: [ ... ] }
    const payload = { Quotes: [ quoteData ] };
    console.log('Sending to Xero:', JSON.stringify(payload, null, 2));

    const quoteResponse = await fetch('https://api.xero.com/api.xro/2.0/Quotes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': tenantId,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('Xero response status:', quoteResponse.status);

    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      console.error('Quote creation failed:', quoteResponse.status, errorText);
      
      let errorMsg = 'Failed to create quote';
      try {
        const errorJson = JSON.parse(errorText);
        errorMsg = errorJson.Message || errorJson.Title || errorText;
      } catch (e) {
        errorMsg = errorText;
      }
      
      return {
        statusCode: quoteResponse.status,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: errorMsg, details: errorText })
      };
    }

    // Handle both 200 and 204 responses
    let quoteResult = null;
    if (quoteResponse.status === 200) {
      quoteResult = await quoteResponse.json();
      console.log('Quote created:', quoteResult.Quotes[0].QuoteNumber);
    } else if (quoteResponse.status === 204) {
      console.log('Quote created successfully (204 No Content)');
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        quote: quoteResult,
        message: 'Quote created successfully'
      })
    };

  } catch (error) {
    console.error('Export function error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message })
    };
  }
};
