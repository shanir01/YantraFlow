/* YantraFlow v4.4 — Post Image Maker core (shared by website canvas + PC/Termux ffmpeg). MIT License.
   Makes a quote / post card: 1080x1350 (Instagram feed), 1080x1920 (Story/Reel cover), 1080x1080 (square). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFImage = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const s = (v) => (v == null ? "" : String(v));
  const SIZES = { "1080x1350": [1080, 1350], "1080x1920": [1080, 1920], "1080x1080": [1080, 1080] };
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  const HEX = /^#[0-9a-f]{6}$/i;
  function clean(t) {
    return s(t).split(/\r?\n/).map((l) => l.replace(/https?:\/\/\S+/g, "").replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "").replace(EMOJI, "").replace(/[*_`]+/g, "").replace(/\s{2,}/g, " ").trim()).filter(Boolean).join("\n").trim();
  }
  function wrap(text, maxChars) {
    const out = [];
    for (const para of s(text).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/).filter(Boolean)) {
        if (!line) line = w;
        else if ((line + " " + w).length <= maxChars) line += " " + w;
        else { out.push(line); line = w; }
        while (line.length > maxChars) { out.push(line.slice(0, maxChars)); line = line.slice(maxChars); }
      }
      if (line) out.push(line);
    }
    return out;
  }
  /* o = { text, title, size, style, color1, color2, handle } -> plan */
  function planImage(o) {
    o = o || {};
    const [W, H] = SIZES[o.size] || SIZES["1080x1350"];
    let text = clean(o.text);
    const title = clean(o.title).split("\n")[0].slice(0, 60);
    if (!text && title) text = title;
    if (!text) throw new Error("Photo ke liye text khaali hai — pehle AI step lagao ya 'Text' bharo");
    if (text.length > 420) text = text.slice(0, 417).replace(/\s+\S*$/, "") + "…";
    const len = text.length;
    let fontSize = len <= 50 ? 96 : len <= 110 ? 80 : len <= 200 ? 64 : len <= 300 ? 54 : 46;
    if (W === H) fontSize = Math.round(fontSize * 0.9);
    const margin = 96;
    let lines, maxChars;
    for (;;) {
      maxChars = Math.max(10, Math.floor((W - margin * 2) / (fontSize * 0.54)));
      lines = wrap(text, maxChars);
      const need = lines.length * fontSize * 1.3 + (title ? 200 : 0) + 260;
      if (need <= H || fontSize <= 36) break;
      fontSize -= 4;
    }
    const style = ["gradient", "photo", "dark", "light"].includes(o.style) ? o.style : "gradient";
    const c1 = HEX.test(s(o.color1)) ? o.color1 : "#7c5cff"; const c2 = HEX.test(s(o.color2)) ? o.color2 : "#00d4ff";
    const colors = style === "light" ? { bg1: "#fdfcff", bg2: "#ece8ff", text: "#141428", accent: c1 } : style === "dark" ? { bg1: "#0b0d17", bg2: "#1b1f33", text: "#ffffff", accent: c2 } : { bg1: c1, bg2: c2, text: "#ffffff", accent: "#ffe66d" };
    return { width: W, height: H, size: `${W}x${H}`, style, title, text, lines, fontSize, lineHeight: Math.round(fontSize * 1.3), margin, colors, handle: clean(o.handle).split("\n")[0].slice(0, 40), maxChars };
  }
  const assColor = (hex, a) => { const h = s(hex).replace("#", ""); return `&H${a || "00"}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };
  const assEsc = (t) => s(t).replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")");
  /* PC/Termux: ASS subtitle with the card text (rendered on one frame by ffmpeg + libass) */
  function assForImage(p, font) {
    font = font || "DejaVu Sans"; const C = p.colors;
    const st = (name, size, color, align, mv) => `Style: ${name},${font},${size},${assColor(color)},${assColor(C.accent)},${assColor("#000000", "60")},${assColor("#000000", "90")},-1,0,0,0,100,100,0,0,1,${p.style === "light" ? 0 : 3},${p.style === "light" ? 0 : 2},${align},${p.margin},${p.margin},${mv},1`;
    return ["[Script Info]", "ScriptType: v4.00+", `PlayResX: ${p.width}`, `PlayResY: ${p.height}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
      "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      st("Main", p.fontSize, C.text, 5, 0), st("Title", 50, C.accent, 8, 130), st("Mark", 38, C.text, 2, 90), "",
      "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
      ...(p.title && p.title !== p.text ? [`Dialogue: 0,0:00:00.00,0:00:05.00,Title,,0,0,0,,${assEsc(p.title.toUpperCase())}`] : []),
      `Dialogue: 0,0:00:00.00,0:00:05.00,Main,,0,0,0,,${p.lines.map(assEsc).join("\\N")}`,
      ...(p.handle ? [`Dialogue: 0,0:00:00.00,0:00:05.00,Mark,,0,0,0,,${assEsc(p.handle)}`] : []),
    ].join("\n") + "\n";
  }
  /* ffmpeg args (run inside the work folder): bg = background file (ppm gradient or photo), photo -> darkened */
  function imageArgs(p, o) {
    const W = p.width, H = p.height;
    const vf = [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`];
    if (o.photo) vf.push(p.style === "light" ? "eq=brightness=0.18:saturation=0.6" : "eq=brightness=-0.28:saturation=0.85", "boxblur=2:1");
    vf.push(`ass=${o.ass}`);
    return ["-y", "-hide_banner", "-loglevel", "error", "-i", o.bg, "-vf", vf.join(","), "-frames:v", "1", o.out];
  }
  /* Website: draw on a canvas -> PNG Blob. bgImage = loaded <img> (optional stock photo) */
  function renderCanvas(p, bgImage) {
    const c = document.createElement("canvas"); c.width = p.width; c.height = p.height;
    const g = c.getContext("2d"); const C = p.colors; const W = p.width, H = p.height;
    const gr = g.createLinearGradient(0, 0, W * 0.4, H); gr.addColorStop(0, C.bg1); gr.addColorStop(1, C.bg2); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (bgImage && bgImage.naturalWidth) {
      const sc = Math.max(W / bgImage.naturalWidth, H / bgImage.naturalHeight); const dw = bgImage.naturalWidth * sc, dh = bgImage.naturalHeight * sc;
      g.drawImage(bgImage, (W - dw) / 2, (H - dh) / 2, dw, dh);
      g.fillStyle = p.style === "light" ? "rgba(255,255,255,.62)" : "rgba(5,6,12,.55)"; g.fillRect(0, 0, W, H);
    } else if (p.style === "gradient") {
      for (let k = 0; k < 3; k++) { const x = [0.15, 0.85, 0.5][k] * W, y = [0.2, 0.35, 0.9][k] * H, r = [0.5, 0.4, 0.55][k] * W; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, "rgba(255,255,255,.18)"); rg.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = rg; g.fillRect(0, 0, W, H); }
    }
    g.textAlign = "center"; g.textBaseline = "middle";
    if (p.style !== "light") { g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 18; g.shadowOffsetY = 4; }
    if (p.title && p.title !== p.text) { g.fillStyle = C.accent; g.font = `800 50px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; g.fillText(p.title.toUpperCase(), W / 2, 150); }
    g.fillStyle = C.text; g.font = `800 ${p.fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Devanagari", sans-serif`;
    const top = H / 2 - ((p.lines.length - 1) * p.lineHeight) / 2;
    p.lines.forEach((l, i) => g.fillText(l, W / 2, top + i * p.lineHeight));
    g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.fillStyle = C.accent; g.globalAlpha = 0.9; g.font = `900 ${Math.round(p.fontSize * 2.2)}px Georgia, "Times New Roman", serif`;
    g.fillText("\u201C", W / 2, top - p.fontSize * 1.35); g.globalAlpha = 1;
    g.fillRect(W / 2 - 60, top + (p.lines.length - 1) * p.lineHeight + p.fontSize * 1.05, 120, 10);
    if (p.handle) { g.shadowBlur = 0; g.fillStyle = C.text; g.globalAlpha = 0.85; g.font = `700 38px system-ui, sans-serif`; g.fillText(p.handle, W / 2, H - 100); g.globalAlpha = 1; }
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Photo nahi ban paayi (canvas)"))), "image/png"));
  }
  function stockPhotoQuery(t) { return clean(t).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2).slice(0, 4).join(" ") || "abstract background"; }
  function normalizePexelsPhotos(j) { return ((j && j.photos) || []).map((p) => ({ id: "pexels:" + p.id, url: (p.src && (p.src.portrait || p.src.large2x || p.src.large)) || "", page: p.url, by: p.photographer, source: "Pexels" })).filter((x) => x.url); }
  function normalizePixabayPhotos(j) { return ((j && j.hits) || []).map((h) => ({ id: "pixabay:" + h.id, url: h.largeImageURL || h.webformatURL || "", page: h.pageURL, by: h.user, source: "Pixabay" })).filter((x) => x.url); }
  function photoCredit(p) { return p ? `Photo: ${p.by || "creator"} / ${p.source} (${p.page || ""})`.replace(" ()", "") : ""; }
  return { SIZES, clean, wrap, planImage, assForImage, imageArgs, renderCanvas, stockPhotoQuery, normalizePexelsPhotos, normalizePixabayPhotos, photoCredit };
});
