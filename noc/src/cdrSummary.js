// Supplier weekly report: one line per number with CALLS / MINUTES / ACD / RATE / PAYOUT
// (e.g. Mediatel: CLIENT, TERMINATION, NUMBER, CALLS, MINUTES, ACD, RATE, PAYOUT).
// It has no dates or callers, so it becomes ONE unpaid weekly entry plus its lines.
import { norm } from "./cdrParse.js";

const need = ["calls", "minutes", "number", "payout"];
export const isSummaryRows = rows => rows.length > 0 && need.every(k => Object.keys(rows[0]).some(h => norm(h) === k));

const num = v => parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")) || 0;
const CUR = /(USDT|USD|EUR|GBP)/i;

export function parseSummaryRows(rows) {
  const lines = [];
  for (const r of rows) {
    const g = {}; Object.keys(r).forEach(k => { g[norm(k)] = r[k]; });
    const number = String(g.number ?? "").replace(/\D/g, "");
    if (number.length < 8) continue;                                   // TOTAL / blank lines
    const term = String(g.termination ?? "").trim();
    const [country, ...opr] = term.split(/\s+-\s+/);
    const cur = (String(g.rate ?? "") + " " + String(g.payout ?? "")).match(CUR);
    lines.push({
      number, calls: Math.round(num(g.calls)), minutes: num(g.minutes), acd: num(g.acd),
      rate: num(String(g.rate ?? "").split("-")[0]), payout: num(g.payout),
      currency: cur ? cur[1].toUpperCase() : "USD",
      country: (country || "").trim(), operator: opr.join(" - ").trim(),
      client: String(g.client ?? "").trim(),
    });
  }
  const total = { lines: lines.length, calls: 0, minutes: 0, payout: 0 };
  lines.forEach(l => { total.calls += l.calls; total.minutes += l.minutes; total.payout += l.payout; });
  total.minutes = Math.round(total.minutes * 100) / 100; total.payout = Math.round(total.payout * 10000) / 10000;
  return { lines, total, currencies: [...new Set(lines.map(l => l.currency))] };
}

const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
// Monday-Sunday week that contains `day`
export function weekOf(day) {
  const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const e = new Date(d); e.setDate(e.getDate() + 6);
  return { start: iso(d), end: iso(e) };
}
// last completed week (Monday-Sunday) - the default when the file shows no dates
export function lastWeek(today = new Date()) {
  const d = new Date(today); d.setDate(d.getDate() - 7);
  return weekOf(d);
}
// Looks for a period in the text above the table: "2026-09-07 to 2026-09-13", "07/09/2026 - 13/09/2026"...
export function detectWeek(pre = []) {
  const found = [];
  for (const t of pre) {
    for (const m of String(t).matchAll(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/g)) found.push(new Date(+m[1], +m[2] - 1, +m[3]));
  }
  if (found.length === 0) return null;
  found.sort((a, b) => a - b);
  const w = weekOf(found[0]);
  const span = (found[found.length - 1] - found[0]) / 86400000;
  return span <= 7 ? w : null;          // only trust a period that is (about) one week long
}
