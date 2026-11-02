/* YantraFlow Auto Video Maker — WEBSITE renderer (canvas + MediaRecorder, runs inside your browser, free).
   Output: MP4 when the browser can record MP4 (new Chrome / Safari), otherwise WebM. Telegram + YouTube take both;
   Instagram needs MP4 + a public link -> use the PC/Termux version for Instagram videos. Keep this tab open while it records
   (a 20 s video takes about 20 s). No AI voice on the website (browsers can't record speech) — PC/Termux has edge-tts voice. MIT License. */
(function () {
  "use strict";
  const V = window.YFVideo;
  const STORE = new Map(); let seq = 0;
  function put(blob, meta) { const id = `v${Date.now().toString(36)}${(seq++).toString(36)}`; STORE.set(id, Object.assign({ blob, type: blob.type, url: URL.createObjectURL(blob) }, meta || {})); while (STORE.size > 6) { const k = STORE.keys().next().value; try { URL.revokeObjectURL(STORE.get(k).url); } catch (_) { /* */ } STORE.delete(k); } return `yfvideo://${id}`; }
  function get(ref) { const m = String(ref || "").match(/^yfvideo:\/\/(\w+)/); return m ? STORE.get(m[1]) || null : null; }
  const MIMES = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
  function supported() {
    if (typeof MediaRecorder === "undefined" || !document.createElement("canvas").captureStream) return { ok: false, why: "Is browser me video recording nahi hoti — Chrome (Android/PC) use karo, ya PC/Termux version." };
    const mime = MIMES.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (_) { return false; } }) || "";
    return { ok: !!mime, mime, ext: /mp4/.test(mime) ? "mp4" : "webm", why: mime ? "" : "Browser koi video format record nahi kar raha" };
  }
  const loadImg = (src) => new Promise((ok, bad) => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => ok(im); im.onerror = () => bad(new Error("photo load nahi hui: " + src)); im.src = src; });
  const loadVid = (src, muted) => new Promise((ok, bad) => {
    const v = document.createElement("video"); v.crossOrigin = "anonymous"; v.muted = !!muted; v.playsInline = true; v.preload = "auto"; v.loop = !!muted;
    const t = setTimeout(() => bad(new Error("video load timeout")), 45000);
    v.oncanplay = () => { clearTimeout(t); ok(v); }; v.onerror = () => { clearTimeout(t); bad(new Error("video load nahi hui (browser ye format nahi chala sakta ya link block hai)")); };
    v.src = src; v.load();
  });
  function cover(ctx, el, W, H, zoom, panX) {
    const iw = el.videoWidth || el.naturalWidth || el.width; const ih = el.videoHeight || el.naturalHeight || el.height; if (!iw || !ih) return;
    const sc = Math.max(W / iw, H / ih) * (zoom || 1); const dw = iw * sc; const dh = ih * sc;
    ctx.drawImage(el, (W - dw) / 2 + (panX || 0) * (dw - W) / 2, (H - dh) / 2, dw, dh);
  }
  function wrap(ctx, words, maxW) { const lines = [[]]; for (const w of words) { const cur = lines[lines.length - 1]; const test = cur.concat([w]).map((x) => x.w).join(" "); if (cur.length && ctx.measureText(test).width > maxW) lines.push([w]); else cur.push(w); } return lines; }
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  function textBlock(ctx, txt, x, y, maxW, size, fill, stroke) {
    ctx.font = `800 ${size}px system-ui, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif`;
    const lines = wrap(ctx, String(txt).split(/\s+/).filter(Boolean).map((w) => ({ w })), maxW);
    const lh = size * 1.18; let yy = y - ((lines.length - 1) * lh) / 2;
    for (const l of lines) { const t = l.map((q) => q.w).join(" "); ctx.lineWidth = size * 0.12; ctx.strokeStyle = stroke || "rgba(0,0,0,.6)"; ctx.strokeText(t, x, yy); ctx.fillStyle = fill; ctx.fillText(t, x, yy); yy += lh; }
  }
  /* soft royalty-free pad made by the browser itself */
  function synthMusic(ac, dest, seconds, vol) {
    const master = ac.createGain(); master.gain.value = vol * 1.8; master.connect(dest);
    const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    const t0 = ac.currentTime + 0.05;
    for (let k = 0; k * 2 < seconds + 2; k++) {
      const ch = chords[k % 4]; const st = t0 + k * 2;
      for (const f of ch) { const o = ac.createOscillator(); o.type = "triangle"; o.frequency.value = f; const g = ac.createGain(); g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.05, st + 0.25); g.gain.linearRampToValueAtTime(0.035, st + 1.6); g.gain.linearRampToValueAtTime(0, st + 2.1); o.connect(g); g.connect(master); o.start(st); o.stop(st + 2.2); }
      const kick = ac.createOscillator(); const kg = ac.createGain(); kick.frequency.setValueAtTime(110, st); kick.frequency.exponentialRampToValueAtTime(45, st + 0.25); kg.gain.setValueAtTime(0.25, st); kg.gain.exponentialRampToValueAtTime(0.001, st + 0.3); kick.connect(kg); kg.connect(master); kick.start(st); kick.stop(st + 0.35);
    }
  }
  /* o = { plan } (Auto Video Maker)  or  o = { edit: { clip, hook, cta, watermark, maxSeconds, speed, theme } } (Video Editor)
         bg: { type: "gradient"|"image"|"video", urls: [] }, music: "generated"|"off"|url, onProgress(p) */
  async function render(o) {
    const sup = supported(); if (!sup.ok) throw new Error(sup.why);
    const edit = o.edit || null;
    const plan = o.plan || null;
    const W = plan ? plan.width : 1080; const H = plan ? plan.height : 1920;
    const theme = (plan && plan.colors) || V.THEMES[(edit && edit.theme) || "bold"] || V.THEMES.bold;
    const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d"); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    let D; let clip = null; const imgs = []; let bgVid = null;
    if (edit) {
      clip = await loadVid(edit.clip, false);
      const sp = Math.min(2, Math.max(0.5, Number(edit.speed) || 1)); clip.playbackRate = sp;
      D = Math.min(Number(edit.maxSeconds) || 59, 60, (clip.duration || 60) / sp);
    } else {
      D = plan.duration;
      const bg = o.bg || { type: "gradient" };
      if (bg.type === "image") for (const u of (bg.urls || []).slice(0, 8)) { try { imgs.push(await loadImg(u)); } catch (e) { /* skip */ } }
      if (bg.type === "video" && bg.urls && bg.urls[0]) { try { bgVid = await loadVid(bg.urls[0], true); } catch (_) { bgVid = null; } }
    }
    // audio
    let ac = null; const tracks = [];
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)(); try { await ac.resume(); } catch (_) { /* */ }
      const dest = ac.createMediaStreamDestination();
      if (clip) { const src = ac.createMediaElementSource(clip); const g = ac.createGain(); g.gain.value = 1; src.connect(g); g.connect(dest); }
      const music = o.music || "generated";
      if (music === "generated") synthMusic(ac, dest, D, clip ? 0.35 : 1);
      else if (music && music !== "off") { const a = new Audio(); a.crossOrigin = "anonymous"; a.loop = true; a.src = music; const src = ac.createMediaElementSource(a); const g = ac.createGain(); g.gain.value = clip ? 0.2 : 0.7; src.connect(g); g.connect(dest); a.play().catch(() => {}); o._audioEl = a; }
      tracks.push(...dest.stream.getAudioTracks());
    } catch (_) { /* no audio */ }
    const stream = canvas.captureStream(30); tracks.forEach((t) => stream.addTrack(t));
    const rec = new MediaRecorder(stream, { mimeType: sup.mime, videoBitsPerSecond: o.bitrate || 4500000, audioBitsPerSecond: 128000 });
    const chunks = []; rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((ok) => { rec.onstop = ok; });
    const draw = (t) => {
      if (edit) {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); cover(ctx, clip, W, H, 1, 0);
        const hook = V.cleanText(edit.hook).replace(/\n/g, " ").slice(0, 90);
        if (hook && t < Math.min(3.5, D * 0.4)) { const a = ease(t / 0.25) * (t > 3.2 ? Math.max(0, (3.5 - t) / 0.3) : 1); ctx.globalAlpha = a; textBlock(ctx, hook, W / 2, H * 0.16, W * 0.86, 78 * (1 + 0.2 * (1 - ease(t / 0.22))), "#fff"); ctx.globalAlpha = 1; }
        const cta = V.cleanText(edit.cta).replace(/\n/g, " ").slice(0, 60);
        if (cta && t > D - 3) { const a = ease((t - (D - 3)) / 0.25); ctx.globalAlpha = a; ctx.fillStyle = theme.palette[0][0]; const bw = W * 0.82; const bh = 190; ctx.beginPath(); (ctx.roundRect ? ctx.roundRect((W - bw) / 2, H / 2 - bh / 2, bw, bh, 40) : ctx.rect((W - bw) / 2, H / 2 - bh / 2, bw, bh)); ctx.fill(); textBlock(ctx, cta, W / 2, H / 2, bw * 0.9, 64, "#fff", "rgba(0,0,0,0)"); ctx.globalAlpha = 1; }
        if (edit.watermark) { ctx.globalAlpha = 0.75; textBlock(ctx, V.cleanText(edit.watermark).slice(0, 40), W / 2, H - 90, W, 34, "#fff"); ctx.globalAlpha = 1; }
      } else {
        const sc = V.sceneAt(plan, t); const k = plan.scenes.indexOf(sc);
        if (bgVid) { cover(ctx, bgVid, W, H, 1.05, 0); ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.fillRect(0, 0, W, H); }
        else if (imgs.length) { const im = imgs[k % imgs.length]; const p = (t - sc.start) / Math.max(0.1, sc.end - sc.start); cover(ctx, im, W, H, 1.05 + 0.08 * p, k % 2 ? 0.6 - p * 1.2 : -0.6 + p * 1.2); ctx.fillStyle = "rgba(0,0,0,.30)"; ctx.fillRect(0, 0, W, H); }
        else {
          const [c1, c2] = sc.bg; const ang = t * 0.15;
          const g = ctx.createLinearGradient(W / 2 - Math.cos(ang) * W, H / 2 - Math.sin(ang) * H * 0.5, W / 2 + Math.cos(ang) * W, H / 2 + Math.sin(ang) * H * 0.5);
          g.addColorStop(0, c1); g.addColorStop(1, c2); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          for (let b = 0; b < 3; b++) { const bx = W * (0.5 + 0.38 * Math.sin(t * 0.4 + b * 2.1)); const by = H * (0.5 + 0.35 * Math.cos(t * 0.33 + b * 1.7)); const r = W * (0.35 + 0.1 * b); const rg = ctx.createRadialGradient(bx, by, 0, bx, by, r); rg.addColorStop(0, "rgba(255,255,255,.18)"); rg.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); }
          if (t - sc.start < 0.35 && k > 0) { ctx.fillStyle = `rgba(255,255,255,${0.35 * (1 - (t - sc.start) / 0.35)})`; ctx.fillRect(0, 0, W, H); }
        }
        // kinetic caption
        const size = sc.kind === "hook" ? 104 : sc.words.length <= 4 ? 112 : 92;
        ctx.font = `800 ${size}px system-ui, "Segoe UI", Roboto, "Noto Sans", sans-serif`;
        const shown = sc.words.filter((w) => w.t <= t);
        const lines = wrap(ctx, sc.words, W * 0.84); const lh = size * 1.2;
        let y = H * 0.5 - ((lines.length - 1) * lh) / 2;
        const out = Math.max(0, Math.min(1, (sc.end - t) / 0.2));
        for (const l of lines) {
          const widths = l.map((w) => ctx.measureText(w.w + " ").width); let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
          l.forEach((w, j) => {
            const cx = x + widths[j] / 2 - ctx.measureText(" ").width / 2; x += widths[j];
            if (!shown.includes(w)) return;
            const age = t - w.t; const isLast = shown[shown.length - 1] === w;
            const scl = 1 + 0.25 * (1 - ease(age / 0.18));
            ctx.save(); ctx.globalAlpha = out; ctx.translate(cx, y); ctx.scale(scl, scl);
            ctx.lineWidth = size * 0.13; ctx.strokeStyle = theme.text === "#ffffff" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.7)"; ctx.strokeText(w.w, 0, 0);
            ctx.fillStyle = isLast && age < 0.6 ? theme.accent : theme.text; ctx.fillText(w.w, 0, 0); ctx.restore();
          });
          y += lh;
        }
        if (plan.title && k > 0 && !V.cleanText(sc.text).includes(plan.title)) { ctx.globalAlpha = 0.9; textBlock(ctx, plan.title, W / 2, 170, W * 0.86, 54, theme.text, theme.text === "#ffffff" ? "rgba(0,0,0,.5)" : "rgba(255,255,255,.6)"); ctx.globalAlpha = 1; }
        if (plan.watermark) { ctx.globalAlpha = 0.7; textBlock(ctx, plan.watermark, W / 2, H - 90, W, 34, theme.text); ctx.globalAlpha = 1; }
      }
      ctx.fillStyle = theme.accent; ctx.fillRect(0, H - 12, W * Math.min(1, t / D), 12);
    };
    draw(0);
    if (clip) { clip.currentTime = 0; await clip.play().catch(() => {}); }
    if (bgVid) await bgVid.play().catch(() => {});
    rec.start(500);
    const t0 = performance.now();
    await new Promise((ok) => {
      const tick = () => { const t = (performance.now() - t0) / 1000; if (t >= D) { clearInterval(iv); ok(); return; } draw(t); if (o.onProgress) o.onProgress(t / D); };
      const iv = setInterval(tick, 1000 / 30);
    });
    draw(D - 0.01); rec.stop(); await done;
    try { clip && clip.pause(); bgVid && bgVid.pause(); o._audioEl && o._audioEl.pause(); ac && ac.close(); } catch (_) { /* */ }
    stream.getTracks().forEach((tr) => tr.stop());
    const blob = new Blob(chunks, { type: sup.mime.split(";")[0] });
    return { blob, type: blob.type, ext: sup.ext, seconds: Math.round(D * 10) / 10, width: W, height: H, bytes: blob.size };
  }
  window.YFVideoWeb = { supported, render, put, get };
})();
