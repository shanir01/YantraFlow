/* YantraFlow schedules — "Run once / Repeat every N / Daily at HH:MM".
   Shared by the PC/Termux server (always-on) and the website (runs while the tab is open).
   Rule: a repeating schedule can never be faster than every 30 minutes (spam / ban safety). MIT License. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFSchedule = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MIN_MINUTES = 30;
  const DEFAULT_TZ = "Asia/Kolkata";
  const UNIT_MIN = { minutes: 1, hours: 60, days: 1440 };

  function validTz(tz) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0); return true; } catch (_) { return false; }
  }
  function parseAt(at) {
    const m = String(at || "").trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]); const mi = Number(m[2]);
    if (h > 23 || mi > 59) return null;
    return { h, mi };
  }
  /* -> { schedule, warnings[] }. Throws only for things that cannot be fixed (bad time). */
  function normalize(input) {
    const i = input || {};
    const warnings = [];
    const mode = ["once", "every", "daily"].includes(i.mode) ? i.mode : "every";
    let unit = UNIT_MIN[i.unit] ? i.unit : "minutes";
    let every = Math.floor(Number(i.every));
    if (!(every >= 1)) every = mode === "every" ? 60 : 1;
    if (mode === "every" && every * UNIT_MIN[unit] < MIN_MINUTES) {
      warnings.push(`Minimum ${MIN_MINUTES} minute ka gap hai (spam/ban se bachne ke liye) — ${every} ${unit} ko ${MIN_MINUTES} minutes kar diya.`);
      every = MIN_MINUTES; unit = "minutes";
    }
    let at = String(i.at || "09:00").trim();
    if (mode === "daily") {
      const p = parseAt(at);
      if (!p) throw new Error(`Time "${at}" galat hai — HH:MM likho, jaise 09:30 ya 18:00`);
      at = String(p.h).padStart(2, "0") + ":" + String(p.mi).padStart(2, "0");
    }
    let tz = String(i.tz || DEFAULT_TZ).trim();
    if (!validTz(tz)) { warnings.push(`Timezone "${tz}" nahi mila — ${DEFAULT_TZ} use kiya.`); tz = DEFAULT_TZ; }
    return { schedule: { mode, every, unit, at, tz, enabled: i.enabled !== false && mode !== "once" }, warnings };
  }
  function intervalMs(s) { return Math.max(MIN_MINUTES, (Number(s.every) || 0) * (UNIT_MIN[s.unit] || 1)) * 60000; }

  // wall-clock parts of `ms` in time zone `tz`
  function parts(ms, tz) {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const o = {};
    for (const p of f.formatToParts(new Date(ms))) if (p.type !== "literal") o[p.type] = Number(p.value);
    if (o.hour === 24) o.hour = 0;
    return o;
  }
  function offsetMs(ms, tz) {
    const p = parts(ms, tz);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  }
  // first time strictly after `afterMs` when the clock in tz shows HH:MM
  function nextDaily(at, tz, afterMs) {
    const t = parseAt(at) || { h: 9, mi: 0 };
    const p = parts(afterMs, tz);
    for (let add = 0; add < 3; add++) {
      const guess = Date.UTC(p.year, p.month - 1, p.day + add, t.h, t.mi, 0);
      let ms = guess - offsetMs(guess, tz);
      ms = guess - offsetMs(ms, tz); // second pass handles a DST change between the two
      if (ms > afterMs) return ms;
    }
    return afterMs + 86400000;
  }
  /* When should this schedule run next?
     state: { startedAt, lastRunAt } (ms or ISO). Missed runs (PC off, tab closed) run ONCE, as soon as possible. */
  function nextRun(s, state, now) {
    if (!s || !s.enabled || s.mode === "once") return null;
    now = now == null ? Date.now() : now;
    const st = state || {};
    const toMs = (v) => (v == null ? null : typeof v === "number" ? v : Date.parse(v));
    const last = toMs(st.lastRunAt); const started = toMs(st.startedAt);
    if (s.mode === "every") {
      const base = last != null ? last : started != null ? started : now;
      return base + intervalMs(s); // <= now means "due now" (a missed run runs once, then the gap restarts)
    }
    // daily
    const after = last != null ? last : started != null ? started : now;
    const n = nextDaily(s.at, s.tz || DEFAULT_TZ, after);
    return n <= now ? now : n;
  }
  function isDue(s, state, now) {
    const n = nextRun(s, state, now);
    return n != null && n <= (now == null ? Date.now() : now);
  }
  function fmt(ms, tz) {
    if (ms == null) return "-";
    try {
      return new Intl.DateTimeFormat("en-IN", { timeZone: tz || DEFAULT_TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(ms));
    } catch (_) { return new Date(ms).toISOString(); }
  }
  function describe(s) {
    if (!s) return "Schedule off";
    if (s.mode === "once") return "Sirf ek baar";
    if (s.mode === "daily") return `Roz ${s.at} baje (${s.tz || DEFAULT_TZ})`;
    const u = { minutes: "minute", hours: "ghante", days: "din" }[s.unit] || s.unit;
    return `Har ${s.every} ${u} me`;
  }
  return { MIN_MINUTES, DEFAULT_TZ, normalize, intervalMs, nextRun, nextDaily, isDue, fmt, describe, validTz };
});
