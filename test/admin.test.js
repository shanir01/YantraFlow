"use strict";
// v4.2: Admin panel — admin guard, site settings defaults, anonymous analytics payload,
// traffic aggregation, videos, setup checklist, and the Supabase SQL / Edge Function files.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");
const C = require("../public/js/site-core.js");
const yfIcon = require("../public/js/icons.js");
const EMOJI = /(?![\u2713\u2717\u2715])[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

test("admin guard: only admin emails (or DB admins) open #/admin", () => {
  const ADMIN = { id: "a", email: "Shanir01.AI@gmail.com" };
  assert.deepEqual(C.adminGuard(ADMIN, null, []), { ok: true, reason: "email" });
  assert.equal(C.adminGuard(null, null, []).reason, "login");
  assert.equal(C.adminGuard({ id: "x" }, null, []).reason, "login");
  assert.equal(C.adminGuard({ id: "b", email: "random@gmail.com" }, null, []).ok, false);
  assert.equal(C.adminGuard({ id: "b", email: "random@gmail.com" }, { is_admin: false }, []).reason, "not_admin");
  // extra admins from config (array or comma string), case-insensitive
  assert.equal(C.adminGuard({ id: "c", email: "helper@x.com" }, null, ["HELPER@x.com"]).ok, true);
  assert.equal(C.isAdminEmail("two@y.com", "one@x.com, two@y.com"), true);
  // made admin in the database (profiles.is_admin)
  assert.deepEqual(C.adminGuard({ id: "d", email: "d@x.com" }, { is_admin: true }, []), { ok: true, reason: "db" });
  // "true"-ish strings are not admin; a blocked user never gets in
  assert.equal(C.adminGuard({ id: "d", email: "d@x.com" }, { is_admin: "true" }, []).ok, false);
  assert.equal(C.adminGuard({ id: "d", email: "d@x.com" }, { is_admin: true, blocked: true }, []).reason, "blocked");
  assert.ok(C.adminList([]).includes("shanir01.ai@gmail.com"));
});

test("site settings: sane defaults when the table is missing or data is garbage", () => {
  for (const raw of [null, undefined, "x", 5, [], {}]) {
    const s = C.mergeSettings(raw);
    assert.equal(s.site_name, "YantraFlow");
    assert.equal(s.primary_color, "#7c5cff");
    assert.equal(s.signups_enabled, true);
    assert.equal(s.banner_on, false);
    assert.equal(s.maintenance_on, false);
    assert.equal(typeof s.social, "object");
  }
  const s = C.mergeSettings({ site_name: "  My Flow ", primary_color: "#FF0000", accent_color: "red", banner_on: "yes", signups_enabled: false,
    logo_url: "javascript:alert(1)", social: { github: "http://insecure.example", instagram: "https://instagram.com/nishu" }, contact_email: "bad", banner_kind: "evil", hero_title: "x".repeat(500) });
  assert.equal(s.site_name, "My Flow");
  assert.equal(s.primary_color, "#ff0000");
  assert.equal(s.accent_color, "#00d4ff");          // invalid colour -> default
  assert.equal(s.banner_on, false);                  // non-boolean ignored
  assert.equal(s.signups_enabled, false);
  assert.equal(s.logo_url, "");                      // only https links
  assert.equal(s.social.github, "");
  assert.equal(s.social.instagram, "https://instagram.com/nishu");
  assert.equal(s.contact_email, "shanir01.ai@gmail.com");
  assert.equal(s.banner_kind, "info");
  assert.equal(s.hero_title.length, 120);
  assert.equal(C.mergeSettings({ site_name: "   " }).site_name, "YantraFlow");
  const v = C.themeVars(s);
  assert.equal(v["--a1"], "#ff0000");
  assert.match(v["--grad"], /linear-gradient\(135deg,#ff0000 0%,#00d4ff 100%\)/);
  // defaults object can't be mutated by a merge
  s.social.youtube = "changed"; assert.notEqual(C.DEFAULT_SETTINGS.social.youtube, "changed");
});

test("analytics payload: anonymous, no ids / share codes / query strings", () => {
  const row = C.buildPageView({ hash: "#/editor/wf_8sk2?token=abc", referrer: "https://www.instagram.com/p/xyz?igsh=123", host: "yantraflow.sites.tab.bot",
    ua: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36", tz: "Asia/Kolkata", visitorId: "3f2a-<script>-9" });
  assert.deepEqual(Object.keys(row).sort(), ["country", "device", "path", "referrer", "visitor_id"]);
  assert.deepEqual(row, { path: "/editor/:id", referrer: "instagram.com", device: "mobile", country: "IN", visitor_id: "3f2a-script-9" });
  assert.equal(C.cleanPath("#/share/eyJub2RlcyI6W119"), "/share/:id");
  assert.equal(C.cleanPath("#/runs/123"), "/runs/:id");
  assert.equal(C.cleanPath("#/project/telegram-autopost"), "/project/telegram-autopost");
  assert.equal(C.cleanPath("#access_token=secret&type=signup"), "/");
  assert.equal(C.cleanPath(""), "/");
  assert.equal(C.cleanPath("#/admin/users"), "/admin");
  assert.equal(C.refHost("https://yantraflow.sites.tab.bot/#/x", "yantraflow.sites.tab.bot"), "direct");
  assert.equal(C.refHost("", "a"), "direct");
  assert.equal(C.refHost("not a url", "a"), "direct");
  assert.equal(C.deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "tablet");
  assert.equal(C.deviceOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), "desktop");
  assert.equal(C.countryFromTz("America/New_York"), "US");
  assert.equal(C.countryFromTz("Mars/Base"), "");
  // no email or user id ever appears even if passed in
  const r2 = C.buildPageView({ hash: "#/workflows", email: "a@b.com", userId: "u1" });
  assert.doesNotMatch(JSON.stringify(r2), /a@b\.com|u1/);
  assert.equal(r2.visitor_id, "anon");
});

test("traffic: today / 7d / 30d, uniques, top pages, referrers, devices (Asia/Kolkata days)", () => {
  const now = new Date("2026-11-02T14:00:00Z"); // 19:30 IST
  const rows = [
    { created_at: "2026-11-02T13:00:00Z", path: "/workflows", referrer: "direct", device: "mobile", country: "IN", visitor_id: "a" },
    { created_at: "2026-11-02T12:00:00Z", path: "/projects", referrer: "instagram.com", device: "mobile", country: "IN", visitor_id: "a" },
    { created_at: "2026-11-01T19:00:00Z", path: "/workflows", referrer: "direct", device: "desktop", country: "US", visitor_id: "b" }, // 00:30 IST Nov 2 -> today
    { created_at: "2026-10-30T10:00:00Z", path: "/workflows", referrer: "youtube.com", device: "tablet", country: "", visitor_id: "c" },
    { created_at: "2026-10-10T10:00:00Z", path: "/login", referrer: "direct", device: "mobile", country: "IN", visitor_id: "d" },
    { created_at: "2026-09-01T10:00:00Z", path: "/old", referrer: "direct", device: "mobile", visitor_id: "e" }, // > 30 days: ignored
  ];
  const g = C.aggregateTraffic(rows, now);
  assert.deepEqual([g.today, g.d7, g.d30], [3, 4, 5]);
  assert.deepEqual([g.u_today, g.u7, g.u30], [2, 3, 4]);
  assert.equal(g.daily.length, 30);
  assert.equal(g.daily[29].day, "2026-11-02");
  assert.equal(g.daily[29].views, 3);
  assert.deepEqual(g.topPages[0], { key: "/workflows", count: 3 });
  assert.deepEqual(g.referrers[0], { key: "direct", count: 3 });
  assert.deepEqual(g.devices, { mobile: 3, tablet: 1, desktop: 1 });
  assert.deepEqual(C.aggregateTraffic([], now).daily.reduce((a, d) => a + d.views, 0), 0);
});

test("videos: YouTube links and uploaded files, order and hidden ones", () => {
  for (const u of ["https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3", "https://youtube.com/shorts/dQw4w9WgXcQ?si=x", "dQw4w9WgXcQ"]) assert.equal(C.youtubeId(u), "dQw4w9WgXcQ", u);
  assert.equal(C.youtubeId("https://vimeo.com/123"), "");
  const yt = C.parseVideo({ title: "Intro", kind: "youtube", url: "https://youtu.be/dQw4w9WgXcQ" });
  assert.equal(yt.embed, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0");
  assert.equal(C.parseVideo({ title: "F", kind: "file", url: "https://kp.supabase.co/storage/v1/object/public/videos/v/1.mp4" }).kind, "file");
  assert.equal(C.parseVideo({ title: "Bad", kind: "file", url: "http://x/1.mp4" }), null);
  const rows = [{ id: 1, sort: 20 }, { id: 2, sort: 10 }, { id: 3, sort: 5, visible: false }];
  assert.deepEqual(C.sortVideos(rows).map((r) => r.id), [2, 1]);
  assert.deepEqual(C.sortVideos(rows, true).map((r) => r.id), [3, 2, 1]);
});

test("setup checklist: detects what's missing instead of failing silently", () => {
  const none = C.setupChecklist({ fn: "missing" });
  assert.equal(none.ready, false);
  assert.equal(none.pending, 4);
  assert.match(none.items.find((i) => i.id === "fn").fix, /Verify JWT OFF/);
  const all = C.setupChecklist({ settings: true, pageViews: true, videos: true, profiles: true, bucket: true, fn: "ok", isAdminDb: true, cloud: false });
  assert.equal(all.ready, true);                    // cloud sync is optional
  assert.match(C.setupChecklist({ fn: "forbidden" }).items.find((i) => i.id === "fn").fix, /ADMIN_EMAILS/);
  assert.equal(C.isMissingTable({ code: "PGRST205", message: "Could not find the table 'public.videos' in the schema cache" }), true);
  assert.equal(C.isMissingTable({ code: "42501", message: "permission denied" }), false);
});

test("Supabase files: SQL has RLS for every admin table; the Edge Function checks the caller and keeps the service key server-side", () => {
  const sql = fs.readFileSync(path.join(ROOT, "supabase", "admin.sql"), "utf8");
  for (const t of ["profiles", "site_settings", "page_views", "videos"]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${t}`));
    assert.match(sql, new RegExp(`alter table public\\.${t} enable row level security`));
  }
  assert.match(sql, /'shanir01\.ai@gmail\.com'/);
  assert.match(sql, /page_views admin read.*yf_is_admin/);
  assert.match(sql, /storage\.buckets/);
  assert.doesNotMatch(sql, /service_role|sb_secret_/i);
  const fn = fs.readFileSync(path.join(ROOT, "supabase", "functions", "admin", "index.ts"), "utf8");
  assert.match(fn, /auth\.getUser\(token\)/);
  assert.match(fn, /admin only/);
  assert.match(fn, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  for (const a of ["list", "block", "unblock", "delete", "set_admin", "ping"]) assert.match(fn, new RegExp(`action === "${a}"`));
  // the copies the panel's "Copy" buttons serve are identical
  assert.equal(fs.readFileSync(path.join(PUB, "admin-setup", "admin-sql.txt"), "utf8"), sql);
  assert.equal(fs.readFileSync(path.join(PUB, "admin-setup", "admin-function.txt"), "utf8"), fn);
  // no secret key anywhere in the website
  for (const f of ["config.js", "js/admin.js", "js/site.js", "js/site-core.js"]) {
    const src = fs.readFileSync(path.join(PUB, f), "utf8");
    assert.doesNotMatch(src, /sb_secret_|service_role|eyJhbGciOi/, f);
  }
});

test("admin UI: bundled icons only, no emoji, wired into the router", () => {
  for (const f of ["js/admin.js", "js/site.js", "js/site-core.js", "css/admin.css"]) {
    const src = fs.readFileSync(path.join(PUB, f), "utf8");
    assert.equal(src.match(EMOJI), null, f);
    for (const m of src.matchAll(/\bI\("([a-z0-9-]+)"/g)) assert.ok(yfIcon.has(m[1]), `${f}: icon ${m[1]}`);
  }
  const html = fs.readFileSync(path.join(PUB, "index.html"), "utf8");
  assert.ok(html.indexOf("js/site-core.js") < html.indexOf("js/site.js") && html.indexOf("js/admin.js") < html.indexOf("js/platform.js"));
  assert.match(fs.readFileSync(path.join(PUB, "js", "app.js"), "utf8"), /v === "admin"/);
  assert.match(fs.readFileSync(path.join(PUB, "config.js"), "utf8"), /YF_ADMIN_EMAILS/);
});
