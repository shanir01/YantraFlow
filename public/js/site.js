/* YantraFlow site runtime: applies the admin's Site customise settings for EVERY visitor,
   records anonymous page views (first-party, no personal data) and renders the public
   Videos / Tutorials page. Works with plain fetch + the publishable key (RLS protects writes).
   If the admin SQL was never run, everything falls back to defaults silently. */
(function () {
  "use strict";
  const C = window.YFSite;
  const URL_ = window.YF_SUPABASE_URL, KEY = window.YF_SUPABASE_KEY;
  const CACHE = "yf_site_settings";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const I = (n, s, c) => (window.yfIcon ? window.yfIcon(n, s, c) : "");
  let settings = C.mergeSettings((() => { try { return JSON.parse(localStorage.getItem(CACHE) || "null"); } catch (_) { return null; } })());
  let tableOk = null; // null = unknown, true = site_settings exists, false = missing

  function rest(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ apikey: KEY, authorization: "Bearer " + (opts.token || KEY) }, opts.headers || {});
    return fetch(URL_ + "/rest/v1/" + path, { method: opts.method || "GET", headers, body: opts.body, keepalive: !!opts.keepalive, cache: "no-store" });
  }
  const isLocalHost = () => /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|\[::1\])/.test(location.hostname) || location.protocol === "file:";

  // ---------------------------------------------------------------- settings
  async function loadSettings() {
    if (!URL_ || !KEY) return settings;
    try {
      const r = await rest("site_settings?id=eq.1&select=data,updated_at");
      if (!r.ok) { tableOk = false; return settings; }
      const rows = await r.json();
      tableOk = true;
      settings = C.mergeSettings(rows && rows[0] ? rows[0].data : null);
      try { localStorage.setItem(CACHE, JSON.stringify(settings)); } catch (_) { /* full */ }
      apply();
    } catch (_) { /* offline: cached/defaults stay */ }
    return settings;
  }
  function apply(s) {
    s = s || settings;
    const root = document.documentElement;
    const vars = C.themeVars(s);
    for (const k of Object.keys(vars)) root.style.setProperty(k, vars[k]);
    const name = s.site_name || "YantraFlow";
    const logoSpan = document.querySelector(".topbar .logo > span");
    if (logoSpan) logoSpan.innerHTML = `${esc(name)}<small>by Nishu</small>`;
    for (const img of document.querySelectorAll(".topbar .logo-img, .sp-logo, .auth-logo")) img.src = s.logo_url || "img/logo.svg";
    if (!document.title.startsWith(name)) document.title = document.title.replace(/^[^—]+/, name + " ");
    const an = document.querySelector(".auth-name"); if (an && name !== "YantraFlow") an.textContent = name;
    const at = document.querySelector(".auth-tag"); if (at && s.hero_title) at.textContent = s.hero_title;
    banners(s); footer(s);
  }
  function banners(s) {
    let box = document.getElementById("sitebanners");
    if (!box) { box = document.createElement("div"); box.id = "sitebanners"; const tb = document.querySelector(".topbar"); if (tb && tb.parentNode) tb.parentNode.insertBefore(box, tb.nextSibling); else document.body.prepend(box); }
    const out = [];
    const key = (t) => "site-" + String(t || "").split("").reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 7).toString(36); // new text = shows again
    const cl = (id, html) => (window.YFGuideUI ? window.YFGuideUI.closable(id, html, "sb-wrap") : html);
    if (s.maintenance_on) out.push(cl(key(s.maintenance_text), `<div class="sb sb-warn" role="status">${I("wrench", 15)}<span>${esc(s.maintenance_text)}</span></div>`));
    if (s.banner_on && s.banner_text) out.push(cl(key(s.banner_text), `<div class="sb sb-${esc(s.banner_kind)}" role="status">${I("megaphone", 15)}<span>${esc(s.banner_text)}</span></div>`));
    box.innerHTML = out.join("");
  }
  function socialLinks(s) {
    const L = [["instagram", "Instagram"], ["youtube", "YouTube"], ["telegram", "Telegram"], ["github", "GitHub"]];
    return L.filter(([k]) => s.social[k]).map(([k, n]) => `<a href="${esc(s.social[k])}" target="_blank" rel="noopener" aria-label="${n}" title="${n}">${I(k, 18)}</a>`).join("");
  }
  function footer(s) {
    let f = document.getElementById("sitefoot");
    if (!f) { f = document.createElement("footer"); f.id = "sitefoot"; const v = document.getElementById("view"); if (v && v.parentNode) v.parentNode.insertBefore(f, v.nextSibling); else document.body.appendChild(f); }
    f.innerHTML = `<div class="sf-in"><div class="sf-soc">${socialLinks(s)}</div>
      <div class="sf-tx">${esc(s.footer_text)}${s.contact_email ? ` · <a href="mailto:${esc(s.contact_email)}">${esc(s.contact_email)}</a>` : ""}</div>
      ${s.videos_enabled ? `<a class="sf-v" href="#/videos">${I("square-play", 14)} Videos / Tutorials</a>` : ""}</div>`;
    syncFooter();
  }
  function syncFooter() {
    const f = document.getElementById("sitefoot"); if (!f) return;
    const h = location.hash || "";
    f.classList.toggle("hidden", h.startsWith("#/editor") || document.body.classList.contains("auth-on"));
  }

  // ---------------------------------------------------------------- analytics (anonymous)
  function visitorId() {
    let v = ""; try { v = localStorage.getItem("yf_vid") || ""; } catch (_) { /* */ }
    if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).slice(0, 36); try { localStorage.setItem("yf_vid", v); } catch (_) { /* */ } }
    return v;
  }
  let lastPath = "", lastAt = 0, firstHit = true;
  function track() {
    syncFooter();
    if (!URL_ || !KEY || window.YF_ANALYTICS === false || !settings.analytics_enabled || isLocalHost()) return null;
    const row = C.buildPageView({ hash: location.hash, referrer: firstHit ? document.referrer : "", host: location.hostname, ua: navigator.userAgent, tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone, visitorId: visitorId() });
    firstHit = false;
    if (row.path === "/admin") return null;               // admin's own clicks are not traffic
    if (row.path === lastPath && Date.now() - lastAt < 15000) return null;
    lastPath = row.path; lastAt = Date.now();
    rest("page_views", { method: "POST", headers: { "content-type": "application/json", prefer: "return=minimal" }, body: JSON.stringify(row), keepalive: true }).catch(() => {});
    return row;
  }
  let tmr = 0;
  window.addEventListener("hashchange", () => { clearTimeout(tmr); tmr = setTimeout(track, 400); });

  // ---------------------------------------------------------------- public videos page
  async function fetchVideos(token, all) {
    const r = await rest("videos?select=*&order=sort.asc,created_at.asc" + (all ? "" : "&visible=eq.true"), { token });
    if (!r.ok) { const j = await r.json().catch(() => ({})); const e = new Error(j.message || ("HTTP " + r.status)); e.code = j.code; e.status = r.status; throw e; }
    return r.json();
  }
  function videoCard(v) {
    if (v.kind === "file") return `<article class="card vid"><div class="vid-m"><video controls preload="metadata" playsinline src="${esc(v.src)}"></video></div><h3>${esc(v.title)}</h3>${v.description ? `<p>${esc(v.description)}</p>` : ""}</article>`;
    return `<article class="card vid"><button class="vid-m vid-yt" data-embed="${esc(v.embed)}" aria-label="Play ${esc(v.title)}"><img loading="lazy" src="${esc(v.thumb)}" alt=""><span class="vid-play">${I("play", 26)}</span></button><h3>${esc(v.title)}</h3>${v.description ? `<p>${esc(v.description)}</p>` : ""}<a class="meta" href="${esc(v.watch)}" target="_blank" rel="noopener">${I("youtube", 13)} YouTube pe kholo</a></article>`;
  }
  async function viewVideos() {
    const A = window.YFApp; if (A && A.setNav) A.setNav("videos");
    const v = document.getElementById("view");
    v.innerHTML = `<div class="page"><div class="hero-h"><div><h1 class="h">Videos <span class="g">/ Tutorials</span></h1><p class="sub">${esc(settings.site_name)} kaise use karein — step by step.</p></div></div><div id="vids"><p class="sub">${I("loader-circle", 16, "spin")} Loading…</p></div></div>`;
    let rows = [];
    try { rows = await fetchVideos(); } catch (_) { rows = []; }
    const list = C.sortVideos(rows).map(C.parseVideo).filter(Boolean);
    const box = document.getElementById("vids"); if (!box) return;
    box.innerHTML = list.length ? `<div class="grid vid-grid">${list.map(videoCard).join("")}</div>` : `<div class="empty"><div class="big">${I("square-play", 44)}</div><h3>Abhi koi video nahi</h3><p>Jaldi hi tutorials aayenge.</p></div>`;
    for (const b of box.querySelectorAll("[data-embed]")) b.onclick = () => { b.outerHTML = `<div class="vid-m"><iframe src="${esc(b.dataset.embed)}" title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`; };
  }

  apply();
  loadSettings();
  if (document.readyState === "complete") track(); else window.addEventListener("load", () => setTimeout(track, 300));
  window.YFSiteRT = { get settings() { return settings; }, get tableOk() { return tableOk; }, loadSettings, apply, track, fetchVideos, viewVideos, videoCard, rest, syncFooter };
})();
