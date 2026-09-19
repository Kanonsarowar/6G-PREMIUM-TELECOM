// Turns rows read from a supplier CDR file (csv/xlsx) into the shape the
// /supplier-accounts/{id}/cdr-import endpoint expects.

export const norm = k => String(k).toLowerCase().replace(/[\s_.\-\/()]+/g, "");

export const COLS = {
  cli: ["cli", "caller", "callerid", "clid", "ani", "src", "source", "anumber", "from", "originator"],
  prn: ["prn", "number", "dst", "destination", "did", "dnis", "called", "calledparty", "bnumber", "to", "callee", "msisdn", "dialed"],
  call_date: ["calldate", "date", "datetime", "start", "started", "startedtime", "startedat", "starttime", "calltime", "time", "timestamp", "setuptime", "connecttime", "callstart", "begin"],
  duration: ["billsec", "billedduration", "duration", "callduration", "talktime", "seconds", "sec"],
  payout: ["payout", "amount", "cost", "totalcost", "charge", "price", "revenue", "value"],
  payout_per_min: ["payoutpermin", "rate", "ratepermin", "permin"],
  country: ["country"],
  operator: ["operator", "network"],
  currency_code: ["currencycode", "currency", "cur", "c"],
  account: ["account", "agent"],
  sub_account: ["subaccount"],
};

const num = v => parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, "")) || 0;
const pad = n => String(n).padStart(2, "0");
const clean = v => String(v ?? "").trim().replace(/^\+/, "").replace(/\s+/g, "");

// "2.317 min" -> 139, "00:02:19" -> 139, "139" -> 139
export function parseDuration(v) {
  const s = String(v ?? "").trim();
  if (s === "") return 0;
  if (/^\d+:\d{2}(:\d{2})?$/.test(s)) {
    const p = s.split(":").map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  }
  if (/min/i.test(s)) return Math.round(num(s) * 60);
  return Math.round(num(s));
}

const RE_DMY = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s*[-,T ]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
const RE_MON = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{2,4})(?:[\s,T-]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const RE_YMD = /^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:\s*[-,T ]\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

// -> "YYYY-MM-DD HH:MM:SS" or null. dayFirst decides 01/02/2026 = 1 Feb vs 2 Jan.
export function normalizeDate(v, dayFirst) {
  const s = String(v ?? "").trim();
  let y, mo, d, m;
  if ((m = s.match(RE_YMD))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(RE_MON)) && MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) >= 0) {
    y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1; d = +m[1];
  } else if ((m = s.match(RE_DMY))) { y = +m[3]; mo = dayFirst ? +m[2] : +m[1]; d = dayFirst ? +m[1] : +m[2]; }
  else return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad(mo)}-${pad(d)} ${pad(m[4] || 0)}:${pad(m[5] || 0)}:${pad(m[6] || 0)}`;
}

// Works out whether 09/13/2026-style dates are month-first or day-first by
// looking for a part greater than 12 anywhere in the file.
function detectDayFirst(values) {
  let dayFirst = null;
  for (const v of values) {
    const m = String(v ?? "").trim().match(RE_DMY);
    if (!m || RE_YMD.test(String(v).trim())) continue;
    if (+m[1] > 12) return { dayFirst: true, certain: true };
    if (+m[2] > 12) dayFirst = false;
  }
  return dayFirst === false ? { dayFirst: false, certain: true } : { dayFirst: false, certain: false };
}

// dayFirstOverride: true/false forces DD/MM or MM/DD for ambiguous dates (null = detect)
export function mapCdrRows(rawRows, dayFirstOverride = null) {
  const pick = raw => {
    const byName = {};
    Object.keys(raw).forEach(k => { byName[norm(k)] = raw[k]; });
    const out = {};
    for (const [field, names] of Object.entries(COLS)) {
      for (const n of names) {
        if (byName[n] !== undefined && String(byName[n]).trim() !== "") { out[field] = byName[n]; break; }
      }
    }
    return out;
  };
  const picked = rawRows.map(pick);
  const det = detectDayFirst(picked.map(r => r.call_date));
  const dayFirst = dayFirstOverride === null ? det.dayFirst : dayFirstOverride;
  const certain = dayFirstOverride === null ? det.certain : true;

  const rows = [];
  const seen = new Set();
  let repeats = 0;
  for (const r of picked) {
    const call_date = normalizeDate(r.call_date, dayFirst);
    const cli = clean(r.cli), prn = clean(r.prn);
    if (!call_date || (!cli && !prn)) continue;
    const key = `${cli}|${prn}|${call_date}`;
    if (seen.has(key)) repeats++; else seen.add(key);
    const cur = String(r.currency_code ?? "").trim();
    rows.push({
      cli, prn, call_date,
      billsec: parseDuration(r.duration),
      payout: num(r.payout),
      payout_per_min: num(r.payout_per_min),
      country: r.country ?? null,
      operator: r.operator ?? null,
      ...( /^[A-Za-z]{3,5}$/.test(cur) ? { currency_code: cur.toUpperCase() } : {} ),
      account: r.account ?? null,
      sub_account: r.sub_account ?? null,
    });
  }
  return {
    rows,
    total: rawRows.length,
    repeats,
    dateFormat: dayFirst ? "DD/MM/YYYY" : "MM/DD/YYYY",
    dateCertain: certain,
  };
}
