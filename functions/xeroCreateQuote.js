// functions/xeroCreateQuote.js
// Netlify Function: POST /.netlify/functions/xeroCreateQuote
// Expects headers:
//   Authorization: Bearer <access_token>
//   xero-tenant-id: <tenant_id>
// Body: { contactName, reference, date, expiryDate, quoteNumber, summary, lineItems: [{ description, quantity, unitAmount, taxType }] }

exports.handler = async (event) => {
  // CORS
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, xero-tenant-id",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: "Method Not Allowed" };
  }

  try {
    const auth = event.headers.authorization || event.headers.Authorization;
    const tenantId = event.headers["xero-tenant-id"] || event.headers["Xero-Tenant-Id"];

    if (!auth || !auth.toLowerCase().startsWith("bearer ")) {
      return { statusCode: 401, headers: corsHeaders, body: "Missing Authorization Bearer token" };
    }
    if (!tenantId) {
      return { statusCode: 401, headers: corsHeaders, body: "Missing xero-tenant-id header" };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const {
      contactName,
      contactEmail,
      contactPhone,
      reference,
      date,
      expiryDate,
      quoteNumber,
      summary,
      lineItems,
    } = body;

    if (!contactName) {
      return { statusCode: 400, headers: corsHeaders, body: "Missing contactName" };
    }
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return { statusCode: 400, headers: corsHeaders, body: "Missing lineItems" };
    }

    // Build Xero Quote payload (Accounting API)
    // NOTE: Some orgs require a valid Contact (existing). We create a Contact by name inline (Xero usually accepts this).
    const xeroPayload = {
      Quotes: [
        {
          Contact: {
            Name: contactName,
            EmailAddress: contactEmail || undefined,
            Phones: contactPhone
              ? [{ PhoneType: "MOBILE", PhoneNumber: String(contactPhone) }]
              : undefined,
          },
          Date: date || new Date().toISOString().slice(0, 10),
          ExpiryDate: expiryDate || undefined,
          QuoteNumber: quoteNumber || undefined,
          Reference: reference || undefined,
          Summary: summary || "Decovibes Quote",
          LineItems: lineItems.map((li) => ({
            Description: li.description || "",
            Quantity: Number(li.quantity ?? 1),
            UnitAmount: Number(li.unitAmount ?? 0),
            TaxType: li.taxType || "OUTPUT",
          })),
          Status: "DRAFT",
        },
      ],
    };

    const res = await fetch("https://api.xero.com/api.xro/2.0/Quotes", {
      method: "POST",
      headers: {
        Authorization: auth,
        "xero-tenant-id": tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(xeroPayload),
    });

    const text = await res.text();

    if (!res.ok) {
      // Return exact Xero error back to your app
      return {
        statusCode: res.status,
        headers: corsHeaders,
        body: text || `Xero error: ${res.status}`,
      };
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: `Server error: ${err.message || String(err)}`,
    };
  }
};
