exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    const accessToken = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const tenantId =
      event.headers?.["xero-tenant-id"] ||
      event.headers?.["Xero-Tenant-Id"] ||
      event.headers?.["xero-tenant-id".toUpperCase()] ||
      "";

    if (!accessToken) {
      return { statusCode: 400, body: "Missing Authorization: Bearer <accessToken>" };
    }
    if (!tenantId) {
      return { statusCode: 400, body: "Missing xero-tenant-id header" };
    }

    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return { statusCode: 400, body: "Invalid JSON body" };
    }

    const {
      contactName,
      contactEmail,
      contactPhone,
      quoteNumber,
      reference,
      summary,
      date,        // "YYYY-MM-DD"
      expiryDate,  // "YYYY-MM-DD"
      currencyCode,
      lineItems,   // [{ description, quantity, unitAmount, taxType? }]
    } = payload;

    if (!contactName) return { statusCode: 400, body: "Missing contactName" };
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return { statusCode: 400, body: "Missing lineItems[]" };
    }

    // Build Xero Quote object
    const xeroQuote = {
      Type: "ACCREC",          // sales quote
      Status: "DRAFT",         // safest to create as draft
      Date: date || new Date().toISOString().slice(0, 10),
      ExpiryDate: expiryDate || undefined,
      QuoteNumber: quoteNumber || undefined,
      Reference: reference || undefined,
      Title: summary || "Decovibes Quote",
      CurrencyCode: currencyCode || undefined,
      Contact: {
        Name: contactName,
        EmailAddress: contactEmail || undefined,
        Phones: contactPhone
          ? [{ PhoneType: "DEFAULT", PhoneNumber: contactPhone }]
          : undefined,
      },
      LineItems: lineItems.map((li) => ({
        Description: li.description || "",
        Quantity: Number(li.quantity ?? 1),
        UnitAmount: Number(li.unitAmount ?? 0),
        TaxType: li.taxType || "OUTPUT", // common default; change if needed
      })),
    };

    // Xero API expects { Quotes: [ ... ] }
    const res = await fetch("https://api.xero.com/api.xro/2.0/Quotes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "xero-tenant-id": tenantId,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Quotes: [xeroQuote] }),
    });

    const text = await res.text();
    if (!res.ok) {
      return {
        statusCode: res.status,
        body: `Xero error (${res.status}): ${text}`,
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: text,
    };
  } catch (e) {
    return { statusCode: 500, body: `xeroCreateQuote error: ${e?.message || e}` };
  }
};
