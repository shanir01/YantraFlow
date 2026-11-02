/* YantraFlow Auto Video Maker + Free Video Finder — shared logic (no DOM, no Node APIs).
   Used by the website (canvas renderer) and by the PC/Termux server (ffmpeg renderer) and the tests.
   - splitScript() / planVideo(): caption text -> timed slides with word-by-word (kinetic) captions
   - assFromPlan() / ffmpegArgs() / gradientPPM() / ttsCommand(): the PC/Termux ffmpeg pipeline
   - stockQuery() / normalizePexels() / normalizePixabay() / pickClip() / creditLine(): free-licence video source
   Honest: these are template / slide-style videos (text + photos/stock clips + music), not AI camera footage. MIT License. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFVideo = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const s = (v) => (v === undefined || v === null ? "" : String(v));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  /* ---------------------------------------------------------------- themes */
  const THEMES = {
    bold:   { name: "Bold",   palette: [["#7c3aed", "#db2777"], ["#2563eb", "#7c3aed"], ["#db2777", "#f97316"], ["#0891b2", "#2563eb"], ["#16a34a", "#0891b2"]], text: "#ffffff", accent: "#fde047", font: "800" },
    neon:   { name: "Neon",   palette: [["#0f172a", "#312e81"], ["#111827", "#0e7490"], ["#1e1b4b", "#831843"], ["#022c22", "#0f172a"]], text: "#ffffff", accent: "#22d3ee", font: "800" },
    sunset: { name: "Sunset", palette: [["#f97316", "#db2777"], ["#facc15", "#f97316"], ["#e11d48", "#7c3aed"], ["#fb923c", "#e11d48"]], text: "#ffffff", accent: "#1e1b4b", font: "800" },
    clean:  { name: "Clean",  palette: [["#f8fafc", "#e0e7ff"], ["#fefce8", "#fde68a"], ["#ecfeff", "#bae6fd"], ["#fdf2f8", "#fbcfe8"]], text: "#0f172a", accent: "#7c3aed", font: "800" },
  };
  const SIZES = { "1080x1920": [1080, 1920], "720x1280": [720, 1280] };

  /* ---------------------------------------------------------------- script -> slides */
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;
  function stripEmoji(t) { return s(t).replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").trim(); }
  /* caption/post text -> clean spoken/slide text: no hashtags, links, @mentions, markdown */
  function cleanText(t) {
    return s(t)
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/(^|\s)[#@][\p{L}\p{N}_]+/gu, " ")
      .replace(/[*_`~>|\[\]{}]/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .split("\n").map((l) => l.trim()).filter((l) => l && !/^[-–—•.\s]*$/.test(l)).join("\n")
      .trim();
  }
  function wordsOf(t) { return s(t).split(/\s+/).filter(Boolean); }
  /* -> short slide lines (max `maxWords` words each, max `maxLines` lines) */
  function splitScript(text, opt) {
    opt = opt || {};
    const maxWords = opt.maxWords || 9; const maxLines = opt.maxLines || 8;
    const lines = [];
    for (const para of cleanText(text).split("\n")) {
      const sentences = para.split(/(?<=[.!?।|])\s+/).map((x) => x.trim()).filter(Boolean);
      for (const sen of sentences) {
        const w = wordsOf(sen);
        if (w.length <= maxWords) { lines.push(w.join(" ")); continue; }
        const parts = Math.ceil(w.length / maxWords); const per = Math.ceil(w.length / parts);
        for (let i = 0; i < w.length; i += per) lines.push(w.slice(i, i + per).join(" "));
      }
    }
    return lines.filter((l) => /[\p{L}\p{N}]/u.test(l)).slice(0, maxLines);
  }
  function sameText(a, b) { const n = (x) => s(x).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""); return n(a) && n(a) === n(b); }

  /* o = { script, title, seconds (15-60, 0 = auto), size, theme, cta, fps }  ->  timed plan */
  function planVideo(o) {
    o = o || {};
    const [width, height] = SIZES[o.size] || SIZES["1080x1920"];
    const theme = THEMES[o.theme] ? o.theme : "bold";
    let lines = splitScript(o.script, { maxLines: o.maxLines || 8 });
    const title = cleanText(o.title).replace(/\n/g, " ").slice(0, 90);
    if (title && !lines.some((l) => sameText(l, title))) lines.unshift(title);
    if (!lines.length) lines = [title || "YantraFlow"];
    const cta = o.cta === undefined ? "Like + Follow karo" : cleanText(o.cta);
    const scenes = lines.map((text, i) => ({ text, kind: i === 0 ? "hook" : "line" }));
    if (cta && !scenes.some((x) => sameText(x.text, cta))) scenes.push({ text: cta, kind: "cta" });
    const wc = scenes.map((x) => Math.max(1, wordsOf(x.text).length));
    const totalWords = wc.reduce((a, b) => a + b, 0);
    const auto = scenes.length * 1.2 + totalWords * 0.42;
    const duration = Math.round(clamp(Number(o.seconds) > 0 ? Number(o.seconds) : auto, 15, 60) * 10) / 10;
    // time per scene: proportional to words, but at least 2 s
    const minS = 2; const free = Math.max(0, duration - minS * scenes.length);
    let t = 0;
    const pal = THEMES[theme].palette;
    const out = scenes.map((x, i) => {
      const d = scenes.length * minS >= duration ? duration / scenes.length : minS + free * (wc[i] / totalWords);
      const start = Math.round(t * 100) / 100; t += d;
      const end = i === scenes.length - 1 ? duration : Math.round(t * 100) / 100;
      const w = wordsOf(x.text);
      const reveal = Math.min(0.6 * (end - start), 0.32 * w.length + 0.1);
      const words = w.map((word, k) => ({ w: word, t: Math.round((start + 0.15 + (reveal * k) / Math.max(1, w.length)) * 100) / 100 }));
      return { i, kind: x.kind, text: x.text, start, end, words, bg: pal[i % pal.length] };
    });
    return { width, height, fps: Number(o.fps) || 30, duration, theme, colors: THEMES[theme], title, scenes: out, watermark: cleanText(o.watermark || "").slice(0, 40) };
  }
  function sceneAt(plan, t) { for (const sc of plan.scenes) if (t >= sc.start && t < sc.end) return sc; return plan.scenes[plan.scenes.length - 1]; }
  /* voice-over text (what TTS reads) */
  function voiceText(plan) { return plan.scenes.map((x) => stripEmoji(x.text)).join(". ").replace(/\.\s*\./g, "."); }

  /* ---------------------------------------------------------------- PC/Termux ffmpeg pipeline */
  const ASS_TIME = (t) => { t = Math.max(0, t); const h = Math.floor(t / 3600); const m = Math.floor((t % 3600) / 60); const sec = (t % 60).toFixed(2).padStart(5, "0"); return `${h}:${String(m).padStart(2, "0")}:${sec}`; };
  const ASS_COLOR = (hex, alpha) => { const h = s(hex).replace("#", "").padEnd(6, "0"); return `&H${(alpha || "00")}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };
  const assEsc = (t) => stripEmoji(t).replace(/[{}\\]/g, "").replace(/\n/g, " ");
  /* kinetic captions: every word pops in (accent colour) while the earlier words stay */
  function assFromPlan(plan, opt) {
    opt = opt || {};
    const C = plan.colors; const font = opt.font || "DejaVu Sans";
    const big = (sc) => (sc.kind === "hook" ? 108 : wordsOf(sc.text).length <= 4 ? 112 : 94);
    const head = [
      "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      `Style: Main,${font},80,${ASS_COLOR(C.text)},${ASS_COLOR(C.accent)},${ASS_COLOR("#000000", "40")},${ASS_COLOR("#000000", "80")},-1,0,0,0,100,100,0,0,1,6,3,5,90,90,0,1`,
      `Style: Top,${font},40,${ASS_COLOR(C.text)},${ASS_COLOR(C.accent)},${ASS_COLOR("#000000", "60")},${ASS_COLOR("#000000", "90")},-1,0,0,0,100,100,0,0,1,3,1,8,80,80,140,1`,
      `Style: Mark,${font},34,${ASS_COLOR(C.text, "40")},${ASS_COLOR(C.accent)},${ASS_COLOR("#000000", "80")},${ASS_COLOR("#000000", "A0")},-1,0,0,0,100,100,0,0,1,2,0,2,80,80,90,1`,
      "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ];
    const ev = [];
    if (plan.title && plan.scenes[0] && !sameText(plan.scenes[0].text, plan.title)) ev.push(`Dialogue: 0,${ASS_TIME(plan.scenes[0].end)},${ASS_TIME(plan.duration)},Top,,0,0,0,,${assEsc(plan.title)}`);
    if (plan.watermark) ev.push(`Dialogue: 0,${ASS_TIME(0)},${ASS_TIME(plan.duration)},Mark,,0,0,0,,${assEsc(plan.watermark)}`);
    for (const sc of plan.scenes) {
      const fs = big(sc); const w = sc.words;
      for (let k = 0; k < w.length; k++) {
        const st = w[k].t; const en = k + 1 < w.length ? w[k + 1].t : sc.end;
        const prev = w.slice(0, k).map((x) => assEsc(x.w)).join(" ");
        const pop = `{\\c${ASS_COLOR(C.accent)}\\fscx125\\fscy125\\t(0,180,\\fscx100\\fscy100)}${assEsc(w[k].w)}{\\c${ASS_COLOR(C.text)}}`;
        const rest = k === w.length - 1 ? "" : `{\\alpha&HFF&} ${w.slice(k + 1).map((x) => assEsc(x.w)).join(" ")}`;
        const fadeOut = k === w.length - 1 ? "\\fad(0,180)" : "";
        ev.push(`Dialogue: 1,${ASS_TIME(st)},${ASS_TIME(en)},Main,,0,0,0,,{\\fs${fs}${fadeOut}}${prev ? prev + " " : ""}${pop}${rest}`);
      }
    }
    return head.concat(ev).join("\n") + "\n";
  }
  /* soft gradient background image (binary PPM, tiny; ffmpeg scales it up) */
  function hexRgb(h) { h = s(h).replace("#", ""); return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]; }
  function gradientPPM(w, h, c1, c2, seed) {
    const a = hexRgb(c1); const b = hexRgb(c2);
    const header = `P6\n${w} ${h}\n255\n`;
    const px = new Uint8Array(header.length + w * h * 3);
    for (let i = 0; i < header.length; i++) px[i] = header.charCodeAt(i);
    const r = (n) => { const x = Math.sin((seed || 1) * 9301 + n * 49297) * 233280; return x - Math.floor(x); };
    const blobs = [0, 1, 2].map((n) => ({ x: r(n) * w, y: r(n + 7) * h, rad: (0.25 + r(n + 3) * 0.3) * w }));
    let o = header.length;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = clamp((x / w) * 0.35 + (y / h) * 0.65, 0, 1);
      let glow = 0; for (const bl of blobs) { const d = Math.hypot(x - bl.x, y - bl.y) / bl.rad; if (d < 1) glow += (1 - d) * (1 - d) * 0.22; }
      for (let c = 0; c < 3; c++) px[o++] = clamp(Math.round(a[c] + (b[c] - a[c]) * t + 255 * glow), 0, 255);
    }
    return px;
  }
  /* o = { bg: {type: "image"|"video", files:[...]}, voice, music ("generated" | file | ""), ass, out, musicVolume }  -> ffmpeg argument list (run inside the work folder) */
  function ffmpegArgs(plan, o) {
    const W = plan.width; const H = plan.height; const D = plan.duration; const fps = plan.fps;
    const SW = Math.round(W * 1.12 / 2) * 2; const SH = Math.round(H * 1.12 / 2) * 2;
    const args = ["-y", "-hide_banner", "-loglevel", "error"];
    const f = []; let n = 0;
    const bg = o.bg || { type: "image", files: [] };
    const cover = `scale=${SW}:${SH}:force_original_aspect_ratio=increase,crop=${SW}:${SH}`;
    if (bg.type === "video") {
      args.push("-stream_loop", "-1", "-i", bg.files[0]); n++;
      f.push(`[0:v]${cover},crop=${W}:${H}:x='(iw-ow)/2':y='(ih-oh)/2',setsar=1,fps=${fps},trim=duration=${D},setpts=PTS-STARTPTS,eq=brightness=-0.07:saturation=1.08,format=yuv420p[bg]`);
    } else {
      const files = bg.files.length ? bg.files : [];
      plan.scenes.forEach((sc, i) => {
        const d = Math.max(0.5, sc.end - sc.start).toFixed(2);
        args.push("-loop", "1", "-framerate", String(fps), "-t", d, "-i", files[i % files.length]);
        const dir = i % 2 ? `(iw-ow)*(1-t/${d})` : `(iw-ow)*t/${d}`;
        f.push(`[${n}:v]${cover},crop=${W}:${H}:x='${dir}':y='(ih-oh)/2',setsar=1,fps=${fps},format=yuv420p[s${i}]`);
        n++;
      });
      f.push(`${plan.scenes.map((_, i) => `[s${i}]`).join("")}concat=n=${plan.scenes.length}:v=1:a=0${bg.gradient ? `,hue=h='t*2'` : ",eq=brightness=-0.07"}[bg]`);
    }
    // progress bar (grows left -> right)
    args.push("-f", "lavfi", "-i", `color=c=${(plan.colors.accent || "#ffffff").replace("#", "0x")}:s=${W}x${Math.round(H / 160)}:r=${fps}:d=${D}`);
    const pb = n++;
    f.push(`[bg]ass=${o.ass || "captions.ass"}[cap]`);
    f.push(`[cap][${pb}:v]overlay=x='-W+W*t/${D}':y=${H - Math.round(H / 160)}:shortest=1,format=yuv420p[vout]`);
    // audio: music + optional voice
    const aIn = [];
    if (o.music === "generated") {
      // royalty-free by construction: a soft 4-chord pad generated by ffmpeg itself
      const chord = "if(lt(mod(t,8),2),261.6,if(lt(mod(t,8),4),220,if(lt(mod(t,8),6),174.6,196)))";
      args.push("-f", "lavfi", "-i", `aevalsrc='0.05*(sin(2*PI*${chord}*t)+sin(2*PI*${chord}*1.26*t)+sin(2*PI*${chord}*1.5*t))*(0.65+0.35*sin(2*PI*2*t))|0.05*(sin(2*PI*${chord}*t*1.003)+sin(2*PI*${chord}*1.26*t)+sin(2*PI*${chord}*1.5*t*0.997))*(0.65+0.35*sin(2*PI*2*t))':s=44100:d=${D}`);
      aIn.push(`[${n++}:a]volume=${o.voice ? 0.6 : 1}[m]`);
    } else if (o.music) {
      args.push("-stream_loop", "-1", "-i", o.music);
      aIn.push(`[${n++}:a]volume=${o.musicVolume || (o.voice ? 0.18 : 0.6)},atrim=0:${D}[m]`);
    }
    if (o.voice) { args.push("-i", o.voice); aIn.push(`[${n++}:a]adelay=350|350,apad[v]`); }
    let amap;
    if (!aIn.length) { args.push("-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo:d=${D}`); amap = `${n++}:a`; }
    else {
      f.push(...aIn);
      const labels = (o.music ? "[m]" : "") + (o.voice ? "[v]" : "");
      f.push(`${labels}${labels.length > 3 ? "amix=inputs=2:duration=first:normalize=0," : ""}atrim=0:${D},afade=t=out:st=${Math.max(0, D - 1.2)}:d=1.2,aformat=sample_rates=44100:channel_layouts=stereo[aout]`);
      amap = "[aout]";
    }
    args.push("-filter_complex", f.join(";"), "-map", "[vout]", "-map", amap,
      "-c:v", "libx264", "-preset", o.preset || "veryfast", "-crf", String(o.crf || 26), "-pix_fmt", "yuv420p", "-r", String(fps),
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-t", String(D), "-movflags", "+faststart", o.out || "video.mp4");
    return args;
  }
  /* ---------------------------------------------------------------- Video Editor (stock / own clip -> Shorts/Reels) */
  /* o = { duration, hook, cta, watermark, captions:[{start,end,text}], theme } -> ASS overlay (hook at top for 3 s, CTA at the end, Hindi captions at the bottom) */
  function editAss(o) {
    const C = (THEMES[o.theme] || THEMES.bold); const font = o.font || "DejaVu Sans"; const D = Number(o.duration) || 15;
    const ev = [];
    const hook = assEsc(cleanText(o.hook).replace(/\n/g, " ")).slice(0, 90); const cta = assEsc(cleanText(o.cta).replace(/\n/g, " ")).slice(0, 60);
    if (hook) ev.push(`Dialogue: 2,${ASS_TIME(0.1)},${ASS_TIME(Math.min(3.5, D * 0.4))},Hook,,0,0,0,,{\\fad(150,250)\\fscx120\\fscy120\\t(0,220,\\fscx100\\fscy100)}${hook}`);
    if (cta) ev.push(`Dialogue: 2,${ASS_TIME(Math.max(0, D - 3))},${ASS_TIME(D)},Cta,,0,0,0,,{\\fad(200,0)\\fscx80\\fscy80\\t(0,220,\\fscx100\\fscy100)}${cta}`);
    if (o.watermark) ev.push(`Dialogue: 1,${ASS_TIME(0)},${ASS_TIME(D)},Mark,,0,0,0,,${assEsc(o.watermark).slice(0, 40)}`);
    for (const c of o.captions || []) { if (c.start < D && s(c.text).trim()) ev.push(`Dialogue: 1,${ASS_TIME(c.start)},${ASS_TIME(Math.min(D, c.end))},Cap,,0,0,0,,${assEsc(c.text).slice(0, 160)}`); }
    return [
      "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
      "[V4+ Styles]",
      "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
      `Style: Hook,${font},84,${ASS_COLOR("#ffffff")},${ASS_COLOR(C.accent)},${ASS_COLOR("#000000", "00")},${ASS_COLOR("#000000", "60")},-1,0,0,0,100,100,0,0,1,7,3,8,70,70,230,1`,
      `Style: Cta,${font},76,${ASS_COLOR("#ffffff")},${ASS_COLOR(C.accent)},${ASS_COLOR(C.palette[0][0])},${ASS_COLOR("#000000", "60")},-1,0,0,0,100,100,0,0,3,18,0,5,90,90,0,1`,
      `Style: Cap,${font},64,${ASS_COLOR("#ffffff")},${ASS_COLOR(C.accent)},${ASS_COLOR("#000000", "00")},${ASS_COLOR("#000000", "70")},-1,0,0,0,100,100,0,0,1,5,2,2,70,70,330,1`,
      `Style: Mark,${font},34,${ASS_COLOR("#ffffff", "40")},${ASS_COLOR(C.accent)},${ASS_COLOR("#000000", "80")},${ASS_COLOR("#000000", "A0")},-1,0,0,0,100,100,0,0,1,2,0,2,80,80,90,1`,
      "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ].concat(ev).join("\n") + "\n";
  }
  /* o = { input, hasAudio, srcDuration, maxSeconds, speed, music ("generated"|file|""), dubs:[{file, start}], origVolume, ass, out, W, H } */
  function editArgs(o) {
    const W = o.W || 1080; const H = o.H || 1920; const sp = clamp(Number(o.speed) || 1, 0.5, 2);
    const D = Math.round(Math.min(Number(o.maxSeconds) || 60, 60, (Number(o.srcDuration) || 60) / sp) * 100) / 100;
    const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", o.input];
    const f = [`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,setpts=PTS/${sp},fps=30,trim=duration=${D},setpts=PTS-STARTPTS,ass=${o.ass || "edit.ass"},format=yuv420p[vout]`];
    let n = 1; const mix = [];
    const ov = o.dubs && o.dubs.length ? (o.origVolume ?? 0.25) : (o.origVolume ?? 1);
    if (o.hasAudio) { f.push(`[0:a]atempo=${sp},volume=${ov},atrim=0:${D},asetpts=PTS-STARTPTS[a0]`); mix.push("[a0]"); }
    if (o.music === "generated") {
      const chord = "if(lt(mod(t,8),2),261.6,if(lt(mod(t,8),4),220,if(lt(mod(t,8),6),174.6,196)))";
      args.push("-f", "lavfi", "-i", `aevalsrc='0.05*(sin(2*PI*${chord}*t)+sin(2*PI*${chord}*1.26*t)+sin(2*PI*${chord}*1.5*t))*(0.65+0.35*sin(2*PI*2*t))':s=44100:d=${D}`);
      f.push(`[${n++}:a]volume=${o.hasAudio ? 0.35 : 1},aformat=channel_layouts=stereo[am]`); mix.push("[am]");
    } else if (o.music) { args.push("-stream_loop", "-1", "-i", o.music); f.push(`[${n++}:a]volume=${o.hasAudio ? 0.15 : 0.6},atrim=0:${D}[am]`); mix.push("[am]"); }
    (o.dubs || []).forEach((d, k) => { args.push("-i", d.file); const ms = Math.round(Math.max(0, d.start / sp) * 1000); f.push(`[${n++}:a]adelay=${ms}|${ms},volume=1.4[d${k}]`); mix.push(`[d${k}]`); });
    if (!mix.length) { args.push("-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo:d=${D}`); f.push(`[${n++}:a]anull[aout]`); }
    else f.push(`${mix.join("")}${mix.length > 1 ? `amix=inputs=${mix.length}:duration=longest:normalize=0,` : ""}apad,atrim=0:${D},afade=t=out:st=${Math.max(0, D - 1)}:d=1,aformat=sample_rates=44100:channel_layouts=stereo[aout]`);
    args.push("-filter_complex", f.join(";"), "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", o.preset || "veryfast", "-crf", String(o.crf || 24), "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-t", String(D), "-movflags", "+faststart", o.out || "edited.mp4");
    return { args, duration: D };
  }
  /* AI translate: transcript segments -> Hindi/Hinglish lines (same count) */
  function translateMessages(segments, language) {
    const lang = language === "Hinglish" ? "Hinglish (Hindi written in English letters)" : "Hindi (Devanagari script)";
    return [
      { role: "system", content: `Translate each line of a short video's English speech into natural, simple ${lang}, short enough for captions. Keep the meaning and the humour. Reply ONLY with a JSON array of strings, same number of items, same order.` },
      { role: "user", content: JSON.stringify((segments || []).map((x) => s(x.text).trim())) },
    ];
  }
  function parseTranslation(raw, segments) {
    let arr = null; const t = s(raw).replace(/^\s*```(json)?/i, "").replace(/```\s*$/, "").trim();
    try { arr = JSON.parse(t); } catch (_) { const m = t.match(/\[[\s\S]*\]/); if (m) { try { arr = JSON.parse(m[0]); } catch (__) { /* */ } } }
    if (!Array.isArray(arr)) arr = t.split(/\n+/).map((l) => l.replace(/^\s*\d+[.)]\s*/, "").replace(/^"|",?$/g, "").trim()).filter(Boolean);
    return (segments || []).map((sg, i) => ({ start: sg.start, end: sg.end, text: s(arr[i] || "").trim() || s(sg.text).trim(), original: sg.text }));
  }
  const looksVideo = (m) => /\.(mp4|mov|m4v|webm|mkv|3gp)(\?|$)/i.test(s(m)) || /^yfvideo:\/\//.test(s(m)) || /video-files|\/video\//i.test(s(m));

  /* free text-to-speech on PC/Termux: edge-tts (pip install edge-tts, needs internet) or espeak-ng (offline, robotic) */
  const VOICES = { Hinglish: "hi-IN-MadhurNeural", Hindi: "hi-IN-SwaraNeural", English: "en-IN-NeerjaNeural" };
  function ttsCommand(engine, text, voice, out) {
    text = stripEmoji(text).slice(0, 3000);
    if (engine === "espeak") return ["espeak-ng", ["-v", /^hi/.test(voice || "") ? "hi" : "en", "-s", "150", "-w", out, text]];
    return ["edge-tts", ["--voice", voice || VOICES.Hinglish, "--text", text, "--write-media", out]];
  }

  /* ---------------------------------------------------------------- free-licence video finder */
  const TOPIC_WORDS = {
    funny: "funny", comedy: "funny", meme: "funny", memes: "funny", masti: "funny", mazak: "funny", hasi: "funny", majedar: "funny",
    billi: "cat", billiyan: "cat", cats: "cat", kitten: "cat", kutta: "dog", kutte: "dog", doggy: "dog", dogs: "dog", puppy: "dog",
    janwar: "animals", animal: "animals", bacche: "kids", baby: "baby", motivation: "motivation", gym: "fitness", fitness: "fitness",
    khana: "food", food: "food", baarish: "rain", barish: "rain", pahad: "mountains", nature: "nature", samundar: "ocean", sea: "ocean",
    travel: "travel", ghoomna: "travel", bike: "motorcycle", car: "car", gaadi: "car", tech: "technology", technology: "technology",
    business: "business", paisa: "money", money: "money", dance: "dance", music: "music", gaana: "music", festival: "festival", diwali: "diwali",
  };
  function stockQuery(topic) {
    const w = s(topic).toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter(Boolean);
    const STOP = new Set(["video", "videos", "clip", "clips", "reel", "reels", "short", "shorts", "daily", "roz", "new", "naya", "wala", "wali", "ke", "ki", "ka", "aur", "and", "the", "for", "of"]);
    const out = []; for (const x of w) { if (STOP.has(x)) continue; const m = TOPIC_WORDS[x] || (x.length > 2 && /^[a-z]+$/.test(x) ? x : ""); if (m && !out.includes(m)) out.push(m); }
    return out.slice(0, 4).join(" ") || "funny animals";
  }
  function pickFile(files, portrait) {
    const mp4 = files.filter((f) => f && f.url && (!f.type || /mp4/i.test(f.type)));
    const ok = mp4.filter((f) => Math.min(f.width || 0, f.height || 0) >= 540 && Math.max(f.width || 0, f.height || 0) <= 1920);
    const pool = (ok.length ? ok : mp4).slice().sort((a, b) => {
      const sa = Math.abs(Math.min(a.width || 0, a.height || 0) - 1080); const sb = Math.abs(Math.min(b.width || 0, b.height || 0) - 1080);
      return sa - sb;
    });
    return pool[0] || null;
  }
  function normalizePexels(json) {
    return ((json && json.videos) || []).map((v) => {
      const files = (v.video_files || []).map((f) => ({ url: f.link, width: f.width, height: f.height, type: f.file_type }));
      const best = pickFile(files, v.height > v.width);
      return best && {
        id: "pexels:" + v.id, source: "Pexels", url: best.url, width: best.width || v.width, height: best.height || v.height, duration: Number(v.duration) || 0,
        pageUrl: v.url || `https://www.pexels.com/video/${v.id}/`, author: (v.user && v.user.name) || "Pexels creator", authorUrl: (v.user && v.user.url) || "",
        thumb: v.image || "", tags: s(v.url).split("/").filter(Boolean).pop().replace(/-\d+\/?$/, "").replace(/-/g, " "), license: "Pexels License (free to use, no attribution required)",
      };
    }).filter(Boolean);
  }
  function normalizePixabay(json) {
    return ((json && json.hits) || []).map((h) => {
      const V = h.videos || {};
      const files = ["large", "medium", "small"].map((k) => V[k] && V[k].url ? { url: V[k].url, width: V[k].width, height: V[k].height, type: "video/mp4" } : null).filter(Boolean);
      const best = pickFile(files);
      return best && {
        id: "pixabay:" + h.id, source: "Pixabay", url: best.url, width: best.width, height: best.height, duration: Number(h.duration) || 0,
        pageUrl: h.pageURL || `https://pixabay.com/videos/id-${h.id}/`, author: h.user || "Pixabay creator", authorUrl: h.user ? `https://pixabay.com/users/${h.user}-${h.user_id}/` : "",
        thumb: (V.small && V.small.thumbnail) || (V.tiny && V.tiny.thumbnail) || "", tags: s(h.tags), license: "Pixabay Content License (free to use, no attribution required)",
      };
    }).filter(Boolean);
  }
  /* best not-yet-used clip: portrait first, duration in range, a little randomness so runs differ */
  function pickClip(list, o) {
    o = o || {}; const used = new Set(o.used || []);
    const min = Number(o.minSeconds) || 0; const max = Number(o.maxSeconds) || 60;
    const fresh = (list || []).filter((c) => c && !used.has(c.id));
    const fits = fresh.filter((c) => (!c.duration || (c.duration >= min && c.duration <= max)));
    const pool = (fits.length ? fits : fresh);
    if (!pool.length) return null;
    const wantPortrait = (o.orientation || "portrait") === "portrait";
    const score = (c) => (wantPortrait ? (c.height > c.width ? 0 : 1) : 0);
    const best = Math.min(...pool.map(score));
    const top = pool.filter((c) => score(c) === best).slice(0, 5);
    const r = typeof o.random === "number" ? o.random : Math.random();
    return top[Math.floor(r * top.length) % top.length];
  }
  function creditLine(c) {
    if (!c || !c.source || /own/i.test(c.source)) return "";
    return `Video: ${c.author} on ${c.source} (${c.pageUrl}) — ${c.license.split(" (")[0]}`;
  }
  function addCredit(text, credit) { text = s(text); return credit && !text.includes(credit) ? (text ? `${text}\n\n${credit}` : credit) : text; }
  /* "My own clips": one link or file path per line, used in rotation */
  function ownClips(text) { return s(text).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((u, i) => ({ id: "own:" + u, source: "Own", url: u, duration: 0, width: 0, height: 0, author: "", pageUrl: "", license: "", tags: "" })); }
  const COPYRIGHT_NOTE = "Pinterest / Instagram / YouTube se dusron ke videos repost karna = copyright strike (channel ban ho sakta hai) aur Pinterest download API deta hi nahi. Isliye ye project sirf free-licence videos (Pexels, Pixabay — repost allowed) ya tumhare apne clips use karta hai, credit line apne aap description me.";

  return { editAss, editArgs, translateMessages, parseTranslation, looksVideo, THEMES, SIZES, cleanText, stripEmoji, splitScript, planVideo, sceneAt, voiceText, assFromPlan, gradientPPM, ffmpegArgs, ttsCommand, VOICES,
    stockQuery, normalizePexels, normalizePixabay, pickClip, creditLine, addCredit, ownClips, COPYRIGHT_NOTE };
});
