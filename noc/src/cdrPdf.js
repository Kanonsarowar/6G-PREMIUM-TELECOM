// Reads a supplier CDR PDF (e.g. Mediatel) into row objects like a csv would give
// ({ "Started time": "...", "A-number": "...", ... }), ready for mapCdrRows().
//
// 1. Text items are placed on the page (x, y) and grouped into lines and cells.
// 2. If a header row is found (cells like Date, CLI, PRN, Duration...), each value is
//    assigned to the header column it sits under - so empty cells and repeated
//    headers on later pages are handled.
// 3. Otherwise each line is read as text: date + time, the long phone numbers,
//    a duration ("2.317 min" / "00:02:19") and the amount before the currency code.
import { COLS, norm } from "./cdrParse.js";

const ALIASES = new Set(Object.values(COLS).flat());
const MON = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*";
const DATE_RE = new RegExp("\\d{1,4}[\\/.-]\\d{1,2}[\\/.-]\\d{1,4}|\\d{1,2}[ -]" + MON + "\\.?[ ,-]+\\d{2,4}", "i");

// pdf.js text items -> lines of cells (sorted top to bottom, left to right)
export function itemsToLines(pages) {
  const lines = [];
  pages.forEach((items, pageNo) => {
    const rows = [];
    items.filter(i => String(i.str).trim() !== "").forEach(i => {
      let row = rows.find(r => Math.abs(r.y - i.y) <= 2.5);
      if (!row) { row = { y: i.y, items: [] }; rows.push(row); }
      row.items.push(i);
    });
    rows.sort((a, b) => b.y - a.y).forEach(r => {
      r.items.sort((a, b) => a.x - b.x);
      const cells = [];
      r.items.forEach(i => {
        const last = cells[cells.length - 1];
        const charW = i.w / Math.max(String(i.str).length, 1) || 4;
        // same cell when the gap is smaller than ~2 characters
        if (last && i.x - (last.x + last.w) < charW * 2) {
          last.text += (i.x - (last.x + last.w) > charW * 0.4 ? " " : "") + i.str.trim();
          last.w = i.x + i.w - last.x;
        } else cells.push({ text: i.str.trim(), x: i.x, w: i.w });
      });
      lines.push({ page: pageNo, cells });
    });
  });
  return lines;
}

const headerScore = cells => cells.filter(c => ALIASES.has(norm(c.text))).length;
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));

const isSummaryHeader = cells => { const n = cells.map(c => norm(c.text)); return n.includes("calls") && n.includes("minutes") && n.includes("number"); };

function tableRows(lines) {
  const out = [];
  const pre = [];                 // text above the table (report title, period...)
  let header = null, summary = false;
  for (const ln of lines) {
    if (headerScore(ln.cells) >= 3 || isSummaryHeader(ln.cells)) { header = ln.cells; summary = isSummaryHeader(ln.cells); continue; }
    if (!header) { if (pre.length < 25) pre.push(ln.cells.map(c => c.text).join(" ")); continue; }
    // call rows carry a date; weekly summary rows carry a long number instead (TOTAL lines have neither)
    if (summary ? !ln.cells.some(c => /^\d{8,15}$/.test(c.text.replace(/\s/g, ""))) : !ln.cells.some(c => DATE_RE.test(c.text))) continue;
    const row = {}; header.forEach(h => { row[h.text] = ""; });
    ln.cells.forEach(c => {
      let best = null, bestOv = 0;
      header.forEach(h => { const o = overlap(c, h); if (o > bestOv) { bestOv = o; best = h; } });
      if (!best) {                                                      // no overlap: nearest column centre
        const mid = c.x + c.w / 2; let d = Infinity;
        header.forEach(h => { const dd = Math.abs(h.x + h.w / 2 - mid); if (dd < d) { d = dd; best = h; } });
      }
      row[best.text] = (row[best.text] ? row[best.text] + " " : "") + c.text;
    });
    out.push(row);
  }
  return { rows: out, pre, summary };
}

function textRows(lines) {
  const out = [];
  const dateTime = new RegExp("(" + DATE_RE.source + ")(?:[ T,-]+(\\d{1,2}:\\d{2}(?::\\d{2})?))?", "i");
  for (const ln of lines) {
    const t = ln.cells.map(c => c.text).join("  ");
    const d = t.match(dateTime);
    if (!d) continue;
    const rest = t.replace(d[0], " ");
    const nums = (rest.match(/\+?\b\d{8,15}\b/g) || []).map(x => x.replace("+", ""));
    if (nums.length < 1) continue;
    const dur = rest.match(/(\d+(?:\.\d+)?)\s*min/i) || rest.match(/\b(\d{1,2}:\d{2}:\d{2})\b/);
    const cur = rest.match(/\b(EUR|USD|USDT|GBP)\b/);
    const dec = (rest.replace(/\b\d{8,15}\b/g, " ").match(/\d+\.\d+/g) || []).filter(x => !(dur && dur[0].startsWith(x)));
    let amount = "";
    if (cur) { const before = rest.slice(0, cur.index).match(/\d+\.\d+/g); amount = before ? before[before.length - 1] : ""; }
    else if (dec.length) amount = dec[dec.length - 1];
    out.push({
      "Started time": d[1] + (d[2] ? " " + d[2] : ""),
      "A-number": nums[0] || "", "B-number": nums[1] || "",
      Duration: dur ? dur[0] : "", Amount: amount, C: cur ? cur[1] : "",
    });
  }
  return out;
}

export function linesToRows(lines) {
  // first lines of text found in the PDF, shown to the user when nothing could be read
  const sample = lines.slice(0, 12).map(l => l.cells.map(c => c.text).join(" | ")).join("\n");
  const t = tableRows(lines);
  if (t.rows.length) return { rows: t.rows, mode: t.summary ? "summary" : "table", pre: t.pre, sample, lineCount: lines.length };
  return { rows: textRows(lines), mode: "text", sample, lineCount: lines.length };
}

// pdfjs: the pdf.js module (loaded on demand by the caller)
export async function readPdfRows(arrayBuffer, pdfjs) {
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    pages.push(tc.items.filter(i => typeof i.str === "string").map(i => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
  }
  return linesToRows(itemsToLines(pages));
}
