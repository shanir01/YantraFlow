/* YantraFlow platform layer: logo, login (website = Supabase email+password,
   local full version = one-time password from the terminal), profile, settings,
   about, developer and the PUBLIC PROJECTS gallery. Vanilla JS, no build step. */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LOGO = "img/logo.svg";
  const DEV = { name: "Nirbhay Sharma", nick: "Nishu", github: "https://github.com/shanir01", youtube: "https://www.youtube.com/@JavaGoat9", telegram: "https://t.me/javagoat", email: "shanir01.ai@gmail.com", repo: "https://github.com/shanir01/YantraFlow" };
  const CATS = ["All", "YouTube", "Instagram", "Telegram", "Gmail", "AI Content", "Video"];

  // ---------------------------------------------------------------- prefs + i18n
  const prefs = Object.assign({ theme: "dark", lang: "en" }, (() => { try { return JSON.parse(localStorage.getItem("yf_prefs") || "{}"); } catch (_) { return {}; } })());
  function savePrefs() { localStorage.setItem("yf_prefs", JSON.stringify(prefs)); }
  function applyTheme() { document.documentElement.dataset.theme = prefs.theme; document.documentElement.lang = prefs.lang === "hi" ? "hi-Latn" : "en"; }
  applyTheme();
  const STR = {
    workflows: ["Workflows", "Workflows"], projects: ["Projects", "Projects"], runs: ["Runs", "Runs"], keys: ["Keys", "Keys"], me: ["Me", "Main"], templates: ["Templates", "Templates"],
    login: ["Log in", "Log in"], signup: ["Sign up", "Sign up"], email: ["Email", "Email"], password: ["Password", "Password"],
    loginTitle: ["Welcome back", "Wapas swagat hai"], signupTitle: ["Create your free account", "Apna FREE account banao"],
    loginSub: ["Log in to your automations.", "Apni automations me log in karo."], signupSub: ["Free forever plan. Just email + password.", "Bilkul free. Bas email + password."],
    forgot: ["Forgot password?", "Password bhool gaye?"], noAcc: ["New here?", "Naye ho?"], haveAcc: ["Already have an account?", "Account pehle se hai?"],
    createAcc: ["Create free account", "Free account banao"], doLogin: ["Log in", "Log in karo"],
    profile: ["Profile", "Profile"], settings: ["Settings", "Settings"], about: ["About", "About"], developer: ["Developer", "Developer"], logout: ["Log out", "Log out"],
    pubProjects: ["Public projects", "Public projects"], pubSub: ["Ready-made automations for YouTube, Instagram, Telegram, Gmail & AI. One tap to use.", "YouTube, Instagram, Telegram, Gmail aur AI ke bane-banaye automation. Ek tap me use karo."],
    useProject: ["Use this project", "Ye project use karo"], details: ["Details", "Details"], free: ["FREE", "FREE"],
    runsHere: ["Runs here", "Yahin chalega"], needsFull: ["Full version", "Full version"], ownKey: ["Your own API key", "Apni API key"], needsSetup: ["Needs app/OAuth setup", "App/OAuth setup chahiye"],
    theme: ["Theme", "Theme"], language: ["Language", "Bhasha"], save: ["Save", "Save karo"], back: ["Back", "Wapas"],
  };
  const t = (k) => { const v = STR[k]; return v ? v[prefs.lang === "hi" ? 1 : 0] : k; };

  // ---------------------------------------------------------------- state
  const S = { mode: "none", user: null, client: null, lockedLocal: false, cloud: "unknown" };
  const app = () => window.YFApp;
  const ns = () => window.YF_NS || "";
  function profileKey() { return "yf_profile_" + (S.user ? S.user.id : "local"); }
  function getProfile() { try { return JSON.parse(localStorage.getItem(profileKey()) || "{}"); } catch (_) { return {}; } }
  function setProfile(p) { localStorage.setItem(profileKey(), JSON.stringify(p)); }
  function displayName() { const p = getProfile(); return p.name || (S.user && S.user.user_metadata && S.user.user_metadata.display_name) || (S.user && S.user.email ? S.user.email.split("@")[0] : "Nishu"); }
  function initials(n) { return String(n || "Y").trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("") || "Y"; }
  function avatarHtml(size = 36, cls = "") {
    const p = getProfile();
    if (p.avatar) return `<span class="ava ${cls}" style="width:${size}px;height:${size}px"><img src="${esc(p.avatar)}" alt=""></span>`;
    if (!S.user && S.mode !== "local") return `<span class="ava ${cls}" style="width:${size}px;height:${size}px"><img src="${LOGO}" alt=""></span>`;
    return `<span class="ava ini ${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px">${esc(initials(displayName()))}</span>`;
  }

  // ---------------------------------------------------------------- splash
  function splash(on, text) {
    let el = $("#splash");
    if (!on) { if (el) { el.classList.add("out"); setTimeout(() => el && el.remove(), 350); } return; }
    if (!el) { el = document.createElement("div"); el.id = "splash"; document.body.appendChild(el); }
    el.innerHTML = `<div class="sp-in"><img class="sp-logo" src="${LOGO}" alt="YantraFlow"><div class="sp-name">Yantra<span>Flow</span></div><div class="sp-bar"><i></i></div><div class="sp-tx">${esc(text || "Loading…")}</div></div>`;
  }

  // ---------------------------------------------------------------- Supabase (website only)
  function loadScript(src) { return new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("Could not load " + src)); document.head.appendChild(s); }); }
  async function initSupabase() {
    if (!window.supabase) await loadScript("vendor/supabase.min.js");
    S.client = window.supabase.createClient(window.YF_SUPABASE_URL, window.YF_SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "yf-auth" } });
    S.client.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY") { S.recovery = true; showAuth("reset"); }
      if (ev === "SIGNED_OUT") { S.user = null; }
      if (session && session.user) S.user = session.user;
    });
    const { data } = await S.client.auth.getSession();
    return data && data.session ? data.session.user : null;
  }
  function friendly(err) {
    const m = String((err && (err.message || err.error_description || err)) || "");
    const code = String((err && err.code) || "");
    const lo = (m + " " + code).toLowerCase();
    const hi = prefs.lang === "hi";
    if (code === "over_email_send_rate_limit" || lo.includes("email rate limit")) return hi ? "Abhi bahut saare emails bhej diye gaye (free email limit). Thodi der baad try karo. (Admin: Supabase me custom SMTP lagao ya 'Confirm email' OFF karo.)" : "Too many emails sent right now (free email limit). Please try again later. (Admin: add custom SMTP in Supabase or turn off 'Confirm email'.)";
    if (lo.includes("security purposes") || code === "over_request_rate_limit") return hi ? "Thoda ruk ke (1 minute) dobara try karo." : "Please wait about a minute and try again.";
    if (code === "email_address_not_authorized") return hi ? "Is email pe abhi mail nahi ja sakta (site ka email setup). Admin: Supabase me custom SMTP lagao." : "We can't send email to this address yet (site email setup). Admin: add custom SMTP in Supabase.";
    if (lo.includes("invalid login")) return hi ? "Email ya password galat hai." : "Wrong email or password.";
    if (lo.includes("email not confirmed")) return hi ? "Email abhi confirm nahi hua. Inbox (aur Spam) me confirmation link kholo." : "Your email isn't confirmed yet. Open the confirmation link in your inbox (check Spam).";
    if (lo.includes("already registered") || lo.includes("already been registered")) return hi ? "Is email se account pehle se hai — Log in karo." : "An account with this email already exists — please log in.";
    if (lo.includes("rate limit") || lo.includes("too many")) return hi ? "Bahut zyada try ho gaye. Thodi der baad dobara karo." : "Too many attempts right now. Please try again in a little while.";
    if (lo.includes("error sending") || lo.includes("not authorized") || lo.includes("smtp")) return hi ? "Signup ka confirmation email nahi ja paya. Ye site ke setup ki problem hai (admin: Supabase me 'Confirm email' OFF karo ya custom SMTP lagao)." : "The confirmation email could not be sent. This is a site setup issue (admin: turn off 'Confirm email' in Supabase or add custom SMTP).";
    if (lo.includes("password") && (lo.includes("6") || lo.includes("weak") || lo.includes("short"))) return hi ? "Password kam se kam 6 characters ka rakho (8+ better)." : "Password must be at least 6 characters (8+ is better).";
    if (lo.includes("valid email") || lo.includes("invalid email") || lo.includes("is invalid")) return hi ? "Email sahi nahi lag raha." : "That email doesn't look valid.";
    if (lo.includes("signups not allowed") || lo.includes("signup is disabled")) return hi ? "Abhi naye signup band hain." : "New signups are turned off right now.";
    if (lo.includes("fetch") || lo.includes("network") || lo.includes("load")) return hi ? "Server tak nahi pahunch paye — internet check karo." : "Couldn't reach the login server — check your internet.";
    return m || (hi ? "Kuch gadbad hui, dobara try karo." : "Something went wrong, please try again.");
  }
  function useUser(user) {
    S.user = user; S.mode = "supabase";
    window.YF_NS = "u_" + user.id + "_";
    // first login on this device: copy any older guest workflows into this account (originals kept)
    try {
      if (!localStorage.getItem("yf_" + ns() + "workflows") && localStorage.getItem("yf_workflows")) {
        for (const k of ["workflows", "creds", "runs"]) { const v = localStorage.getItem("yf_" + k); if (v) localStorage.setItem("yf_" + ns() + k, v); }
        localStorage.setItem("yf_" + ns() + "seeded", "1");
      }
    } catch (_) { /* storage full */ }
  }

  // ---------------------------------------------------------------- auth screens
  let authMode = "login";
  function authShell(inner) {
    document.body.classList.add("auth-on");
    const v = $("#view");
    v.innerHTML = `<div class="auth"><div class="auth-glow"></div><div class="auth-card">
      <div class="auth-brand"><img src="${LOGO}" alt="" class="auth-logo"><div><div class="auth-name">Yantra<span>Flow</span></div><div class="auth-tag">${prefs.lang === "hi" ? "Free automation — phone + PC" : "Free automation for phone & PC"}</div></div></div>
      ${inner}
      <div class="auth-foot"><button class="linkbtn" id="langT">${prefs.lang === "hi" ? "English" : "Hinglish"}</button> · <a href="#" id="aboutL">${t("about")}</a> · Created by Nirbhay Sharma &amp; Tab</div>
    </div></div>`;
    $("#langT").onclick = () => { prefs.lang = prefs.lang === "hi" ? "en" : "hi"; savePrefs(); applyTheme(); showAuth(authMode); };
    $("#aboutL").onclick = (e) => { e.preventDefault(); toastMsg("YantraFlow — free n8n-style automation. Made by Nirbhay Sharma (Nishu) & Tab."); };
  }
  function toastMsg(m, k) { if (app()) app().toast(m, k); else alert(m); }
  function showAuth(mode) {
    authMode = mode || "login";
    splash(false);
    if (S.mode === "local") return showLocalLock();
    if (authMode === "reset") {
      authShell(`<h2 class="auth-h">${prefs.lang === "hi" ? "Naya password set karo" : "Set a new password"}</h2>
        <form id="af" class="auth-f" novalidate><label class="lb" for="ap">${t("password")}</label><div class="pw"><input class="inp" id="ap" type="password" autocomplete="new-password" minlength="6" required placeholder="••••••••"><button type="button" class="pw-eye" aria-label="Show password">👁</button></div>
        <div class="auth-msg" id="am" role="alert"></div><button class="btn primary big" id="ab">${t("save")}</button></form>`);
      wireEye();
      $("#af").onsubmit = async (e) => { e.preventDefault(); busy(true); const { error } = await S.client.auth.updateUser({ password: $("#ap").value }); busy(false); if (error) return msg(friendly(error)); S.recovery = false; msg(prefs.lang === "hi" ? "Password badal gaya ✅" : "Password updated ✅", "ok"); setTimeout(() => location.replace(location.pathname + "#/workflows") || location.reload(), 900); };
      return;
    }
    if (authMode === "forgot") {
      authShell(`<h2 class="auth-h">${t("forgot")}</h2><p class="auth-sub">${prefs.lang === "hi" ? "Email daalo, password reset ka link bhejenge." : "Enter your email and we'll send a reset link."}</p>
        <form id="af" class="auth-f" novalidate><label class="lb" for="ae">${t("email")}</label><input class="inp" id="ae" type="email" autocomplete="email" required placeholder="you@gmail.com">
        <div class="auth-msg" id="am" role="alert"></div><button class="btn primary big" id="ab">${prefs.lang === "hi" ? "Reset link bhejo" : "Send reset link"}</button></form>
        <p class="auth-alt"><a href="#" id="toLogin">← ${t("back")}</a></p>`);
      $("#toLogin").onclick = (e) => { e.preventDefault(); showAuth("login"); };
      $("#af").onsubmit = async (e) => {
        e.preventDefault(); const email = $("#ae").value.trim(); if (!email) return msg(friendly("invalid email"));
        busy(true); const { error } = await S.client.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); busy(false);
        if (error) return msg(friendly(error));
        msg(prefs.lang === "hi" ? "Agar is email se account hai to reset link bhej diya ✅ (Spam bhi check karo)" : "If an account exists for that email, a reset link is on its way ✅ (check Spam too)", "ok");
      };
      return;
    }
    const isUp = authMode === "signup";
    authShell(`<div class="auth-tabs" role="tablist"><button role="tab" class="${isUp ? "" : "on"}" data-m="login">${t("login")}</button><button role="tab" class="${isUp ? "on" : ""}" data-m="signup">${t("signup")}</button></div>
      <h2 class="auth-h">${isUp ? t("signupTitle") : t("loginTitle")}</h2><p class="auth-sub">${isUp ? t("signupSub") : t("loginSub")}</p>
      <form id="af" class="auth-f" novalidate>
        <label class="lb" for="ae">${t("email")}</label><input class="inp" id="ae" type="email" autocomplete="email" inputmode="email" required placeholder="you@gmail.com">
        <label class="lb" for="ap">${t("password")}</label><div class="pw"><input class="inp" id="ap" type="password" autocomplete="${isUp ? "new-password" : "current-password"}" minlength="6" required placeholder="${isUp ? (prefs.lang === "hi" ? "kam se kam 6 characters" : "at least 6 characters") : "••••••••"}"><button type="button" class="pw-eye" aria-label="Show password">👁</button></div>
        ${isUp ? "" : `<div class="auth-row"><a href="#" id="fg">${t("forgot")}</a></div>`}
        <div class="auth-msg" id="am" role="alert"></div>
        <button class="btn primary big" id="ab">${isUp ? t("createAcc") : t("doLogin")}</button>
      </form>
      <p class="auth-alt">${isUp ? t("haveAcc") : t("noAcc")} <a href="#" id="sw">${isUp ? t("login") : t("signup")}</a></p>`);
    wireEye();
    $$(".auth-tabs button").forEach((b) => (b.onclick = () => showAuth(b.dataset.m)));
    $("#sw").onclick = (e) => { e.preventDefault(); showAuth(isUp ? "login" : "signup"); };
    $("#fg") && ($("#fg").onclick = (e) => { e.preventDefault(); showAuth("forgot"); });
    if (S.linkError) { msg(S.linkError); S.linkError = ""; }
    $("#af").onsubmit = async (e) => {
      e.preventDefault();
      const email = $("#ae").value.trim(), password = $("#ap").value;
      if (!/^\S+@\S+\.\S+$/.test(email)) return msg(friendly("invalid email"));
      if (password.length < 6) return msg(friendly("password 6"));
      busy(true);
      try {
        if (isUp) {
          const { data, error } = await S.client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (data.session && data.user) return enter(data.user);
          // Supabase hides "already registered" when confirmations are on: identities is empty
          if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error("already registered");
          msg((prefs.lang === "hi" ? "Account ban gaya ✅ Ab apne email me confirmation link kholo, phir yahan Log in karo. (Spam folder bhi dekho)" : "Account created ✅ Open the confirmation link we emailed you, then log in here. (Check Spam too)") + ` <button class="linkbtn" id="rs">${prefs.lang === "hi" ? "Email dobara bhejo" : "Resend email"}</button>`, "ok", true);
          wireResend(email);
        } else {
          const { data, error } = await S.client.auth.signInWithPassword({ email, password });
          if (error) { if (String(error.message).toLowerCase().includes("not confirmed")) { msg(friendly(error) + ` <button class="linkbtn" id="rs">${prefs.lang === "hi" ? "Email dobara bhejo" : "Resend email"}</button>`, "", true); wireResend(email); return; } throw error; }
          return enter(data.user);
        }
      } catch (err) { msg(friendly(err)); }
      finally { busy(false); }
    };
  }
  function wireResend(email) { const b = $("#rs"); if (!b) return; b.onclick = async () => { b.disabled = true; const { error } = await S.client.auth.resend({ type: "signup", email, options: { emailRedirectTo: location.origin + location.pathname } }); msg(error ? friendly(error) : (prefs.lang === "hi" ? "Confirmation email dobara bheja ✅" : "Confirmation email sent again ✅"), error ? "" : "ok"); }; }
  function wireEye() { $$(".pw-eye").forEach((b) => (b.onclick = () => { const i = b.previousElementSibling; i.type = i.type === "password" ? "text" : "password"; b.classList.toggle("on"); })); }
  function busy(on) { const b = $("#ab"); if (b) { b.disabled = on; b.classList.toggle("loading", on); } }
  function msg(text, kind, html) { const m = $("#am"); if (!m) return; m.className = "auth-msg " + (kind || "err"); if (html) m.innerHTML = text; else m.textContent = text; }
  function enter(user) {
    useUser(user);
    document.body.classList.remove("auth-on");
    if (!location.hash || location.hash.startsWith("#/login")) location.hash = "#/workflows";
    app().start();
  }

  // ---------------------------------------------------------------- local full version: one-time password lock
  function showLocalLock(errText) {
    splash(false);
    authShell(`<h2 class="auth-h">🔒 ${prefs.lang === "hi" ? "Password daalo" : "Enter password"}</h2>
      <p class="auth-sub">${prefs.lang === "hi" ? "Jo password start.bat / start.sh ki terminal window me dikha hai, wo yahan daalo. Har baar start karne par naya password banta hai." : "Type the password shown in the start.bat / start.sh terminal window. A new password is made every time YantraFlow starts."}</p>
      <form id="af" class="auth-f" novalidate><label class="lb" for="ap">YantraFlow password</label><div class="pw"><input class="inp mono" id="ap" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required placeholder="XXXX-XXXX"><button type="button" class="pw-eye" aria-label="Show password">👁</button></div>
      <div class="auth-msg" id="am" role="alert"></div><button class="btn primary big" id="ab">${prefs.lang === "hi" ? "Unlock karo" : "Unlock"}</button></form>`);
    wireEye();
    if (errText) msg(errText);
    $("#ap").focus();
    $("#af").onsubmit = async (e) => {
      e.preventDefault(); busy(true);
      try {
        const r = await fetch("api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: $("#ap").value.trim() }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Wrong password");
        document.body.classList.remove("auth-on"); S.lockedLocal = false;
        if (!location.hash || location.hash.startsWith("#/login")) location.hash = "#/workflows";
        app().start();
      } catch (err) { msg(prefs.lang === "hi" ? (/many|wait/i.test(err.message) ? "Bahut galat try — 1 minute ruko." : "Password galat hai. Terminal me dikha password daalo.") : err.message); }
      finally { busy(false); }
    };
  }

  // ---------------------------------------------------------------- gate (called by app.js boot)
  async function gate(B) {
    applyChrome();
    if (B.edition === "full") {
      S.mode = "local"; window.YF_NS = "";
      let h = {}; try { h = await (await fetch("api/health", { cache: "no-store" })).json(); } catch (_) { /* */ }
      if (h.locked && !h.authed) { S.lockedLocal = true; showLocalLock(); return false; }
      splash(false); return true;
    }
    if (window.YF_REQUIRE_LOGIN === false) { S.mode = "off"; splash(false); return true; }
    S.mode = "supabase";
    // link errors from email links, e.g. #error=access_denied&error_code=otp_expired
    if (/^#error=|[#&]error_code=/.test(location.hash)) { const q = new URLSearchParams(location.hash.slice(1)); S.linkError = (q.get("error_description") || "Link expired").replace(/\+/g, " ") + (prefs.lang === "hi" ? " — dobara try karo." : " — please try again."); history.replaceState(null, "", location.pathname + "#/login"); }
    let user = null;
    try { user = await initSupabase(); }
    catch (e) { splash(false); authShell(`<h2 class="auth-h">${prefs.lang === "hi" ? "Login server tak nahi pahunch paye" : "Can't reach the login server"}</h2><p class="auth-sub">${esc(friendly(e))}</p><button class="btn primary big" onclick="location.reload()">↻ Retry</button>`); return false; }
    if (/^#access_token=|^#type=/.test(location.hash)) history.replaceState(null, "", location.pathname + "#/workflows");
    if (S.recovery) { showAuth("reset"); return false; }
    if (!user) { showAuth(location.hash.startsWith("#/signup") ? "signup" : "login"); return false; }
    useUser(user); splash(false); return true;
  }
  async function logout() {
    if (S.mode === "local") { await fetch("api/logout", { method: "POST" }).catch(() => {}); location.reload(); return; }
    if (S.client) await S.client.auth.signOut().catch(() => {});
    location.hash = "#/login"; location.reload();
  }

  // ---------------------------------------------------------------- header chrome: avatar + menu
  function applyChrome() {
    const btn = $("#avatarBtn"); if (!btn) return;
    btn.innerHTML = avatarHtml(34);
    btn.onclick = (e) => { e.stopPropagation(); toggleMenu(); };
    $$("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
    document.addEventListener("click", () => { const m = $("#pmenu"); if (m) m.classList.add("hidden"); });
  }
  window.addEventListener("hashchange", () => { const m = $("#pmenu"); if (m) m.classList.add("hidden"); });
  function toggleMenu() {
    let m = $("#pmenu");
    if (!m) { m = document.createElement("div"); m.id = "pmenu"; m.className = "pmenu hidden"; document.body.appendChild(m); m.onclick = (e) => e.stopPropagation(); }
    const who = S.mode === "local" ? (prefs.lang === "hi" ? "Local full version" : "Local full version") : (S.user ? S.user.email : "");
    m.innerHTML = `<div class="pm-head">${avatarHtml(42)}<div><b>${esc(displayName())}</b><small>${esc(who)}</small></div></div>
      <a href="#/profile">👤 ${t("profile")}</a><a href="#/projects">🧩 ${t("pubProjects")}</a><a href="#/settings">⚙️ ${t("settings")}</a><a href="#/about">ℹ️ ${t("about")}</a><a href="#/developer">👨‍💻 ${t("developer")}</a>
      ${S.mode === "off" ? "" : `<button id="pmOut" class="danger">↪ ${t("logout")}</button>`}`;
    m.classList.toggle("hidden");
    $$("#pmenu a").forEach((a) => (a.onclick = () => m.classList.add("hidden")));
    $("#pmOut") && ($("#pmOut").onclick = logout);
  }

  // ---------------------------------------------------------------- cloud sync (optional Supabase table)
  async function cloudCheck() {
    if (S.mode !== "supabase" || !S.client) { S.cloud = "off"; return S.cloud; }
    const { error } = await S.client.from("yf_workflows").select("id").limit(1);
    S.cloud = !error ? "ready" : (error.code === "PGRST205" || error.code === "42P01" || /schema cache|does not exist/i.test(error.message) ? "missing" : "error:" + error.message);
    return S.cloud;
  }
  async function cloudSync() {
    if ((await cloudCheck()) !== "ready") return { ok: false, state: S.cloud };
    const key = "yf_" + ns() + "workflows";
    const local = JSON.parse(localStorage.getItem(key) || "{}");
    const { data, error } = await S.client.from("yf_workflows").select("id,data,updated_at");
    if (error) return { ok: false, state: "error:" + error.message };
    let pulled = 0;
    for (const row of data || []) { const l = local[row.id]; if (!l || String(row.data.updatedAt || "") > String(l.updatedAt || "")) { local[row.id] = row.data; pulled++; } }
    localStorage.setItem(key, JSON.stringify(local));
    const rows = Object.values(local).map((wf) => ({ user_id: S.user.id, id: wf.id, data: wf, updated_at: new Date().toISOString() }));
    if (rows.length) { const up = await S.client.from("yf_workflows").upsert(rows, { onConflict: "user_id,id" }); if (up.error) return { ok: false, state: "error:" + up.error.message }; }
    return { ok: true, pulled, pushed: rows.length };
  }
  async function cloudDelete(id) { if (S.cloud !== "ready") return; try { await S.client.from("yf_workflows").delete().eq("id", id); } catch (_) { /* offline */ } }
  // keep the cloud copy fresh after saves/deletes (only when the table exists)
  function hookCloud(B) {
    if (S.mode !== "supabase" || B.edition !== "web" || B._cloudHooked) return;
    B._cloudHooked = true;
    let tm = null; const later = () => { clearTimeout(tm); tm = setTimeout(() => cloudSync().catch(() => {}), 1500); };
    const save = B.saveWorkflow, del = B.deleteWorkflow;
    B.saveWorkflow = async (wf) => { const r = await save(wf); if (S.cloud === "ready") later(); return r; };
    B.deleteWorkflow = async (id) => { const r = await del(id); cloudDelete(id); return r; };
    cloudSync().then((r) => { if (r.ok && r.pulled && app() && /^#\/workflows|^$/.test(location.hash)) app().refresh(); }).catch(() => {});
  }

  // ---------------------------------------------------------------- views
  const page = (inner) => `<div class="page">${inner}</div>`;
  function runBadge(p) {
    const m = { web: ["🌐", t("runsHere"), "b-web"], key: ["🔑", t("ownKey"), "b-key"], full: ["💻", t("needsFull"), "b-full"], setup: ["🛠️", t("needsSetup"), "b-setup"] }[p.runsIn] || ["🌐", t("runsHere"), "b-web"];
    return `<span class="rbadge ${m[2]}">${m[0]} ${m[1]}</span>`;
  }
  function tierBadge(p) { return p.tier === "free" || !p.price ? `<span class="free">${t("free")}</span>` : `<span class="paid">₹${esc(p.price)}</span>`; }
  async function projectWorkflow(p) {
    if (p.workflow) return JSON.parse(JSON.stringify(p.workflow));
    const idx = await (await fetch("templates/index.json")).json();
    const tpl = idx.find((x) => x.key === p.fromTemplate);
    return await (await fetch("templates/" + tpl.file)).json();
  }
  async function useProject(id, btn) {
    const p = window.YF_PROJECTS.find((x) => x.id === id); if (!p) return;
    if (p.tier !== "free" && p.price) return toastMsg("This project is paid — coming soon.");
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      const wf = await projectWorkflow(p);
      delete wf.id; wf.active = false; wf.name = p.title; wf.description = p.summary;
      const saved = await app().B.importWorkflow(wf);
      app().toast(prefs.lang === "hi" ? "Project aapke workflows me add ho gaya ✓" : "Added to your workflows ✓", "ok");
      location.hash = `#/editor/${saved.id}`;
    } catch (e) { app().toast(e.message, "err"); if (btn) { btn.disabled = false; btn.textContent = t("useProject"); } }
  }
  let projCat = "All", projQ = "";
  function viewProjects() {
    app().setNav("projects");
    const A = app(); const list = window.YF_PROJECTS;
    const shown = list.filter((p) => (projCat === "All" || p.categories.includes(projCat)) && (!projQ || (p.title + p.summary + p.categories.join(" ")).toLowerCase().includes(projQ.toLowerCase())));
    A.view().innerHTML = page(`<div class="hero-h"><div><h1 class="h">${prefs.lang === "hi" ? "Public" : "Public"} <span class="g">${prefs.lang === "hi" ? "projects" : "projects"}</span></h1><p class="sub">${t("pubSub")}</p></div>
      <span class="allfree">🎁 ${prefs.lang === "hi" ? `Abhi saare ${list.length} projects FREE` : `All ${list.length} projects are FREE right now`}</span></div>
      <div class="pj-tools"><input class="inp" id="pq" type="search" placeholder="${prefs.lang === "hi" ? "Project dhoondo…" : "Search projects…"}" value="${esc(projQ)}" aria-label="Search projects"></div>
      <div class="cats" role="tablist">${CATS.map((c) => `<button class="cat ${c === projCat ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}${c === "All" ? "" : ` <small>${list.filter((p) => p.categories.includes(c)).length}</small>`}</button>`).join("")}</div>
      ${shown.length ? `<div class="grid pj-grid">${shown.map((p) => `<article class="card pj" data-open="${p.id}">
        <div class="pj-top"><div class="pj-ic">${p.icon}</div><div class="pj-badges">${tierBadge(p)}${runBadge(p)}</div></div>
        <h3>${esc(prefs.lang === "hi" ? p.title_hi || p.title : p.title)}</h3><p>${esc(p.summary)}</p>
        ${A.chain(projectTypes(p))}
        <div class="pj-cats">${p.categories.map((c) => `<span>${esc(c)}</span>`).join("")}</div>
        <div class="row pj-act"><a class="btn sm" href="#/project/${p.id}">${t("details")}</a><button class="btn sm primary" data-useproj="${p.id}">${t("useProject")}</button></div>
      </article>`).join("")}</div>` : `<div class="empty"><div class="big">🔎</div><p>${prefs.lang === "hi" ? "Koi project nahi mila" : "No projects found"}</p></div>`}
      <p class="meta" style="margin-top:18px">🌐 ${t("runsHere")} = ${prefs.lang === "hi" ? "isi website pe chalega" : "works on this website"} · 🔑 ${t("ownKey")} = ${prefs.lang === "hi" ? "provider ki apni paid/trial key chahiye" : "needs your own paid/trial key from a provider"} · 🛠️ = ${prefs.lang === "hi" ? "platform ka developer app / token chahiye" : "needs a platform developer app / token"} · 💻 = ${prefs.lang === "hi" ? "PC/Termux full version" : "PC/Termux full version"}</p>`);
    $$("[data-cat]").forEach((b) => (b.onclick = () => { projCat = b.dataset.cat; viewProjects(); }));
    const q = $("#pq"); q.oninput = () => { projQ = q.value; clearTimeout(q._t); q._t = setTimeout(() => { viewProjects(); const n = $("#pq"); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); };
    $$("[data-useproj]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); useProject(b.dataset.useproj, b); }));
    $$("[data-open]").forEach((c) => (c.onclick = (e) => { if (e.target.closest("a,button")) return; location.hash = `#/project/${c.dataset.open}`; }));
  }
  const TPL_TYPES = { "uptime-monitor": ["scheduleTrigger", "httpRequest", "if", "telegram"], "reel-autopost": ["scheduleTrigger", "set", "aiChat", "instagram", "telegram"], "folder-youtube": ["folderTrigger", "aiChat", "code", "youtube", "telegram"], "rss-ai-telegram": ["scheduleTrigger", "rss", "aiChat", "telegram"], "daily-quote": ["scheduleTrigger", "aiChat", "telegram"], "webhook-ai-reply": ["webhookTrigger", "aiChat", "respondWebhook"] };
  function projectTypes(p) { return p.workflow ? p.workflow.nodes.map((n) => n.type) : TPL_TYPES[p.fromTemplate] || []; }
  async function viewProject(id) {
    app().setNav("projects");
    const p = window.YF_PROJECTS.find((x) => x.id === id);
    if (!p) { location.hash = "#/projects"; return; }
    const A = app(); const wf = await projectWorkflow(p);
    const META = A.META;
    A.view().innerHTML = page(`<a class="backlink" href="#/projects">← ${t("pubProjects")}</a>
      <div class="pd-hero card"><div class="pj-ic big">${p.icon}</div><div style="flex:1;min-width:0"><div class="pj-badges">${tierBadge(p)}${runBadge(p)}${p.categories.map((c) => `<span class="ctag">${esc(c)}</span>`).join("")}</div>
        <h1 class="h" style="font-size:24px;margin-top:8px">${esc(p.title)}</h1><p class="sub">${esc(p.summary)}</p></div></div>
      ${p.honest ? `<div class="note honest">⚠️ <b>${prefs.lang === "hi" ? "Sach baat" : "Honest note"}:</b> ${esc(p.honest)}</div>` : ""}
      <div class="two-col">
        <section class="card"><h3>🧩 ${prefs.lang === "hi" ? "Isme kya steps hain" : "What's inside"}</h3><ol class="steps">${wf.nodes.map((n) => { const m = META[n.type] || { icon: "•", label: n.type, color: "#888" }; return `<li class="${n.disabled ? "off" : ""}"><span class="chip" style="background:${m.color}26">${m.icon}</span><div><b>${esc(n.name)}</b><small>${esc(m.label)}${n.disabled ? " · OFF (optional)" : ""}${m.fullOnly ? " · 💻 full version" : ""}</small></div></li>`; }).join("")}</ol></section>
        <section class="card"><h3>🔑 ${prefs.lang === "hi" ? "Kya chahiye" : "You need"}</h3><ul class="needs">${(p.needs || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
          <h3 style="margin-top:16px">▶ ${prefs.lang === "hi" ? "Kaise chalayein" : "How to run"}</h3><ol class="howto">${(p.howTo || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ol></section>
      </div>
      <div class="pd-cta"><div><b>${p.tier === "free" ? (prefs.lang === "hi" ? "FREE — abhi ke liye bilkul free" : "FREE — no cost right now") : "₹" + esc(p.price)}</b><small>${prefs.lang === "hi" ? "Ek tap me tumhare workflows me copy hoga. Keys sirf tumhare device pe." : "Copies into your workflows in one tap. Keys stay on your device."}</small></div><button class="btn primary big" id="usep">${t("useProject")} →</button></div>`);
    $("#usep").onclick = (e) => useProject(p.id, e.currentTarget);
  }
  function viewProfile() {
    app().setNav("me");
    const A = app(); const p = getProfile();
    const email = S.mode === "local" ? (prefs.lang === "hi" ? "Local full version (is device pe)" : "Local full version (this device)") : S.user ? S.user.email : "";
    A.view().innerHTML = page(`<div class="prof card"><div class="prof-bg"></div>
        <div class="prof-ava"><label class="ava-up" title="Change photo">${avatarHtml(96, "xl")}<input type="file" id="avf" accept="image/*" hidden><span class="ava-cam">📷</span></label></div>
        <h1 class="h" style="text-align:center;margin-top:10px">${esc(displayName())}</h1><p class="sub" style="text-align:center">${esc(email)}</p>
        <div class="prof-stats" id="pst"><div><b>–</b><small>${t("workflows")}</small></div><div><b>–</b><small>${t("runs")}</small></div><div><b>${window.YF_PROJECTS.length}</b><small>${t("projects")}</small></div></div></div>
      <section class="card" style="margin-top:14px"><h3>✏️ ${prefs.lang === "hi" ? "Profile edit" : "Edit profile"}</h3>
        <label class="lb" for="pn">${prefs.lang === "hi" ? "Naam" : "Display name"}</label><input class="inp" id="pn" maxlength="40" value="${esc(p.name || (S.user && S.user.user_metadata && S.user.user_metadata.display_name) || "")}" placeholder="Nishu">
        <label class="lb" for="pb">Bio</label><textarea class="inp" id="pb" maxlength="160" placeholder="${prefs.lang === "hi" ? "Main kya automate karta hoon…" : "What I automate…"}">${esc(p.bio || "")}</textarea>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="psave">${t("save")}</button>${p.avatar ? `<button class="btn ghost" id="pdel">${prefs.lang === "hi" ? "Photo hatao" : "Remove photo"}</button>` : ""}</div>
        <p class="help">${prefs.lang === "hi" ? "Photo sirf is device pe save hoti hai." : "Your photo is stored only on this device."}</p></section>
      <div class="menu-list card" style="margin-top:14px"><a href="#/settings">⚙️ ${t("settings")}<span>›</span></a><a href="#/keys">🔑 ${t("keys")}<span>›</span></a><a href="#/projects">🧩 ${t("pubProjects")}<span>›</span></a><a href="#/about">ℹ️ ${t("about")}<span>›</span></a><a href="#/developer">👨‍💻 ${t("developer")}<span>›</span></a>${S.mode === "off" ? "" : `<button id="plo" class="danger">↪ ${t("logout")}</button>`}</div>`);
    A.B.listWorkflows().then((l) => { const b = $$("#pst b"); if (b[0]) b[0].textContent = l.length; }).catch(() => {});
    A.B.listRuns().then((l) => { const b = $$("#pst b"); if (b[1]) b[1].textContent = l.length; }).catch(() => {});
    $("#avf").onchange = (e) => { const f = e.target.files[0]; if (!f) return; resizeImage(f, 256).then((url) => { const q = getProfile(); q.avatar = url; setProfile(q); applyChrome(); viewProfile(); A.toast("Photo updated ✓", "ok"); }).catch((err) => A.toast(err.message, "err")); };
    $("#psave").onclick = async () => { const q = getProfile(); q.name = $("#pn").value.trim(); q.bio = $("#pb").value.trim(); setProfile(q); if (S.client && S.user) S.client.auth.updateUser({ data: { display_name: q.name } }).catch(() => {}); applyChrome(); A.toast(prefs.lang === "hi" ? "Save ho gaya ✓" : "Saved ✓", "ok"); viewProfile(); };
    $("#pdel") && ($("#pdel").onclick = () => { const q = getProfile(); delete q.avatar; setProfile(q); applyChrome(); viewProfile(); });
    $("#plo") && ($("#plo").onclick = logout);
  }
  function resizeImage(file, max) {
    return new Promise((ok, bad) => {
      if (!/^image\//.test(file.type)) return bad(new Error("Please pick an image"));
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); const side = Math.round(Math.min(img.width, img.height) * s); c.width = c.height = side; const g = c.getContext("2d"); const sw = Math.min(img.width, img.height); g.drawImage(img, (img.width - sw) / 2, (img.height - sw) / 2, sw, sw, 0, 0, side, side); URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", 0.85)); };
      img.onerror = () => bad(new Error("Could not read image")); img.src = url;
    });
  }
  async function viewSettings() {
    app().setNav("me");
    const A = app(); const hi = prefs.lang === "hi";
    const opt = (name, val, cur, label) => `<label class="seg-o"><input type="radio" name="${name}" value="${val}" ${cur === val ? "checked" : ""}><span>${label}</span></label>`;
    A.view().innerHTML = page(`<a class="backlink" href="#/profile">← ${t("profile")}</a><div class="hero-h"><div><h1 class="h">${t("settings")}</h1></div></div>
      <section class="card set"><h3>🎨 ${t("theme")}</h3><div class="seg">${opt("th", "dark", prefs.theme, "🌙 Dark")}${opt("th", "amoled", prefs.theme, "⚫ AMOLED")}${opt("th", "light", prefs.theme, "☀️ Light")}</div>
        <h3 style="margin-top:18px">🌐 ${t("language")}</h3><div class="seg">${opt("lg", "en", prefs.lang, "English")}${opt("lg", "hi", prefs.lang, "Hinglish")}</div>
        <p class="help">${hi ? "Menus, login, profile aur projects Hinglish me. Editor ke andar ke labels English me hi hain." : "Menus, login, profile and projects switch language. Labels inside the editor stay English."}</p></section>
      <section class="card set"><h3>🔑 ${hi ? "API keys & accounts" : "API keys & accounts"}</h3><p class="sub">${hi ? "Telegram, AI, Instagram, YouTube keys — sirf is device pe save." : "Telegram, AI, Instagram, YouTube keys — saved on this device only."}</p><a class="btn" href="#/keys" style="margin-top:10px">${hi ? "Keys page kholo" : "Open Keys page"} →</a></section>
      ${S.mode === "supabase" ? `<section class="card set"><h3>☁️ ${hi ? "Cloud sync (workflows)" : "Cloud sync (workflows)"}</h3><p class="sub" id="cst">${hi ? "Check kar rahe hain…" : "Checking…"}</p><button class="btn" id="csync" style="margin-top:10px" disabled>↻ ${hi ? "Abhi sync karo" : "Sync now"}</button><p class="help">${hi ? "Sirf workflows sync hote hain. API keys kabhi cloud pe nahi jaati." : "Only workflows sync. API keys never leave this device."}</p></section>` : ""}
      <section class="card set"><h3>📦 ${hi ? "Aapka data" : "Your data"}</h3><div class="row" style="margin-top:8px"><button class="btn" id="exp">⤓ ${hi ? "Data export (JSON)" : "Export data (JSON)"}</button><button class="btn danger" id="del">🗑 ${hi ? "Is device ka data delete" : "Delete data on this device"}</button></div>
        <p class="help">${hi ? "Export me workflows, runs aur profile aate hain (API keys nahi)." : "Export includes workflows, runs and profile (not your API keys)."}</p>
        ${S.mode === "supabase" ? `<button class="btn danger ghost" id="delacc" style="margin-top:10px">${hi ? "Mera account delete karo" : "Delete my account"}</button>` : ""}</section>
      <section class="card set"><h3>👤 ${hi ? "Account" : "Account"}</h3><p class="sub">${esc(S.mode === "local" ? (hi ? "Local full version — har start pe naya password." : "Local full version — new password on every start.") : S.user ? S.user.email : "")}</p>
        ${S.mode === "supabase" ? `<button class="btn" id="chpw" style="margin-top:10px">${hi ? "Password badlo" : "Change password"}</button>` : ""}${S.mode === "off" ? "" : ` <button class="btn danger" id="slo" style="margin-top:10px">↪ ${t("logout")}</button>`}</section>
      <p class="meta" style="text-align:center">YantraFlow · ${A.B.edition === "full" ? "Full · local" : "Web version"} · Created by Nirbhay Sharma &amp; Tab</p>`);
    $$("input[name=th]").forEach((r) => (r.onchange = () => { prefs.theme = r.value; savePrefs(); applyTheme(); }));
    $$("input[name=lg]").forEach((r) => (r.onchange = () => { prefs.lang = r.value; savePrefs(); applyTheme(); applyChrome(); viewSettings(); }));
    $("#exp").onclick = async () => { const data = { app: "YantraFlow", exportedAt: new Date().toISOString(), account: S.user ? S.user.email : S.mode, profile: getProfile(), workflows: await Promise.all((await A.B.listWorkflows()).map((w) => A.B.getWorkflow(w.id))), runs: await A.B.listRuns() }; A.download("yantraflow-data.json", data); };
    $("#del").onclick = async () => {
      if (!confirm(hi ? "Is device se aapke saare workflows, runs, keys aur profile delete ho jayenge. Pakka?" : "This deletes all your workflows, runs, keys and profile from this device. Sure?")) return;
      if (A.B.edition === "full") { for (const w of await A.B.listWorkflows()) await A.B.deleteWorkflow(w.id); await A.B.clearRuns(); }
      else { const pre = "yf_" + ns(); Object.keys(localStorage).filter((k) => ns() ? k.startsWith(pre) : /^yf_(workflows|runs|creds|poll|seeded)$/.test(k)).forEach((k) => localStorage.removeItem(k)); localStorage.setItem("yf_" + ns() + "seeded", "1"); }
      localStorage.removeItem(profileKey()); A.toast(hi ? "Data delete ho gaya" : "Data deleted", "ok"); location.hash = "#/workflows";
    };
    $("#slo") && ($("#slo").onclick = logout);
    $("#chpw") && ($("#chpw").onclick = async () => { const np = prompt(hi ? "Naya password (6+ characters)" : "New password (6+ characters)"); if (!np) return; const { error } = await S.client.auth.updateUser({ password: np }); A.toast(error ? friendly(error) : hi ? "Password badal gaya ✅" : "Password changed ✅", error ? "err" : "ok"); });
    $("#delacc") && ($("#delacc").onclick = async () => {
      if (!confirm(hi ? "Account hamesha ke liye delete karna hai?" : "Delete your account permanently?")) return;
      const { error } = await S.client.rpc("yf_delete_my_account");
      if (error) return A.toast(hi ? "Account delete abhi on nahi hai — admin se bolo (Supabase → Authentication → Users)." : "Account deletion isn't enabled yet — ask the admin (Supabase → Authentication → Users).", "err");
      await S.client.auth.signOut(); location.reload();
    });
    if ($("#cst")) {
      const st = await cloudCheck(); const el = $("#cst"); const b = $("#csync");
      if (st === "ready") { el.textContent = hi ? "✅ Cloud sync ON — workflows aapke account me save hote hain." : "✅ Cloud sync is on — your workflows are saved to your account."; b.disabled = false; b.onclick = async () => { b.disabled = true; const r = await cloudSync(); b.disabled = false; A.toast(r.ok ? `Synced ✓ (${r.pushed} up, ${r.pulled} down)` : r.state, r.ok ? "ok" : "err"); }; }
      else if (st === "missing") el.textContent = hi ? "Cloud sync abhi off hai (admin ne database table nahi banaya). Workflows is device pe safe hain." : "Cloud sync is off (the admin hasn't created the database table yet). Your workflows are safe on this device.";
      else el.textContent = (hi ? "Cloud sync nahi chal raha: " : "Cloud sync unavailable: ") + st.replace(/^error:/, "");
    }
  }
  function viewAbout() {
    app().setNav("me"); const hi = prefs.lang === "hi";
    app().view().innerHTML = page(`<a class="backlink" href="#/profile">← ${t("profile")}</a>
      <div class="about-hero"><img src="${LOGO}" alt="YantraFlow logo" class="about-logo"><h1 class="h">Yantra<span class="g">Flow</span></h1><p class="sub">${hi ? "Free, n8n jaisa automation tool — phone aur PC dono pe." : "A free, n8n-style automation tool for your phone and PC."}</p></div>
      <section class="card set"><h3>⚙️ ${hi ? "Naam ka matlab" : "The name"}</h3><p class="sub">${hi ? "<b>Yantra</b> = machine / yantra, <b>Flow</b> = kaam ka bahav. Logo me gear (yantra) ke andar 3 nodes ek flow me milte hain." : "<b>Yantra</b> means machine (and the sacred geometric 'yantra'); <b>Flow</b> is work moving by itself. The logo is a gear with three nodes merging into one flow."}</p></section>
      <section class="card set"><h3>✨ ${hi ? "Kya kar sakte ho" : "What you can do"}</h3><ul class="needs"><li>${hi ? "Drag-drop workflow editor (mobile pe tap)" : "Drag-and-drop workflow editor (tap-based on phones)"}</li><li>${hi ? "Schedule, webhook, AI, Telegram, Instagram, YouTube, Gmail, HTTP" : "Schedules, webhooks, AI, Telegram, Instagram, YouTube, Gmail, HTTP"}</li><li>${window.YF_PROJECTS.length} ${hi ? "ready Public projects (abhi sab FREE)" : "ready-made Public projects (all FREE right now)"}</li><li>${hi ? "Keys sirf tumhare device pe" : "Your keys stay on your device"}</li></ul></section>
      <section class="card set"><h3>🌐 ${hi ? "Do version" : "Two versions"}</h3><p class="sub">${hi ? "<b>Website</b>: browser me, login ke saath, install nahi. <b>Full version</b> (PC/Termux): 24×7 schedules, webhooks, folder watch, YouTube upload, email." : "<b>Website</b>: runs in your browser with a free account, no install. <b>Full version</b> (PC/Termux): 24×7 schedules, webhooks, folder watch, YouTube upload, email."}</p><a class="btn primary" style="margin-top:10px" href="${DEV.repo}" target="_blank" rel="noopener">⬇ ${hi ? "Full version (GitHub)" : "Get the full version (GitHub)"}</a></section>
      <section class="card set"><h3>📬 ${hi ? "Support / Contact" : "Support & contact"}</h3><p class="sub">${hi ? "Koi sawaal, bug ya idea? Email karo:" : "Questions, bugs or ideas? Email us:"} <a href="mailto:${DEV.email}">${DEV.email}</a></p></section>
      <p class="meta" style="text-align:center">Open source · MIT License · Drawflow (MIT) · supabase-js (MIT)<br>Created by Nirbhay Sharma &amp; Tab</p>`);
  }
  function viewDeveloper() {
    app().setNav("me"); const hi = prefs.lang === "hi";
    const link = (href, ic, label, sub) => `<a class="dev-link" href="${href}" target="_blank" rel="noopener"><span class="dl-ic">${ic}</span><div><b>${label}</b><small>${sub}</small></div><span>↗</span></a>`;
    app().view().innerHTML = page(`<a class="backlink" href="#/profile">← ${t("profile")}</a>
      <div class="dev card"><div class="dev-ava">N</div><h1 class="h" style="margin-top:12px">Nirbhay Sharma</h1><p class="sub">“Nishu” · ${hi ? "YantraFlow ka creator" : "Creator of YantraFlow"}</p></div>
      <div class="dev-links">${link(DEV.github, "🐙", "GitHub", "github.com/shanir01")}${link(DEV.youtube, "▶️", "YouTube", "@JavaGoat9")}${link(DEV.telegram, "✈️", "Telegram", "t.me/javagoat")}<a class="dev-link" href="mailto:${DEV.email}"><span class="dl-ic">📧</span><div><b>Email</b><small>${DEV.email}</small></div><span>↗</span></a>${link(DEV.repo, "⭐", hi ? "YantraFlow repo — star do!" : "YantraFlow repo — leave a star!", "github.com/shanir01/YantraFlow")}</div>
      <div class="credit card"><img src="${LOGO}" alt=""><div><b>Created by Nirbhay Sharma &amp; Tab</b><small>${hi ? "Idea + design: Nishu · Build: Tab" : "Idea & direction: Nishu · Built with Tab"}</small></div></div>`);
  }

  window.YFPlatform = { gate, hookCloud, showAuth, showLocalLock, logout, splash, applyChrome, t, prefs, state: S, cloudSync, cloudDelete, cloudCheck,
    views: { projects: viewProjects, project: viewProject, profile: viewProfile, settings: viewSettings, about: viewAbout, developer: viewDeveloper } };
})();
