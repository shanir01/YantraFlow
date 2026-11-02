"use strict";
// Tiny 5-field cron parser (minute hour day-of-month month day-of-week).
// Supports: *  */n  a-b  a-b/n  a,b,c  and names (jan, mon). Written for YantraFlow, no deps.

const RANGES = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 7],  // day of week (0 or 7 = Sunday)
];
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const DAYS = ["sun","mon","tue","wed","thu","fri","sat"];

const ALIASES = {
  "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *",
};

function nameToNum(s, idx) {
  const low = s.toLowerCase();
  if (idx === 3) { const i = MONTHS.indexOf(low); if (i >= 0) return i + 1; }
  if (idx === 4) { const i = DAYS.indexOf(low); if (i >= 0) return i; }
  if (!/^\d+$/.test(s)) throw new Error(`bad cron value "${s}"`);
  return parseInt(s, 10);
}

function parseField(field, idx) {
  const [min, max] = RANGES[idx];
  const set = new Set();
  for (const part of field.split(",")) {
    if (!part) throw new Error("empty cron part");
    let [range, stepStr] = part.split("/");
    const step = stepStr === undefined ? 1 : parseInt(stepStr, 10);
    if (!(step >= 1)) throw new Error(`bad cron step "${part}"`);
    let lo, hi;
    if (range === "*") { lo = min; hi = max; }
    else if (range.includes("-")) {
      const [a, b] = range.split("-");
      lo = nameToNum(a, idx); hi = nameToNum(b, idx);
    } else {
      lo = nameToNum(range, idx);
      hi = stepStr === undefined ? lo : max;
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`cron value out of range in "${part}"`);
    for (let v = lo; v <= hi; v += step) set.add(idx === 4 && v === 7 ? 0 : v);
  }
  return set;
}

function parseCron(expr) {
  if (typeof expr !== "string") throw new Error("cron expression must be text");
  let e = expr.trim();
  if (ALIASES[e.toLowerCase()]) e = ALIASES[e.toLowerCase()];
  const fields = e.split(/\s+/);
  if (fields.length !== 5) throw new Error(`cron needs 5 fields (minute hour day month weekday), got ${fields.length}: "${expr}"`);
  const sets = fields.map((f, i) => parseField(f, i));
  return {
    minute: sets[0], hour: sets[1], dom: sets[2], month: sets[3], dow: sets[4],
    domStar: fields[2] === "*", dowStar: fields[4] === "*",
  };
}

function cronMatches(cron, date) {
  const c = typeof cron === "string" ? parseCron(cron) : cron;
  if (!c.minute.has(date.getMinutes())) return false;
  if (!c.hour.has(date.getHours())) return false;
  if (!c.month.has(date.getMonth() + 1)) return false;
  const domOk = c.dom.has(date.getDate());
  const dowOk = c.dow.has(date.getDay());
  // Classic cron rule: if both day fields are restricted, either may match.
  if (!c.domStar && !c.dowStar) return domOk || dowOk;
  if (!c.domStar) return domOk;
  if (!c.dowStar) return dowOk;
  return true;
}

function nextRun(cron, from = new Date()) {
  const c = typeof cron === "string" ? parseCron(cron) : cron;
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 60 * 24 * 366 * 2; i++) {
    if (cronMatches(c, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

module.exports = { parseCron, cronMatches, nextRun };
