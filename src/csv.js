"use strict";
// Small CSV parser (quotes, commas inside quotes, CRLF). First row = headers.
function parseCsvRows(text) {
  const rows = []; let row = []; let cur = ""; let q = false;
  text = String(text).replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = ""; rows.push(row); row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
function parseCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const head = rows[0].map((h, i) => h.trim() || `col${i + 1}`);
  return rows.slice(1).map((r, idx) => {
    const o = { _row: idx + 2 };
    head.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
}
module.exports = { parseCsv };
