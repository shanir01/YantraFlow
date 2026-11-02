/* YantraFlow v4.4 — "Photo + Video Maker (auto)": fill details ONCE -> ready workflow + daily schedule. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFPhotoVideo = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const s = (v) => (v == null ? "" : String(v));
  const HEX = /^#[0-9a-f]{6}$/i;
  const STYLES = [["gradient", "Gradient (brand colours)"], ["photo", "Stock photo background (Pexels/Pixabay key)"], ["dark", "Dark"], ["light", "Light"]];
  const DEFAULTS = { topic: "motivation", seed: "", language: "Hinglish", tone: "positive, energetic", style: "gradient", size: "1080x1350", color1: "#7c5cff", color2: "#00d4ff", handle: "", video: true, seconds: 20, telegram: true, youtube: false, instagram: false, at: "09:00", tz: "Asia/Kolkata" };
  /* pure: project workflow + form values -> { workflow, schedule } */
  function apply(wf, values) {
    const v = Object.assign({}, DEFAULTS, values || {});
    const w = JSON.parse(JSON.stringify(wf));
    const by = (type) => w.nodes.filter((n) => n.type === type);
    const ai = by("aiPost")[0];
    if (ai) {
      ai.params.topic = s(v.topic).trim() || DEFAULTS.topic;
      if (s(v.seed).trim()) ai.params.seed = s(v.seed).trim();
      else ai.params.seed = `Topic: ${ai.params.topic}. Har run ek naya post. Language: ${v.language}, short lines. Title = 1 line quote / hook (max 12 words).${v.handle ? " Brand: " + v.handle : ""}`;
      ai.params.language = v.language; ai.params.tone = s(v.tone) || DEFAULTS.tone;
    }
    const im = by("imageMaker")[0];
    if (im) Object.assign(im.params, { style: STYLES.some((x) => x[0] === v.style) ? v.style : "gradient", size: ["1080x1350", "1080x1920", "1080x1080"].includes(v.size) ? v.size : "1080x1350", color1: HEX.test(v.color1) ? v.color1 : DEFAULTS.color1, color2: HEX.test(v.color2) ? v.color2 : DEFAULTS.color2, handle: s(v.handle).slice(0, 40), bgQuery: s(v.topic).trim() || "motivation" });
    const vm = by("videoMaker")[0];
    if (vm) { vm.params.mode = v.video ? "make" : "off"; vm.params.watermark = s(v.handle).slice(0, 40); vm.params.seconds = Math.max(15, Math.min(60, Number(v.seconds) || 20)); vm.params.bgQuery = s(v.topic).trim() || "motivation"; }
    const tg = by("telegram");
    tg.forEach((n) => { n.disabled = !v.telegram || (n.params.operation === "video" && !v.video); });
    by("youtube").forEach((n) => { n.disabled = !(v.youtube && v.video); });
    by("instagram").forEach((n) => { n.disabled = !(v.instagram && v.video); });
    w.name = `Photo + Video Maker — ${s(v.topic).trim() || DEFAULTS.topic}`.slice(0, 80);
    w.description = `Roz ${v.at} baje: AI post → photo${v.video ? " + video" : ""} → ${["telegram", "youtube", "instagram"].filter((k) => v[k]).join(" + ") || "koi platform nahi (sirf banega)"}`;
    w.setup = { by: "photo-video-maker", values: v };
    const at = /^\d{1,2}:\d{2}$/.test(s(v.at)) ? v.at : DEFAULTS.at;
    return { workflow: w, schedule: { mode: "daily", at, tz: v.tz || DEFAULTS.tz, runNow: false } };
  }
  function formHtml(p) {
    if (typeof window === "undefined") return "";
    const I = (n, z) => window.yfIcon(n, z || 16);
    const d = DEFAULTS;
    return `<section class="card pvm-form" id="pvm"><h3>${I("wand-sparkles", 18)} Ek baar setup — phir sab apne aap</h3>
      <p class="help">Ye details sirf ek baar. Project + roz ka schedule ready ban jayega.</p>
      <div class="two"><div><label class="lb" for="pv_topic">Topic</label><input class="inp" id="pv_topic" value="${d.topic}" placeholder="motivation, tech tips, cricket, recipes…"><div class="fh"><span>Kis cheez pe roz post chahiye (English/Hinglish)</span></div></div>
        <div><label class="lb" for="pv_handle">Handle / brand naam</label><input class="inp" id="pv_handle" placeholder="@mychannel"><div class="fh"><span>Photo aur video pe neeche dikhega</span></div></div></div>
      <label class="lb" for="pv_seed">SEED / brand details (optional)</label><textarea class="inp" id="pv_seed" rows="3" placeholder="Mera channel students ke liye free AI tools batata hai. Hinglish, short, positive…"></textarea>
      <div class="two"><div><label class="lb" for="pv_style">Photo style</label><select class="inp" id="pv_style">${STYLES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></div>
        <div><label class="lb" for="pv_size">Photo size</label><select class="inp" id="pv_size"><option value="1080x1350">1080x1350 (Insta feed)</option><option value="1080x1920">1080x1920 (Story / Reel)</option><option value="1080x1080">1080x1080 (square)</option></select></div>
        <div><label class="lb" for="pv_c1">Brand colour 1</label><input class="inp" id="pv_c1" type="color" value="${d.color1}"></div>
        <div><label class="lb" for="pv_c2">Brand colour 2</label><input class="inp" id="pv_c2" type="color" value="${d.color2}"></div>
        <div><label class="lb" for="pv_lang">Language</label><select class="inp" id="pv_lang"><option>Hinglish</option><option>Hindi</option><option>English</option></select></div>
        <div><label class="lb" for="pv_at">Roz kitne baje (India time)</label><input class="inp" id="pv_at" type="time" value="${d.at}"></div></div>
      <label class="lb">Kahan post kare</label>
      <div class="pvm-plat"><label><input type="checkbox" id="pv_tg" checked> ${I("telegram", 15)} Telegram</label><label><input type="checkbox" id="pv_yt"> ${I("youtube", 15)} YouTube Shorts</label><label><input type="checkbox" id="pv_ig"> ${I("instagram", 15)} Instagram (PC/Termux)</label><label><input type="checkbox" id="pv_vid" checked> ${I("clapperboard", 15)} Video bhi banao</label></div>
      <div class="row" style="margin-top:12px"><button class="btn primary" id="pvgo" type="button">${I("sparkles", 15)} Ready project banao</button><span class="meta" id="pvlog"></span></div></section>`;
  }
  function readForm(doc) {
    const $ = (id) => doc.getElementById(id);
    return { topic: $("pv_topic").value, handle: $("pv_handle").value, seed: $("pv_seed").value, style: $("pv_style").value, size: $("pv_size").value, color1: $("pv_c1").value, color2: $("pv_c2").value, language: $("pv_lang").value, at: $("pv_at").value, telegram: $("pv_tg").checked, youtube: $("pv_yt").checked, instagram: $("pv_ig").checked, video: $("pv_vid").checked };
  }
  return { DEFAULTS, STYLES, apply, formHtml, readForm };
});
