const XLSX = require("xlsx");
const { CORS_HEADERS } = require("./_store");

function cleanValue(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
}

function cleanMultilineValue(value) {
  return String(value == null ? "" : value)
    .replace(/\r/g, "")
    .split("\n")
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

function normalizeKey(value) {
  return cleanValue(value).toLowerCase();
}

function parseDateValue(value) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = cleanValue(value);
  if (!text) return "";
  const dayFirstMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dayFirstMatch) {
    const day = dayFirstMatch[1].padStart(2, "0");
    const month = dayFirstMatch[2].padStart(2, "0");
    const year = dayFirstMatch[3].length === 2 ? `20${dayFirstMatch[3]}` : dayFirstMatch[3];
    return `${year}-${month}-${day}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString().slice(0, 10);
}

function parseNumber(value) {
  if (value == null || value === "") return null;
  const text = cleanValue(value).replace(/,/g, "");
  const parsed = parseFloat(text);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDimensions(...values) {
  for (const rawValue of values) {
    const text = cleanValue(rawValue).replace(/\s+/g, " ");
    if (!text) continue;
    const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m)?\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m)?/i);
    if (!match) continue;
    const first = parseFloat(String(match[1]).replace(",", "."));
    const second = parseFloat(String(match[2]).replace(",", "."));
    if (Number.isNaN(first) || Number.isNaN(second)) continue;
    let multiplier = 1;
    const lower = text.toLowerCase();
    if (/\bcm\b/.test(lower)) multiplier = 10;
    else if (/\bm\b/.test(lower) && !/\bmm\b/.test(lower)) multiplier = 1000;
    else if (first <= 20 && second <= 20) multiplier = 1000;
    const width = Math.round(first * multiplier);
    const drop = Math.round(second * multiplier);
    if (width > 0 && drop > 0) {
      return { width, drop };
    }
  }
  return null;
}

function parseFitMode(...values) {
  const text = values.map(cleanValue).join(" ").toLowerCase();
  if (!text) return "";
  if (text.includes("recess")) return "Recess";
  if (text.includes("ceiling")) return "Ceiling";
  if (text.includes("face fit")) return "Face Fit";
  if (text.includes("face")) return "Face";
  if (text.includes("inside mount") || text.includes("inside")) return "Recess";
  if (text.includes("outside mount") || text.includes("outside")) return "Face";
  return "";
}

function resolveSimpleFitType(inOut, mountingMethod, windowType) {
  const normalizedInOut = normalizeKey(inOut);
  const normalizedMounting = normalizeKey(mountingMethod);
  const normalizedWindowType = normalizeKey(windowType);

  if (normalizedInOut === "in") return "IN";
  if (normalizedInOut === "out") return "Face Fit";
  if (normalizedInOut === "ms") return "Face";

  const explicitFit = parseFitMode(inOut, mountingMethod, windowType);
  if (explicitFit) return explicitFit;

  if (normalizedMounting.includes("face fit")) return "Face Fit";
  if (normalizedMounting.includes("ceiling")) return "Ceiling";
  if (normalizedMounting.includes("face")) return "Face";
  if (normalizedWindowType.includes("ceiling")) return "Ceiling";
  if (normalizedWindowType.includes("curtain") || normalizedWindowType.includes("sheer") || normalizedWindowType.includes("blockout")) return "Ceiling";

  return cleanValue(inOut || mountingMethod || windowType);
}

function detectProductType(rowProduct, rowType, globalType) {
  const text = [rowProduct, rowType, globalType].map(cleanValue).join(" ").toLowerCase();
  if (!text) return { type: "Blinds", subType: "Roller" };
  if (text.includes("verishade")) return { type: "Verishade", subType: "-" };
  if (text.includes("shutter") || text.includes("plantation") || text.includes("fauxwood")) {
    return { type: "Shutters", subType: "-" };
  }
  if (text.includes("vertical")) return { type: "Blinds", subType: "Vertical" };
  if (text.includes("zebra")) return { type: "Blinds", subType: "Zebra" };
  if (text.includes("venetian")) return { type: "Blinds", subType: "Venetian" };
  if (text.includes("trublockout")) return { type: "Blinds", subType: "Trublockout" };
  if (text.includes("sheer")) return { type: "Curtains", subType: "Sheer" };
  if (text.includes("blockout") || text.includes("blackout")) return { type: "Curtains", subType: "Blockout" };
  if (text.includes("curtain")) return { type: "Curtains", subType: "Sheer" };
  if (text.includes("roller")) return { type: "Blinds", subType: "Roller" };
  return { type: "Blinds", subType: "Roller" };
}

function buildWindowNotes(parts) {
  return parts.map(cleanValue).filter(Boolean).join(" | ");
}

function rowHasMeaningfulValues(row) {
  return row.some((cell) => cleanValue(cell));
}

function findValueNearLabel(rows, patterns) {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    for (let c = 0; c < row.length; c += 1) {
      const cell = normalizeKey(row[c]);
      if (!cell) continue;
      const matched = patterns.some((pattern) => pattern.test(cell));
      if (!matched) continue;
      for (let offset = 1; offset <= 2; offset += 1) {
        const next = cleanMultilineValue(row[c + offset]);
        if (next) return next;
      }
    }
  }
  return "";
}

function scoreHeaderRow(row) {
  let score = 0;
  row.forEach((cell) => {
    const text = normalizeKey(cell);
    if (!text) return;
    if (/item|room|product|size|width|drop|height|colour|color|mount|fit|notes|window/.test(text)) score += 1;
    if (/special instructions|completion|sign off/.test(text)) score -= 2;
  });
  return score;
}

function findHeaderRow(rows) {
  let bestIndex = -1;
  let bestScore = 0;
  rows.forEach((row, index) => {
    const score = scoreHeaderRow(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function mapHeaderIndexes(row) {
  const mapping = {};
  row.forEach((cell, index) => {
    const text = normalizeKey(cell);
    if (!text) return;
    if (mapping.item == null && /^item\b|^item\s*#|^#$|^no$/.test(text)) mapping.item = index;
    if (mapping.room == null && /(room|location|area)/.test(text)) mapping.room = index;
    if (mapping.windowType == null && /(window type)/.test(text)) mapping.windowType = index;
    if (mapping.layoutCode == null && /(layout code|layout)/.test(text)) mapping.layoutCode = index;
    if (mapping.product == null && /(product|description|fabric|range|material)/.test(text)) mapping.product = index;
    if (mapping.productType == null && /(product type|category|material)/.test(text)) mapping.productType = index;
    if (mapping.width == null && /(width|gross open width)/.test(text)) mapping.width = index;
    if (mapping.drop == null && /(drop|height)/.test(text)) mapping.drop = index;
    if (mapping.size == null && /(size|dimensions?)/.test(text)) mapping.size = index;
    if (mapping.panels == null && /panels?/.test(text)) mapping.panels = index;
    if (mapping.color == null && /(colour|color)/.test(text)) mapping.color = index;
    if (mapping.blade == null && /blade/.test(text)) mapping.blade = index;
    if (mapping.midRail == null && /(mid rail|midrail)/.test(text)) mapping.midRail = index;
    if (mapping.mounting == null && /(mount|fit|install type|mounting)/.test(text)) mapping.mounting = index;
    if (mapping.notes == null && /(notes|frame|remarks|comment)/.test(text)) mapping.notes = index;
  });
  return mapping;
}

function findHeaderRowByItem(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] || [];
    const first = normalizeKey(row[0]);
    const second = normalizeKey(row[1]);
    if (first === "item #" || (first === "item" && /room|location/.test(second))) {
      return i;
    }
  }
  return -1;
}

function isMeaningfulSimpleValue(value) {
  const text = cleanValue(value).toLowerCase();
  return !!text && !["0", "false", "no", "n/a", "na"].includes(text);
}

function hasPositiveMeasurement(value) {
  const parsed = parseNumber(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function extractSimplePageItems(workbook) {
  const items = [];
  for (const sheetName of workbook.SheetNames) {
    if (!/page/i.test(sheetName)) continue;
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    });
    const headerIndex = findHeaderRowByItem(rows);
    if (headerIndex < 0) continue;
    const headerMap = mapHeaderIndexes(rows[headerIndex]);
    for (let i = headerIndex + 1; i < rows.length; i += 1) {
      const row = rows[i] || [];
      const secondCell = normalizeKey(row[1]);
      if (/standard special comments/.test(secondCell)) break;

      const itemNumber = cleanValue(headerMap.item != null ? row[headerMap.item] : "");
      const room = cleanValue(headerMap.room != null ? row[headerMap.room] : "");
      const width = cleanValue(headerMap.width != null ? row[headerMap.width] : "");
      const drop = cleanValue(headerMap.drop != null ? row[headerMap.drop] : "");
      const product = cleanValue(headerMap.product != null ? row[headerMap.product] : "");
      const layoutCode = cleanValue(headerMap.layoutCode != null ? row[headerMap.layoutCode] : "");
      const inOut = cleanValue(row[4]);
      const windowType = cleanValue(headerMap.windowType != null ? row[headerMap.windowType] : "");
      const mountingMethod = cleanValue(headerMap.mounting != null ? row[headerMap.mounting] : "");
      const fitType = resolveSimpleFitType(inOut, mountingMethod, windowType);

      if (!itemNumber && !room && !width && !drop && !product && !layoutCode) continue;
      if (!/^\d+$/.test(itemNumber)) continue;
      if (!hasPositiveMeasurement(width) || !hasPositiveMeasurement(drop)) continue;
      if (!isMeaningfulSimpleValue(room) && !isMeaningfulSimpleValue(product) && !isMeaningfulSimpleValue(layoutCode)) continue;

      items.push({
        itemNumber,
        room,
        product,
        size: width && drop ? `${width} x ${drop}` : "",
        fitType,
        layoutCode,
      });
    }
  }
  return items;
}

function extractSpecialInstructions(rows) {
  for (let i = 0; i < rows.length; i += 1) {
    const first = normalizeKey(rows[i][0]);
    if (!/special instructions/.test(first)) continue;
    const values = [];
    for (let j = i + 1; j < rows.length; j += 1) {
      const row = rows[j];
      const text = row.map(cleanMultilineValue).filter(Boolean).join(" ");
      if (!text) {
        if (values.length) break;
        continue;
      }
      if (/completion|sign off/i.test(text)) break;
      values.push(text);
    }
    return values.join("\n");
  }
  return "";
}

function buildWindows(rows, headerIndex, headerMap, globalProductType) {
  if (headerIndex < 0) return [];
  const windows = [];
  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!rowHasMeaningfulValues(row)) {
      if (windows.length) continue;
      continue;
    }
    const rowText = row.map(cleanValue).join(" ").toLowerCase();
    if (/special instructions|completion|sign off/.test(rowText)) break;

    const sizeDims = parseDimensions(
      headerMap.size != null ? row[headerMap.size] : "",
      headerMap.notes != null ? row[headerMap.notes] : ""
    );
    const directDims = parseDimensions(
      headerMap.width != null ? row[headerMap.width] : "",
      headerMap.drop != null ? row[headerMap.drop] : ""
    );
    const dims = directDims || sizeDims;
    const room = cleanValue(headerMap.room != null ? row[headerMap.room] : "");
    const product = cleanValue(headerMap.product != null ? row[headerMap.product] : "");
    const productType = cleanValue(headerMap.productType != null ? row[headerMap.productType] : "") || globalProductType;
    const windowType = cleanValue(headerMap.windowType != null ? row[headerMap.windowType] : "");
    const item = cleanValue(headerMap.item != null ? row[headerMap.item] : "");
    const color = cleanValue(headerMap.color != null ? row[headerMap.color] : "");
    const panels = cleanValue(headerMap.panels != null ? row[headerMap.panels] : "");
    const layoutCode = cleanValue(headerMap.layoutCode != null ? row[headerMap.layoutCode] : "");
    const blade = cleanValue(headerMap.blade != null ? row[headerMap.blade] : "");
    const mounting = cleanValue(headerMap.mounting != null ? row[headerMap.mounting] : "");
    const notes = cleanMultilineValue(headerMap.notes != null ? row[headerMap.notes] : "");
    const midRail = parseNumber(headerMap.midRail != null ? row[headerMap.midRail] : "");
    const typeInfo = detectProductType(product, productType || windowType, globalProductType);
    const fitMode = parseFitMode(mounting, notes, windowType);
    const fitLabel = fitMode
      ? fitMode.charAt(0).toUpperCase() + fitMode.slice(1)
      : cleanValue(mounting) || (typeInfo.type === "Curtains" ? "Ceiling" : "");
    const resolvedProductLabel = cleanValue(
      [productType, product].filter(Boolean).join(" - ") ||
      product ||
      productType ||
      globalProductType ||
      `${typeInfo.type}${typeInfo.subType && typeInfo.subType !== "-" ? ` - ${typeInfo.subType}` : ""}`
    );

    if (!dims && !room && !product && !notes) continue;

    windows.push({
      windowNumber: item || `W${windows.length + 1}`,
      room: room || windowType || `Window ${windows.length + 1}`,
      type: typeInfo.type,
      subType: typeInfo.subType,
      productLabel: resolvedProductLabel,
      width: dims ? String(dims.width) : "",
      drop: dims ? String(dims.drop) : "",
      fitMode,
      fitLabel,
      layoutCode,
      color,
      midRailPosition: midRail != null ? midRail : null,
      notes: buildWindowNotes([
        layoutCode ? `Layout: ${layoutCode}` : "",
        panels ? `Panels: ${panels}` : "",
        blade ? `Blade: ${blade}` : "",
        notes,
      ]),
    });
  }
  return windows;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { fileName, fileData } = JSON.parse(event.body || "{}");
    if (!fileData) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing fileData" }),
      };
    }

    const buffer = Buffer.from(String(fileData), "base64");
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("Workbook did not contain any sheets");
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });

    const customerName = findValueNearLabel(rows, [/customer name/, /^client name$/]);
    const customerNumber = findValueNearLabel(rows, [/customer no/, /customer number/, /client no/]);
    const phone = findValueNearLabel(rows, [/customer phone/, /^phone$/]);
    const address = findValueNearLabel(rows, [/installation address/, /delivery address/, /^address$/]);
    const materialCollection = findValueNearLabel(rows, [/material collection/, /collection address/]);
    const installerName = findValueNearLabel(rows, [/installer/]);
    const globalProductType = findValueNearLabel(rows, [/product type/]);
    const orderDate = parseDateValue(findValueNearLabel(rows, [/order date/, /^date$/])) || new Date().toISOString().slice(0, 10);
    const specialInstructions = extractSpecialInstructions(rows);

    const simplePageItems = extractSimplePageItems(workbook);
    const headerIndex = findHeaderRow(rows);
    const headerMap = headerIndex >= 0 ? mapHeaderIndexes(rows[headerIndex]) : {};
    const windows = buildWindows(rows, headerIndex, headerMap, globalProductType);

    const warnings = [];
    if (headerIndex < 0) warnings.push("Could not confidently identify the product table header row.");
    if (!windows.length) warnings.push("No install items were found in the sheet.");
    if (!customerName) warnings.push("Customer name was not found automatically.");
    if (!address) warnings.push("Installation address was not found automatically.");

    const job = {
      clientName: customerName,
      address,
      phone,
      email: "",
      date: orderDate,
      customerNumber,
      installerName,
      materialCollection,
      specialInstructions,
      sourceFileName: cleanValue(fileName || firstSheetName || "order-sheet.xlsx"),
      windows,
    };

    const workOrder = {
      customerName,
      customerNumber,
      customerPhone: phone,
      installerName,
      installationAddress: address,
      materialCollection,
      orderDate,
      sourceFileName: cleanValue(fileName || firstSheetName || "order-sheet.xlsx"),
      specialInstructions,
      items: (simplePageItems.length ? simplePageItems : windows.map((window, index) => ({
        itemNumber: window.windowNumber || String(index + 1),
        room: window.room || "",
        product: window.productLabel || "",
        size: window.width && window.drop ? `${window.width} x ${window.drop}` : "",
        fitType: window.fitLabel || "",
        layoutCode: window.layoutCode || "",
        rollType: /roller/i.test(window.productLabel || "") ? "Back Roll" : "",
        controlSide: /roller/i.test(window.productLabel || "") ? "Left" : "",
        comments: window.notes || "",
      }))).map((item) => ({
        itemNumber: item.itemNumber || "",
        room: item.room || "",
        product: item.product || "",
        size: item.size || "",
        fitType: item.fitType || "",
        layoutCode: item.layoutCode || "",
        rollType: item.rollType || "",
        controlSide: item.controlSide || "",
        comments: item.comments || "",
      })),
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        ok: true,
        sheetName: firstSheetName,
        warnings,
        job,
        workOrder,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message || "Import failed" }),
    };
  }
};
