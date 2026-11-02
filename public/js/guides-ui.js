/* YantraFlow v4.4 — closable Tips strip, "Kahan milega?" guide sheet, field help + AI provider picker. */
(function () {
  "use strict";
  const G = window.YFGuides;
  const I = (n, s, c) => window.yfIcon(n, s || 16, c);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = () => { try { return window.localStorage; } catch (_) { return null; } };

  // ---------- Tips strip: one slim collapsible line instead of 3 big boxes; every tip has its own X
  /* tips: [{ id, icon, kind: "info"|"warn"|"ok"|"prem", title, html }] */
  function tipsHtml(tips, opts) {
    const st = store();
    const list = (tips || []).filter((t) => t && !(st && G.Tips.isClosed(st, t.id)));
    if (!list.length) return "";
    const open = opts && opts.open;
    return `<div class="tips" data-tips>
      <details class="tips-d" ${open ? "open" : ""}><summary><span class="tips-ic">${I("lightbulb", 15)}</span><b>Tips</b><span class="tips-n">${list.length}</span><span class="tips-peek">${esc(list.map((t) => t.title).join(" · "))}</span><span class="tips-chev">${I("chevron-down", 16)}</span></summary>
      <div class="tips-list">${list.map((t) => `<div class="tip tip-${t.kind || "info"}" data-tip="${esc(t.id)}"><span class="tip-ic">${I(t.icon || "info", 15)}</span><div class="tip-tx"><b>${esc(t.title)}</b> ${t.html || ""}</div><button class="tip-x" type="button" data-tipx="${esc(t.id)}" aria-label="Ye tip band karo" title="Band karo">${I("x-close", 15)}</button></div>`).join("")}</div></details>
      <button class="tips-allx" type="button" data-tipsall aria-label="Saare tips band karo" title="Saare tips band karo">${I("x-close", 15)}</button></div>`;
  }
  function closeTip(id) { const st = store(); if (st) G.Tips.close(st, id); }
  function refreshStrip(box) {
    const left = box.querySelectorAll(".tip").length;
    if (!left) { box.remove(); return; }
    const n = box.querySelector(".tips-n"); if (n) n.textContent = left;
    const pk = box.querySelector(".tips-peek"); if (pk) pk.textContent = [...box.querySelectorAll(".tip-tx b")].map((b) => b.textContent).join(" · ");
  }
  /* a single closable note (keeps its own look, gets an X, remembered) */
  function closable(id, html, cls) {
    const st = store(); if (st && G.Tips.isClosed(st, id)) return "";
    return `<div class="closable ${cls || ""}" data-tip="${esc(id)}">${html}<button class="tip-x cl-x" type="button" data-tipx="${esc(id)}" aria-label="Band karo" title="Band karo">${I("x-close", 15)}</button></div>`;
  }

  // ---------- Guide sheet
  function closeSheet() { document.querySelectorAll(".gd-bd,.gd-sheet").forEach((e) => e.remove()); document.removeEventListener("keydown", escKey); }
  function escKey(e) { if (e.key === "Escape") closeSheet(); }
  function sheet(inner) {
    closeSheet();
    const bd = document.createElement("div"); bd.className = "gd-bd"; bd.onclick = closeSheet;
    const p = document.createElement("div"); p.className = "gd-sheet"; p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true");
    p.innerHTML = `<button class="gd-x" type="button" aria-label="Band karo">${I("x-close", 18)}</button>${inner}`;
    p.querySelector(".gd-x").onclick = closeSheet;
    document.body.appendChild(bd); document.body.appendChild(p); document.addEventListener("keydown", escKey);
    return p;
  }
  function guideBody(sec) {
    const g = G.GUIDES[sec]; if (!g) return "";
    const presets = sec === "ai" ? `<h4>${I("sparkles", 15)} Provider (free wale pehle)</h4><div class="gd-presets">${G.AI_PRESETS.map((p) => `<div class="gd-pre"><b>${esc(p.name)}</b><small>Base URL: <code>${esc(p.baseUrl)}</code><br>Model: <code>${esc(p.model)}</code><br>${esc(p.note)}</small>${p.fixedKey ? "" : `<a class="btn sm" href="${esc(p.keyUrl)}" target="_blank" rel="noopener">${I("external-link", 13)} Key banao</a>`}</div>`).join("")}</div>` : "";
    return `<p class="gd-what">${esc(g.what)}</p>
      <h4>${I("list-ordered", 15)} Steps</h4><ol class="gd-steps">${g.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      ${g.links.length ? `<div class="gd-links">${g.links.map((l) => `<a class="btn sm primary" href="${esc(l.url)}" target="_blank" rel="noopener">${I("external-link", 13)} ${esc(l.label)}</a>`).join("")}</div>` : ""}
      ${presets}
      <h4>${I("clipboard-check", 15)} Kya daalna hai</h4><div class="gd-fields">${Object.entries(g.fields).map(([, f]) => `<div><b>${esc(f.what)}</b><small>Example: <code>${esc(f.eg)}</code></small></div>`).join("")}</div>
      <h4>${I("wrench", 15)} Common errors + fix</h4><div class="gd-err">${g.errors.map(([e, f]) => `<div><b>${esc(e)}</b><span>${esc(f)}</span></div>`).join("")}</div>
      <p class="meta gd-safe">${I("shield-check", 13)} Keys sirf tumhare device / browser me save hoti hain. Kisi ko screenshot mat bhejo.</p>`;
  }
  function open(sec) {
    const g = G.GUIDES[sec]; if (!g) return;
    sheet(`<h3 class="gd-h">${I("book-open", 18)} Kahan milega? — ${esc(g.title)}</h3>${guideBody(sec)}<div class="row" style="margin-top:12px"><a class="btn" href="#/keys" data-gdkeys>${I("key-round", 15)} Keys page kholo</a></div>`);
    const k = document.querySelector("[data-gdkeys]"); if (k) k.onclick = closeSheet;
  }

  // ---------- field help (node panel + Keys page)
  function presetSelect(target, current) {
    const cur = G.detectPreset(current);
    return `<div class="pre-row"><label class="lb sm" for="pre-${esc(target)}">${I("sparkles", 13)} Provider chuno (Base URL + Model khud bhar jayenge)</label><select class="inp" id="pre-${esc(target)}" data-preset-for="${esc(target)}"><option value="">— Provider chuno —</option>${G.AI_PRESETS.map((p) => `<option value="${p.id}" ${cur && cur.id === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select><div class="help pre-help" data-prehelp>${cur ? presetHelp(cur) : ""}</div></div>`;
  }
  function presetHelp(p) { return `${esc(p.note)} ${p.fixedKey ? "Key: <code>local</code>" : `<a href="${esc(p.keyUrl)}" target="_blank" rel="noopener">${I("external-link", 12)} ${esc(p.name.split(" (")[0])} key yahan banao</a>`}`; }
  /* -> { placeholder, below } extra html for a field */
  function fieldHelp(info, ownPlaceholder) {
    if (!info) return null;
    return {
      placeholder: ownPlaceholder || `e.g. ${info.eg}`,
      below: `<div class="fh"><span>${I("info", 12)} <b>Kya daalna hai:</b> ${esc(info.what)} <span class="fh-eg">e.g. <code>${esc(info.eg)}</code></span></span><button type="button" class="fh-g" data-guide="${esc(info.sec)}">${I("book-open", 12)} Kahan milega? (Guide)</button></div>`,
    };
  }

  // ---------- one delegated listener for X buttons, guide buttons and provider pickers
  document.addEventListener("click", (e) => {
    const t = e.target.closest && e.target.closest("[data-tipx],[data-tipsall],[data-guide]");
    if (!t) return;
    if (t.dataset.guide) { e.preventDefault(); e.stopPropagation(); open(t.dataset.guide); return; }
    e.preventDefault(); e.stopPropagation();
    if (t.hasAttribute("data-tipsall")) { const box = t.closest("[data-tips]"); box.querySelectorAll(".tip").forEach((x) => closeTip(x.dataset.tip)); box.remove(); return; }
    const id = t.dataset.tipx; closeTip(id);
    const el = t.closest("[data-tip]"); const box = el && el.closest("[data-tips]");
    if (el) el.remove(); if (box) refreshStrip(box);
  });
  document.addEventListener("change", (e) => {
    const s = e.target.closest && e.target.closest("[data-preset-for]"); if (!s) return;
    const fill = G.presetFill(s.value); if (!fill) return;
    const scope = s.closest("[data-preset-scope]") || document;
    const map = (s.dataset.presetFor || "").split(",");  // "baseUrlSel,modelSel,keySel"
    const put = (sel, v) => { const el = sel && scope.querySelector(sel); if (el && v != null) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); } };
    put(map[0], fill.baseUrl); put(map[1], fill.model); if (fill.apiKey) put(map[2], fill.apiKey);
    const h = s.parentNode.querySelector("[data-prehelp]"); if (h) h.innerHTML = presetHelp(G.preset(s.value));
    if (window.YFApp && window.YFApp.toast) window.YFApp.toast(`${G.preset(s.value).name.split(" (")[0]} set — ab API key daalo`, "ok");
  });

  window.YFGuideUI = { tipsHtml, closable, open, sheet, closeSheet, guideBody, fieldHelp, presetSelect, presetHelp, resetTips: () => { const st = store(); if (st) G.Tips.reset(st); } };
})();
