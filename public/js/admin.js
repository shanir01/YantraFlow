/* YantraFlow ADMIN PANEL (#/admin) — only for admins (shanir01.ai@gmail.com + window.YF_ADMIN_EMAILS
   + users marked admin in the database). This page is only a UI guard: the real lock is Row Level
   Security (supabase/admin.sql) and the "admin" Edge Function, which checks the login token itself.
   Tabs: Overview · Users · Traffic · Videos · Site customise · Setup. Mobile-first, Roman Hinglish. */
(function () {
  "use strict";
  const C = window.YFSite;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const I = (n, s = 18, c) => window.yfIcon(n, s, c);
  const P = () => window.YFPlatform;
  const A = () => window.YFApp;
  const RT = () => window.YFSiteRT;
  const toast = (m, k) => A().toast(m, k);
  const TABS = [["overview", "layout-dashboard", "Overview"], ["users", "users", "Users"], ["traffic", "chart-column", "Traffic"], ["videos", "square-play", "Videos"], ["customize", "palette", "Site customise"], ["setup", "wrench", "Setup"]];
  const S = { check: null, checking: null, users: null, usersFrom: "", traffic: null, trafficAt: 0, videos: null, me: null };
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—");
  const fmtAgo = (d) => {
    if (!d) return "kabhi nahi";
    const s = (Date.now() - new Date(d).getTime()) / 1000;
    if (s < 60) return "abhi"; if (s < 3600) return Math.floor(s / 60) + " min pehle"; if (s < 86400) return Math.floor(s / 3600) + " ghante pehle";
    return Math.floor(s / 86400) + " din pehle";
  };
  const num = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
  const client = () => P().state.client;
  const user = () => P().state.user;

  // ---------------------------------------------------------------- access
  async function me() {
    if (S.me) return S.me;
    if (P().state.me) return (S.me = P().state.me);
    try { const { data, error } = await client().rpc("yf_me"); if (!error && data) S.me = data; } catch (_) { /* SQL not run yet */ }
    return S.me;
  }
  async function guard() {
    const st = P().state;
    if (st.mode !== "supabase" || !st.client) return { ok: false, reason: "web_only" };
    return C.adminGuard(user(), await me(), window.YF_ADMIN_EMAILS);
  }
  function isAdminQuick() {
    const st = P().state;
    return st.mode === "supabase" && C.adminGuard(st.user, st.me || S.me, window.YF_ADMIN_EMAILS).ok;
  }

  // ---------------------------------------------------------------- backend helpers
  async function fn(action, body) {
    const { data, error } = await client().functions.invoke("admin", { body: Object.assign({ action }, body || {}) });
    if (error) {
      let status = 0, msg = error.message || String(error);
      try { if (error.context && typeof error.context.status === "number") { status = error.context.status; const j = await error.context.clone().json(); if (j && j.error) msg = j.error; } } catch (_) { /* */ }
      const e = new Error(msg); e.status = status; e.fetch = /FunctionsFetchError|Failed to send|fetch/i.test(error.name + " " + error.message) && !status; throw e;
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }
  function fnState(e) { if (!e) return "ok"; if (e.status === 404 || e.fetch) return "missing"; if (e.status === 401 || e.status === 403) return "forbidden"; return "error"; }
  async function runCheck(force) {
    if (S.check && !force) return S.check;
    if (S.checking && !force) return S.checking;
    const c = client();
    S.checking = (async () => {
      const okq = async (p) => { try { const r = await p; return !r.error; } catch (_) { return false; } };
      const [settings, pageViews, videos, cloud, meRes, bucket, site, fnRes] = await Promise.all([
        okq(c.from("site_settings").select("id").limit(1)),
        okq(c.from("page_views").select("id", { count: "exact", head: true })),
        okq(c.from("videos").select("id").limit(1)),
        okq(c.from("yf_workflows").select("id").limit(1)),
        (async () => { try { const r = await c.rpc("yf_me"); return r.error ? null : r.data; } catch (_) { return null; } })(),
        okq(c.storage.from("videos").list("", { limit: 1 })),
        okq(c.storage.from("site").list("", { limit: 1 })),
        (async () => { try { return { ok: await fn("ping") }; } catch (e) { return { err: e }; } })(),
      ]);
      if (meRes) S.me = meRes;
      const r = { settings, pageViews, videos, profiles: !!meRes, cloud, bucket: bucket && site, isAdminDb: !!(meRes && meRes.is_admin), fn: fnRes.err ? fnState(fnRes.err) : "ok", fnError: fnRes.err ? fnRes.err.message : "" };
      S.check = Object.assign(r, C.setupChecklist(r));
      S.checking = null;
      return S.check;
    })();
    return S.checking;
  }

  // ---------------------------------------------------------------- shell
  function shell(tab, inner) {
    const ck = S.check;
    A().view().innerHTML = `<div class="page adm">
      <div class="adm-head"><div class="adm-t">${I("shield-check", 24)}<div><h1 class="h">Admin <span class="g">panel</span></h1><p class="sub">${esc((user() && user().email) || "")}</p></div></div>
        <a class="btn sm ghost" href="#/workflows">${I("arrow-left", 15)} Site</a></div>
      ${ck && !ck.ready && tab !== "setup" ? `<a class="adm-pend" href="#/admin/setup">${I("triangle-alert", 17)}<span><b>Setup pending (${ck.pending})</b> — kuch cheezein Supabase me baaki hain. Yahan tap karo, steps dikhenge.</span>${I("chevron-right", 16)}</a>` : ""}
      <nav class="adm-tabs" role="tablist">${TABS.map(([id, ic, label]) => `<a role="tab" href="#/admin/${id}" class="${id === tab ? "on" : ""}">${I(ic, 16)}<span>${label}</span>${id === "setup" && ck && !ck.ready ? `<i class="dot"></i>` : ""}</a>`).join("")}</nav>
      <div id="admBody">${inner}</div></div>`;
    const on = $(".adm-tabs a.on"); if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest", inline: "center" });
  }
  const body = () => $("#admBody");
  const loading = (t) => `<p class="sub adm-load">${I("loader-circle", 16, "spin")} ${esc(t || "Loading…")}</p>`;
  const missing = (what) => `<div class="card adm-miss">${I("database", 22)}<div><b>${esc(what)} abhi set nahi hai</b><p class="sub">Supabase me admin.sql Run karna baaki hai. <a href="#/admin/setup">Setup steps dekho</a></p></div></div>`;

  async function view(tab) {
    tab = TABS.some((t) => t[0] === tab) ? tab : "overview";
    A().setNav("admin");
    const g = await guard();
    if (!g.ok) return denied(g.reason);
    shell(tab, loading());
    runCheck().then(() => { if (location.hash.startsWith("#/admin") && !$(".adm-pend") && S.check && !S.check.ready && tab !== "setup") { const head = $(".adm-head"); if (head) head.insertAdjacentHTML("afterend", `<a class="adm-pend" href="#/admin/setup">${I("triangle-alert", 17)}<span><b>Setup pending (${S.check.pending})</b> — kuch cheezein Supabase me baaki hain. Yahan tap karo, steps dikhenge.</span>${I("chevron-right", 16)}</a>`); const st = $(".adm-tabs a[href='#/admin/setup']"); if (st && !st.querySelector(".dot")) st.insertAdjacentHTML("beforeend", `<i class="dot"></i>`); } });
    const V = { overview, users, traffic, videos, customize, setup }[tab];
    try { await V(); } catch (e) { body().innerHTML = `<div class="card adm-miss">${I("circle-alert", 22)}<div><b>Kuch gadbad hui</b><p class="sub">${esc(e.message)}</p></div></div>`; }
  }
  function denied(reason) {
    const msg = reason === "web_only" ? "Admin panel sirf website (login wale version) pe khulta hai." : reason === "blocked" ? "Aapka account block hai." : "Ye page sirf admin ke liye hai.";
    A().view().innerHTML = `<div class="page"><div class="empty"><div class="big">${I("lock", 44)}</div><h3>Access nahi hai</h3><p>${esc(msg)}</p><a class="btn" href="#/workflows">Wapas</a></div></div>`;
  }

  // ---------------------------------------------------------------- traffic data
  async function trafficRows() {
    if (S.traffic && Date.now() - S.trafficAt < 60000) return S.traffic;
    const since = new Date(Date.now() - 31 * 86400000).toISOString();
    const rows = []; const PAGE = 1000;
    for (let i = 0; i < 50; i++) {
      const { data, error } = await client().from("page_views").select("created_at,path,referrer,device,country,visitor_id").gte("created_at", since).order("created_at", { ascending: false }).range(i * PAGE, i * PAGE + PAGE - 1);
      if (error) { const e = new Error(error.message); e.missing = C.isMissingTable(error); throw e; }
      rows.push(...data); if (data.length < PAGE) break;
    }
    S.traffic = rows; S.trafficAt = Date.now();
    return rows;
  }
  function chartSvg(daily) {
    const W = 340, H = 130, pad = 4, n = daily.length, max = Math.max(1, ...daily.map((d) => d.views));
    const bw = (W - pad * 2) / n;
    const bars = daily.map((d, i) => { const h = Math.round((d.views / max) * (H - 22)); return `<rect x="${(pad + i * bw + 1).toFixed(1)}" y="${H - 14 - h}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${h}" rx="2" class="cb"><title>${d.day}: ${d.views} visits, ${d.uniques} unique</title></rect>`; }).join("");
    const pts = daily.map((d, i) => `${(pad + i * bw + bw / 2).toFixed(1)},${(H - 14 - (d.uniques / max) * (H - 22)).toFixed(1)}`).join(" ");
    const lab = (i) => { const d = daily[i]; return d ? new Date(d.day + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""; };
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Visits, last 30 days" preserveAspectRatio="none">${bars}<polyline points="${pts}" class="cl" fill="none"/><text x="${pad}" y="${H - 2}" class="ct">${lab(0)}</text><text x="${W / 2}" y="${H - 2}" class="ct" text-anchor="middle">${lab(Math.floor(n / 2))}</text><text x="${W - pad}" y="${H - 2}" class="ct" text-anchor="end">aaj</text><text x="${W - pad}" y="10" class="ct" text-anchor="end">max ${max}</text></svg>
      <div class="lg"><span><i class="lg-b"></i>Visits</span><span><i class="lg-l"></i>Unique visitors</span></div>`;
  }
  function barList(items, total, label) {
    if (!items.length) return `<p class="sub">Abhi data nahi.</p>`;
    return `<div class="bl">${items.map((x) => `<div class="bl-r"><span class="bl-k">${esc(label ? label(x.key) : x.key)}</span><span class="bl-n">${num(x.count)}</span><i style="width:${Math.max(3, Math.round((x.count / Math.max(1, total)) * 100))}%"></i></div>`).join("")}</div>`;
  }
  const PAGE_NAMES = { "/": "Home", "/workflows": "Workflows", "/projects": "Projects", "/login": "Login", "/signup": "Signup", "/keys": "Keys", "/runs": "Runs", "/videos": "Videos", "/editor/:id": "Editor", "/runs/:id": "Run detail", "/share/:id": "Shared link", "/profile": "Profile", "/settings": "Settings", "/templates": "Templates", "/about": "About", "/developer": "Developer" };
  const pageName = (p) => PAGE_NAMES[p] ? `${PAGE_NAMES[p]}  ${p}` : p;

  // ---------------------------------------------------------------- OVERVIEW
  async function overview() {
    body().innerHTML = `<div class="adm-stats" id="ovs">${["Users", "Workflows (cloud)", "Visits (30 din)", "Videos"].map((l) => `<div class="card st"><small>${l}</small><b>…</b></div>`).join("")}</div><div class="card" id="ovc">${loading("Traffic…")}</div><div id="ovk"></div>`;
    const c = client();
    const res = await Promise.allSettled([
      fn("stats").then((d) => d.users).catch(async () => { const r = await c.from("profiles").select("id", { count: "exact", head: true }); if (r.error) throw r.error; return r.count; }),
      c.rpc("yf_admin_workflow_counts").then((r) => { if (r.error) throw r.error; return (r.data || []).reduce((a, x) => a + Number(x.workflows || 0), 0); }),
      trafficRows().then((rows) => C.aggregateTraffic(rows)),
      c.from("videos").select("id", { count: "exact", head: true }).then((r) => { if (r.error) throw r.error; return r.count; }),
    ]);
    const v = (i) => (res[i].status === "fulfilled" ? res[i].value : null);
    const agg = v(2);
    const stats = [
      ["users", "Users", v(0), "Signed-up accounts"],
      ["workflow", "Workflows (cloud)", v(1), "Cloud sync wale"],
      ["chart-column", "Visits (30 din)", agg ? agg.d30 : null, agg ? `${num(agg.today)} aaj · ${num(agg.u30)} unique` : "page_views table chahiye"],
      ["square-play", "Videos", v(3), "Site pe videos"],
    ];
    $("#ovs").innerHTML = stats.map(([ic, l, n, sub]) => `<div class="card st">${I(ic, 18)}<small>${l}</small><b>${num(n)}</b><em>${esc(sub)}</em></div>`).join("");
    $("#ovc").innerHTML = agg ? `<h3 class="adm-h3">${I("activity", 17)} Last 30 din</h3>${chartSvg(agg.daily)}` : missing("Traffic (page_views)");
    $("#ovk").innerHTML = `<div class="adm-quick"><a class="card" href="#/admin/users">${I("users", 20)}<b>Users manage</b><small>block · delete · admin</small></a><a class="card" href="#/admin/videos">${I("video", 20)}<b>Video add karo</b><small>YouTube ya upload</small></a><a class="card" href="#/admin/customize">${I("palette", 20)}<b>Site customise</b><small>naam · logo · colors · banner</small></a><a class="card" href="#/admin/traffic">${I("chart-column", 20)}<b>Traffic</b><small>pages · referrers · devices</small></a></div>`;
  }

  // ---------------------------------------------------------------- USERS
  async function loadUsers() {
    try { const d = await fn("list", { per_page: 200 }); S.users = d.users; S.usersFrom = "fn"; return; }
    catch (e) { S.fnErr = e; }
    const r = await client().from("profiles").select("id,email,created_at,last_sign_in_at,last_seen_at,blocked,is_admin").order("created_at", { ascending: false }).limit(1000);
    if (r.error) { const e = new Error(r.error.message); e.missing = C.isMissingTable(r.error); throw e; }
    let counts = {};
    try { const w = await client().rpc("yf_admin_workflow_counts"); if (!w.error) for (const x of w.data || []) counts[x.user_id] = Number(x.workflows); } catch (_) { /* */ }
    const admins = C.adminList(window.YF_ADMIN_EMAILS);
    S.users = r.data.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, last_seen_at: u.last_seen_at, banned: u.blocked, is_admin: u.is_admin || admins.includes(String(u.email || "").toLowerCase()), primary: String(u.email || "").toLowerCase() === C.PRIMARY_ADMIN, workflows: counts[u.id] || 0 }));
    S.usersFrom = "db";
  }
  let userQ = "";
  async function users(force) {
    if (!S.users || force) { body().innerHTML = loading("Users…"); try { await loadUsers(); } catch (e) { body().innerHTML = e.missing ? missing("Users (profiles table)") : `<div class="card adm-miss">${I("circle-alert", 22)}<div><b>Users load nahi hue</b><p class="sub">${esc(e.message)}</p></div></div>`; return; } }
    renderUsers();
  }
  function renderUsers() {
    const myId = user() && user().id;
    const q = userQ.toLowerCase();
    const list = S.users.filter((u) => !q || String(u.email || "").toLowerCase().includes(q));
    const viaDb = S.usersFrom === "db";
    body().innerHTML = `${viaDb ? `<div class="card adm-note">${I("info", 17)}<span>Admin function abhi deploy nahi hai, isliye list database se aa rahi hai. Block = sirf website pe login band; <b>Delete</b> aur pakka block ke liye function deploy karo. <a href="#/admin/setup">Steps</a></span></div>` : ""}
      <div class="adm-bar"><input class="inp" id="uq" type="search" placeholder="Email se dhoondo…" value="${esc(userQ)}" aria-label="Search users"><button class="btn icon" id="ur" aria-label="Refresh" title="Refresh">${I("refresh-cw", 16)}</button></div>
      <p class="meta">${num(list.length)} of ${num(S.users.length)} users</p>
      <div class="ulist">${list.map((u) => `<div class="card urow ${u.banned ? "is-b" : ""}" data-u="${esc(u.id)}">
        <div class="u-top"><span class="ava ini" style="width:38px;height:38px;font-size:15px">${esc(String(u.email || "?")[0].toUpperCase())}</span><div class="u-id"><b>${esc(u.email || "(no email)")}</b>
          <div class="u-badges">${u.id === myId ? `<span class="bdg you">You</span>` : ""}${u.is_admin ? `<span class="bdg adm">${I("crown", 11)} Admin</span>` : ""}${u.banned ? `<span class="bdg blk">${I("ban", 11)} Blocked</span>` : ""}</div></div></div>
        <div class="u-meta"><span>${I("calendar-days", 13)} Signup: ${fmtDate(u.created_at)}</span><span>${I("log-out", 13)} Last login: ${fmtAgo(u.last_sign_in_at || u.last_seen_at)}</span><span>${I("workflow", 13)} ${num(u.workflows)} workflows</span></div>
        ${u.id === myId || u.primary ? "" : `<div class="u-act">
          <button class="btn sm" data-a="${u.banned ? "unblock" : "block"}">${I(u.banned ? "user-check" : "ban", 14)} ${u.banned ? "Unblock" : "Block"}</button>
          <button class="btn sm" data-a="${u.is_admin ? "unadmin" : "admin"}">${I("crown", 14)} ${u.is_admin ? "Admin hatao" : "Admin banao"}</button>
          <button class="btn sm danger ghost" data-a="delete" ${viaDb ? "disabled title=\"Admin function deploy karo\"" : ""}>${I("trash-2", 14)} Delete</button></div>`}
      </div>`).join("") || `<div class="empty"><p>Koi user nahi mila</p></div>`}</div>`;
    const uq = $("#uq"); uq.oninput = () => { userQ = uq.value; clearTimeout(uq._t); uq._t = setTimeout(() => { renderUsers(); const n = $("#uq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 200); };
    $("#ur").onclick = () => users(true);
    $$("[data-a]").forEach((b) => (b.onclick = () => userAction(b.closest("[data-u]").dataset.u, b.dataset.a, b)));
  }
  async function userAction(id, a, btn) {
    const u = S.users.find((x) => x.id === id); if (!u) return;
    const em = u.email || "is user";
    if (a === "delete" && !confirm(`${em} ko hamesha ke liye DELETE karna hai? Ye wapas nahi hoga.`)) return;
    if (a === "block" && !confirm(`${em} ko block karna hai? Wo login nahi kar payega.`)) return;
    btn.disabled = true; btn.classList.add("loading");
    try {
      if (S.usersFrom === "fn") {
        if (a === "admin" || a === "unadmin") await fn("set_admin", { user_id: id, value: a === "admin" });
        else await fn(a, { user_id: id });
      } else {
        const patch = a === "block" ? { blocked: true } : a === "unblock" ? { blocked: false } : a === "admin" ? { is_admin: true } : a === "unadmin" ? { is_admin: false } : null;
        if (!patch) throw new Error("Delete ke liye admin function deploy karo");
        const r = await client().from("profiles").update(patch).eq("id", id); if (r.error) throw new Error(r.error.message);
      }
      if (a === "delete") S.users = S.users.filter((x) => x.id !== id);
      if (a === "block") u.banned = true; if (a === "unblock") u.banned = false;
      if (a === "admin") u.is_admin = true; if (a === "unadmin") u.is_admin = false;
      toast({ delete: "User delete ho gaya", block: "User block ho gaya", unblock: "User unblock ho gaya", admin: "Admin bana diya", unadmin: "Admin hata diya" }[a], "ok");
      renderUsers();
    } catch (e) { toast(e.message, "err"); btn.disabled = false; btn.classList.remove("loading"); }
  }

  // ---------------------------------------------------------------- TRAFFIC
  async function traffic(force) {
    if (force) S.trafficAt = 0;
    body().innerHTML = loading("Traffic…");
    let rows;
    try { rows = await trafficRows(); } catch (e) { body().innerHTML = e.missing ? missing("Traffic (page_views table)") : `<div class="card adm-miss">${I("circle-alert", 22)}<div><b>Traffic load nahi hua</b><p class="sub">${esc(e.message)}</p></div></div>`; return; }
    const g = C.aggregateTraffic(rows);
    const dv = g.devices, dt = Math.max(1, dv.mobile + dv.tablet + dv.desktop);
    const pct = (n) => Math.round((n / dt) * 100);
    body().innerHTML = `<div class="adm-bar"><span class="meta">Apni website ka traffic — koi paid service nahi, koi personal data nahi.</span><button class="btn icon" id="tr" aria-label="Refresh">${I("refresh-cw", 16)}</button></div>
      <div class="adm-stats">${[["Aaj", g.today, g.u_today], ["7 din", g.d7, g.u7], ["30 din", g.d30, g.u30]].map(([l, v, u]) => `<div class="card st"><small>${l}</small><b>${num(v)}</b><em>${num(u)} unique visitors</em></div>`).join("")}</div>
      <div class="card"><h3 class="adm-h3">${I("activity", 17)} Visits — last 30 din</h3>${chartSvg(g.daily)}</div>
      <div class="adm-2">
        <div class="card"><h3 class="adm-h3">${I("file-text", 17)} Top pages</h3>${barList(g.topPages, g.d30, pageName)}</div>
        <div class="card"><h3 class="adm-h3">${I("link", 17)} Kahan se aaye (referrers)</h3>${barList(g.referrers, g.d30, (k) => (k === "direct" ? "Direct / app" : k))}</div>
        <div class="card"><h3 class="adm-h3">${I("smartphone", 17)} Device</h3>
          <div class="dev-bar"><i class="m" style="width:${pct(dv.mobile)}%"></i><i class="t" style="width:${pct(dv.tablet)}%"></i><i class="d" style="width:${pct(dv.desktop)}%"></i></div>
          <div class="dev-lg"><span>${I("smartphone", 14)} Mobile ${pct(dv.mobile)}%</span><span>${I("tablet", 14)} Tablet ${pct(dv.tablet)}%</span><span>${I("monitor", 14)} PC ${pct(dv.desktop)}%</span></div></div>
        <div class="card"><h3 class="adm-h3">${I("globe", 17)} Country (timezone se)</h3>${barList(g.countries, g.d30)}</div>
      </div>
      <p class="meta">${num(rows.length)} page views (31 din) padhe. Admin panel ke apne visits count nahi hote. Local PC/Termux version track nahi hota.</p>`;
    $("#tr").onclick = () => traffic(true);
  }

  // ---------------------------------------------------------------- VIDEOS
  async function loadVideos() {
    const r = await client().from("videos").select("*").order("sort", { ascending: true }).order("created_at", { ascending: true });
    if (r.error) { const e = new Error(r.error.message); e.missing = C.isMissingTable(r.error); throw e; }
    S.videos = r.data;
  }
  let vEdit = null;
  async function videos(force) {
    if (!S.videos || force) { body().innerHTML = loading("Videos…"); try { await loadVideos(); } catch (e) { body().innerHTML = e.missing ? missing("Videos table") : `<div class="card adm-miss">${I("circle-alert", 22)}<div><b>Videos load nahi hue</b><p class="sub">${esc(e.message)}</p></div></div>`; return; } }
    renderVideos();
  }
  function renderVideos() {
    const list = C.sortVideos(S.videos, true);
    const e = vEdit || { title: "", description: "", kind: "youtube", url: "", visible: true };
    body().innerHTML = `<form class="card vform" id="vf" novalidate><h3 class="adm-h3">${I(vEdit ? "pencil" : "plus", 17)} ${vEdit ? "Video edit karo" : "Naya video add karo"}</h3>
        <label class="lb" for="vt">Title</label><input class="inp" id="vt" maxlength="140" required value="${esc(e.title)}" placeholder="e.g. YantraFlow kaise use karein">
        <label class="lb" for="vd">Description (optional)</label><textarea class="inp" id="vd" rows="2" maxlength="600" placeholder="Chhota sa detail">${esc(e.description)}</textarea>
        <div class="seg vk" role="radiogroup"><label><input type="radio" name="vk" value="youtube" ${e.kind !== "file" ? "checked" : ""}> ${I("youtube", 15)} YouTube link</label><label><input type="radio" name="vk" value="file" ${e.kind === "file" ? "checked" : ""}> ${I("upload", 15)} File upload</label></div>
        <div id="vyt" class="${e.kind === "file" ? "hidden" : ""}"><label class="lb" for="vu">YouTube link</label><input class="inp" id="vu" inputmode="url" value="${esc(e.kind === "file" ? "" : e.url)}" placeholder="https://youtu.be/... ya youtube.com/shorts/..."></div>
        <div id="vfile" class="${e.kind === "file" ? "" : "hidden"}"><label class="lb" for="vfi">Video file (mp4, max 50 MB)</label><input class="inp" id="vfi" type="file" accept="video/mp4,video/webm,video/quicktime">${e.kind === "file" && e.url ? `<p class="help">Abhi wali file rahegi, nayi chuno to badal jayegi.</p>` : ""}</div>
        <label class="chk"><input type="checkbox" id="vv" ${e.visible !== false ? "checked" : ""}> Site pe dikhao</label>
        <div class="auth-msg" id="vm" role="alert"></div>
        <div class="row"><button class="btn primary" id="vs">${I("save", 15)} ${vEdit ? "Save" : "Add video"}</button>${vEdit ? `<button type="button" class="btn ghost" id="vc">Cancel</button>` : ""}</div></form>
      <div class="adm-bar"><h3 class="adm-h3" style="margin:0">${I("list", 17)} ${num(list.length)} videos</h3><a class="btn sm" href="#/videos">${I("eye", 14)} Public page</a></div>
      <div class="vlist">${list.map((r, i) => { const pv = C.parseVideo(r); return `<div class="card vrow ${r.visible === false ? "is-h" : ""}" data-v="${esc(r.id)}">
        <div class="v-th">${pv && pv.kind === "youtube" ? `<img src="${esc(pv.thumb)}" alt="" loading="lazy">` : I(r.kind === "file" ? "film" : "circle-alert", 26)}</div>
        <div class="v-in"><b>${esc(r.title)}</b><small>${r.kind === "file" ? "Uploaded file" : "YouTube"} · ${r.visible === false ? "Hidden" : "Dikh raha hai"}${pv ? "" : " · link galat"}</small>
          <div class="v-act"><button class="btn icon sm" data-va="up" ${i === 0 ? "disabled" : ""} aria-label="Upar">${I("arrow-up", 15)}</button><button class="btn icon sm" data-va="down" ${i === list.length - 1 ? "disabled" : ""} aria-label="Neeche">${I("arrow-down", 15)}</button><button class="btn icon sm" data-va="vis" aria-label="${r.visible === false ? "Show" : "Hide"}" title="${r.visible === false ? "Show" : "Hide"}">${I(r.visible === false ? "eye-off" : "eye", 15)}</button><button class="btn icon sm" data-va="edit" aria-label="Edit">${I("pencil", 15)}</button><button class="btn icon sm danger ghost" data-va="del" aria-label="Delete">${I("trash-2", 15)}</button></div></div></div>`; }).join("") || `<div class="empty"><div class="big">${I("square-play", 40)}</div><p>Abhi koi video nahi. Upar se pehla video add karo.</p></div>`}</div>`;
    $$("input[name=vk]").forEach((r) => (r.onchange = () => { const f = $("input[name=vk]:checked").value === "file"; $("#vyt").classList.toggle("hidden", f); $("#vfile").classList.toggle("hidden", !f); }));
    $("#vc") && ($("#vc").onclick = () => { vEdit = null; renderVideos(); });
    $("#vf").onsubmit = saveVideo;
    $$("[data-va]").forEach((b) => (b.onclick = () => videoAction(b.closest("[data-v]").dataset.v, b.dataset.va, b)));
  }
  async function saveVideo(ev) {
    ev.preventDefault();
    const m = $("#vm"); const say = (t, k) => { m.className = "auth-msg " + (k || "err"); m.textContent = t; };
    const title = $("#vt").value.trim(), description = $("#vd").value.trim(), kind = $("input[name=vk]:checked").value, visible = $("#vv").checked;
    if (!title) return say("Title likho");
    const row = { title, description, kind, visible };
    const btn = $("#vs"); btn.disabled = true; btn.classList.add("loading");
    try {
      if (kind === "youtube") {
        const url = $("#vu").value.trim();
        if (!C.youtubeId(url)) throw new Error("YouTube link sahi nahi lag raha (youtu.be/… ya youtube.com/watch?v=…)");
        row.url = url; row.storage_path = null;
      } else {
        const f = $("#vfi").files[0];
        if (!f && !(vEdit && vEdit.kind === "file")) throw new Error("Video file chuno");
        if (f) {
          if (f.size > 50 * 1024 * 1024) throw new Error("File 50 MB se badi hai (Supabase free limit). Badi video YouTube pe daal ke link do.");
          say("Upload ho raha hai… (" + Math.round(f.size / 1048576) + " MB)", "ok");
          const path = "v/" + Date.now() + "-" + f.name.replace(/[^a-z0-9._-]/gi, "_").slice(-60);
          const up = await client().storage.from("videos").upload(path, f, { contentType: f.type || "video/mp4", upsert: false });
          if (up.error) throw new Error("Upload fail: " + up.error.message + (/bucket/i.test(up.error.message) ? " — Setup tab dekho" : ""));
          row.url = client().storage.from("videos").getPublicUrl(path).data.publicUrl; row.storage_path = path;
        }
      }
      let r;
      if (vEdit) r = await client().from("videos").update(row).eq("id", vEdit.id);
      else { row.sort = (S.videos || []).reduce((a, v) => Math.max(a, v.sort || 0), 0) + 10; r = await client().from("videos").insert(row); }
      if (r.error) throw new Error(r.error.message);
      toast(vEdit ? "Video save ho gaya" : "Video add ho gaya", "ok");
      vEdit = null; await videos(true);
    } catch (e) { say(e.message); btn.disabled = false; btn.classList.remove("loading"); }
  }
  async function videoAction(id, a, btn) {
    const list = C.sortVideos(S.videos, true); const i = list.findIndex((v) => v.id === id); const v = list[i]; if (!v) return;
    try {
      btn.disabled = true;
      if (a === "edit") { vEdit = v; renderVideos(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
      if (a === "vis") { const r = await client().from("videos").update({ visible: v.visible === false }).eq("id", id); if (r.error) throw new Error(r.error.message); }
      if (a === "up" || a === "down") {
        const j = a === "up" ? i - 1 : i + 1; const o = list[j]; if (!o) return;
        list.splice(i, 1); list.splice(j, 0, v);
        const ups = list.map((x, k) => ({ id: x.id, sort: (k + 1) * 10 })).filter((x) => list.find((y) => y.id === x.id).sort !== x.sort);
        for (const u of ups) { const r = await client().from("videos").update({ sort: u.sort }).eq("id", u.id); if (r.error) throw new Error(r.error.message); }
      }
      if (a === "del") {
        if (!confirm(`"${v.title}" delete karna hai?`)) { btn.disabled = false; return; }
        const r = await client().from("videos").delete().eq("id", id); if (r.error) throw new Error(r.error.message);
        if (v.storage_path) await client().storage.from("videos").remove([v.storage_path]).catch(() => {});
        toast("Video delete ho gaya", "ok");
      }
      await videos(true);
    } catch (e) { toast(e.message, "err"); btn.disabled = false; }
  }

  // ---------------------------------------------------------------- SITE CUSTOMISE
  async function customize() {
    let s = RT().settings, dbOk = true;
    const r = await client().from("site_settings").select("data,updated_at,updated_by").eq("id", 1).maybeSingle();
    if (r.error) dbOk = false; else s = C.mergeSettings(r.data ? r.data.data : null);
    const meta = r.data && r.data.updated_at ? `Last save: ${fmtAgo(r.data.updated_at)}${r.data.updated_by ? " · " + esc(r.data.updated_by) : ""}` : "";
    const tg = (id, label, on, help) => `<label class="tgl"><span><b>${label}</b>${help ? `<small>${help}</small>` : ""}</span><span class="switch"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span class="tr"></span></span></label>`;
    const tx = (id, label, val, ph, max, area) => `<label class="lb" for="${id}">${label}</label>${area ? `<textarea class="inp" id="${id}" rows="2" maxlength="${max}" placeholder="${esc(ph)}">${esc(val)}</textarea>` : `<input class="inp" id="${id}" maxlength="${max}" value="${esc(val)}" placeholder="${esc(ph)}">`}`;
    body().innerHTML = `${dbOk ? "" : missing("site_settings table")}
      <form id="cf" class="cust" novalidate>
      <div class="card"><h3 class="adm-h3">${I("tag", 17)} Brand</h3>
        ${tx("c_name", "Site name", s.site_name, "YantraFlow", 40)}
        <label class="lb">Logo</label><div class="logo-row"><img id="c_lprev" src="${esc(s.logo_url || "img/logo.svg")}" alt=""><div style="flex:1;min-width:0"><input class="inp" id="c_logo" inputmode="url" value="${esc(s.logo_url)}" placeholder="https://… (khaali = default logo)"><label class="btn sm" style="margin-top:8px">${I("upload", 14)} Logo upload<input type="file" id="c_lfile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label></div></div>
        <div class="colors"><label>${"Primary color"}<input type="color" id="c_p" value="${esc(s.primary_color)}"><code id="c_pv">${esc(s.primary_color)}</code></label><label>Accent color<input type="color" id="c_a" value="${esc(s.accent_color)}"><code id="c_av">${esc(s.accent_color)}</code></label></div>
        <div class="grad-prev" id="c_gp"></div></div>
      <div class="card"><h3 class="adm-h3">${I("sparkles", 17)} Hero (login / signup screen + Projects page)</h3>
        ${tx("c_ht", "Hero title", s.hero_title, "Free automation for phone & PC", 120)}
        ${tx("c_hs", "Hero subtitle", s.hero_subtitle, "Ek line me batao site kya karti hai", 240, true)}</div>
      <div class="card"><h3 class="adm-h3">${I("megaphone", 17)} Announcement banner</h3>
        ${tg("c_bon", "Banner ON", s.banner_on, "Sabko upar ek patti dikhegi")}
        ${tx("c_bt", "Banner text", s.banner_text, "e.g. Naya: Instagram auto-post aa gaya!", 240)}
        <div class="seg bk" role="radiogroup">${[["info", "Blue"], ["ok", "Green"], ["warn", "Yellow"]].map(([k, l]) => `<label><input type="radio" name="bk" value="${k}" ${s.banner_kind === k ? "checked" : ""}> ${l}</label>`).join("")}</div></div>
      <div class="card"><h3 class="adm-h3">${I("toggle-right", 17)} Features</h3>
        ${tg("c_su", "Naye signup ON", s.signups_enabled, "OFF karne pe signup form band (pakka band: Supabase → Auth → 'Allow new users to sign up' OFF)")}
        ${tx("c_suo", "Signup band ka message", s.signups_off_message, "", 240)}
        ${tg("c_mo", "Maintenance banner", s.maintenance_on, "Sabko yellow maintenance patti dikhegi")}
        ${tx("c_mt", "Maintenance text", s.maintenance_text, "", 240)}
        ${tg("c_ve", "Videos / Tutorials page", s.videos_enabled, "Footer + menu me Videos link")}
        ${tg("c_an", "Traffic analytics", s.analytics_enabled, "Anonymous page views (koi email/IP nahi)")}</div>
      <div class="card"><h3 class="adm-h3">${I("mail", 17)} Footer + contact</h3>
        ${tx("c_ft", "Footer text", s.footer_text, "Created by …", 200)}
        ${tx("c_ce", "Contact email", s.contact_email, "you@gmail.com", 120)}
        ${[["instagram", "Instagram"], ["youtube", "YouTube"], ["telegram", "Telegram"], ["github", "GitHub"]].map(([k, l]) => `<label class="lb" for="c_s_${k}">${I(k, 14)} ${l}</label><input class="inp" id="c_s_${k}" inputmode="url" value="${esc(s.social[k])}" placeholder="https://…">`).join("")}</div>
      <div class="auth-msg" id="cm" role="alert"></div>
      <div class="cust-save"><button class="btn primary big" id="cs" ${dbOk ? "" : "disabled"}>${I("save", 16)} Save — sabke liye live</button><button type="button" class="btn ghost" id="cr">Default pe reset</button><span class="meta">${meta}</span></div>
      </form>`;
    const read = () => C.mergeSettings({
      site_name: $("#c_name").value, logo_url: $("#c_logo").value, primary_color: $("#c_p").value, accent_color: $("#c_a").value,
      hero_title: $("#c_ht").value, hero_subtitle: $("#c_hs").value, banner_on: $("#c_bon").checked, banner_text: $("#c_bt").value, banner_kind: ($("input[name=bk]:checked") || {}).value,
      signups_enabled: $("#c_su").checked, signups_off_message: $("#c_suo").value, maintenance_on: $("#c_mo").checked, maintenance_text: $("#c_mt").value,
      videos_enabled: $("#c_ve").checked, analytics_enabled: $("#c_an").checked, footer_text: $("#c_ft").value, contact_email: $("#c_ce").value,
      social: { instagram: $("#c_s_instagram").value, youtube: $("#c_s_youtube").value, telegram: $("#c_s_telegram").value, github: $("#c_s_github").value },
    });
    const preview = () => { const n = read(); RT().apply(n); $("#c_pv").textContent = n.primary_color; $("#c_av").textContent = n.accent_color; $("#c_gp").style.background = C.themeVars(n)["--grad"]; $("#c_lprev").src = n.logo_url || "img/logo.svg"; };
    $("#cf").oninput = preview; $("#cf").onchange = preview; preview();
    $("#c_lfile").onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (f.size > 2 * 1024 * 1024) return toast("Logo 2 MB se chhota rakho", "err");
      try {
        toast("Logo upload ho raha hai…");
        const ext = (f.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z]/g, "") || "png";
        const path = "logo-" + Date.now() + "." + ext;
        const up = await client().storage.from("site").upload(path, f, { contentType: f.type, upsert: true });
        if (up.error) throw new Error(up.error.message);
        $("#c_logo").value = client().storage.from("site").getPublicUrl(path).data.publicUrl; preview();
        toast("Logo upload ho gaya — ab Save dabao", "ok");
      } catch (err) { toast("Logo upload fail: " + err.message + " (Setup tab dekho)", "err"); }
    };
    $("#cr").onclick = () => { if (!confirm("Saari settings default pe karni hain? (Save dabane pe lagu hogi)")) return; RT().apply(C.mergeSettings(null)); customizeFill(C.mergeSettings(null)); };
    function customizeFill(n) { $("#c_name").value = n.site_name; $("#c_logo").value = n.logo_url; $("#c_p").value = n.primary_color; $("#c_a").value = n.accent_color; $("#c_ht").value = n.hero_title; $("#c_hs").value = n.hero_subtitle; $("#c_bon").checked = n.banner_on; $("#c_bt").value = n.banner_text; $("#c_su").checked = n.signups_enabled; $("#c_suo").value = n.signups_off_message; $("#c_mo").checked = n.maintenance_on; $("#c_mt").value = n.maintenance_text; $("#c_ve").checked = n.videos_enabled; $("#c_an").checked = n.analytics_enabled; $("#c_ft").value = n.footer_text; $("#c_ce").value = n.contact_email; for (const k of Object.keys(n.social)) $("#c_s_" + k).value = n.social[k]; preview(); }
    $("#cf").onsubmit = async (e) => {
      e.preventDefault();
      const n = read(); const btn = $("#cs"); const m = $("#cm");
      btn.disabled = true; btn.classList.add("loading");
      try {
        const r = await client().from("site_settings").upsert({ id: 1, data: n, updated_at: new Date().toISOString(), updated_by: (user() && user().email) || "" }, { onConflict: "id" });
        if (r.error) throw new Error(r.error.message);
        try { localStorage.setItem("yf_site_settings", JSON.stringify(n)); } catch (_) { /* */ }
        await RT().loadSettings();
        m.className = "auth-msg ok"; m.textContent = "Save ho gaya — sabke liye live (unke next page load pe).";
        toast("Settings save ho gayi", "ok");
      } catch (err) { m.className = "auth-msg err"; m.textContent = "Save nahi hua: " + err.message; }
      finally { btn.disabled = false; btn.classList.remove("loading"); }
    };
  }

  // ---------------------------------------------------------------- SETUP
  const STEPS_URL = "https://github.com/shanir01/YantraFlow#admin-panel";
  async function setup() {
    body().innerHTML = loading("Supabase check ho raha hai…");
    const ck = await runCheck(true);
    const ref = (String(window.YF_SUPABASE_URL || "").match(/https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || "YOUR-PROJECT";
    body().innerHTML = `<div class="card ${ck.ready ? "adm-ok" : ""}"><h3 class="adm-h3">${I(ck.ready ? "circle-check" : "list-checks", 17)} ${ck.ready ? "Sab set hai" : `Setup checklist — ${ck.pending} baaki`}</h3>
        <ul class="ck">${ck.items.map((i) => `<li class="${i.ok ? "ok" : i.optional ? "opt" : "no"}">${I(i.ok ? "circle-check" : i.optional ? "info" : "circle-x", 18)}<div><b>${esc(i.title)}${i.optional ? " <small>(optional)</small>" : ""}</b>${i.ok ? "" : `<small>${esc(i.fix)}</small>`}</div></li>`).join("")}</ul>
        ${ck.fn === "missing" ? `<p class="help">Function "admin" abhi deploy nahi hua (Supabase ne 404 diya). Step 2 dekho.</p>` : ck.fn !== "ok" && ck.fnError ? `<p class="help">Function ka jawab: ${esc(ck.fnError)}</p>` : ""}
        <button class="btn" id="rc">${I("refresh-cw", 15)} Dobara check karo</button></div>
      <div class="card steps-card"><h3 class="adm-h3">${I("database", 17)} Step 1 — SQL Run karo (2 min)</h3>
        <ol class="steps"><li><a href="https://supabase.com/dashboard/project/${ref}/sql/new" target="_blank" rel="noopener">Supabase SQL Editor kholo ${I("external-link", 13)}</a> (apne account se login)</li><li>Neeche <b>SQL copy karo</b> dabao</li><li>SQL Editor me paste karo → <b>Run</b> dabao</li><li>"Success. No rows returned" aaye to ho gaya</li></ol>
        <div class="row"><button class="btn primary" data-copy="admin-setup/admin-sql.txt">${I("copy", 15)} SQL copy karo</button><a class="btn ghost" href="admin-setup/admin-sql.txt" target="_blank" rel="noopener">${I("file-text", 15)} Dekho</a></div></div>
      <div class="card steps-card"><h3 class="adm-h3">${I("code", 17)} Step 2 — Admin function deploy karo (3 min)</h3>
        <ol class="steps"><li><a href="https://supabase.com/dashboard/project/${ref}/functions" target="_blank" rel="noopener">Edge Functions kholo ${I("external-link", 13)}</a></li><li><b>Deploy a new function</b> → <b>Via Editor</b></li><li>Function name: <code>admin</code> (bilkul yahi)</li><li>Editor ka code hata ke <b>Function code copy karo</b> wala paste karo → <b>Deploy</b></li><li>Function → <b>Details/Settings</b> → <b>Verify JWT</b> (Enforce JWT) <b>OFF</b> → Save. (Function khud login check karta hai.)</li></ol>
        <div class="row"><button class="btn primary" data-copy="admin-setup/admin-function.txt">${I("copy", 15)} Function code copy karo</button></div>
        <p class="help">CLI se: <code>supabase functions deploy admin --no-verify-jwt --project-ref ${esc(ref)}</code>. Secret key kabhi website me mat daalna — function ko Supabase khud deta hai.</p></div>
      <div class="card"><h3 class="adm-h3">${I("info", 17)} Optional</h3><ul class="steps plain"><li>Workflow count ke liye: <b>docs/supabase-setup.sql</b> bhi Run karo (cloud sync). <button class="linkbtn" data-copy="admin-setup/cloud-sync-sql.txt">Copy</button></li><li>Aur admin chahiye: Users tab → "Admin banao".</li><li>Signup pakka band: Authentication → Sign In / Providers → "Allow new users to sign up" OFF.</li></ul></div>`;
    $("#rc").onclick = () => setup();
    $$("[data-copy]").forEach((b) => (b.onclick = async () => {
      try { const t = await (await fetch(b.dataset.copy, { cache: "no-store" })).text(); await navigator.clipboard.writeText(t); toast("Copy ho gaya — ab Supabase me paste karo", "ok"); }
      catch (_) { window.open(b.dataset.copy, "_blank"); }
    }));
  }

  window.YFAdmin = { view, guard, isAdminQuick, runCheck, state: S, fn };
})();
