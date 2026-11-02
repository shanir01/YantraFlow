"use strict";
// PC / Termux Auto Video Maker: plan (public/js/video-core.js) -> ffmpeg -> vertical MP4 (H.264 + AAC, Shorts/Reels ready).
// Needs ffmpeg (PC: ffmpeg.org / winget install ffmpeg · Termux: pkg install ffmpeg). Voice (optional): pip install edge-tts, or espeak-ng.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const V = require("../public/js/video-core.js");

function run(cmd, args, opt = {}) {
  return new Promise((resolve) => {
    let out = ""; let done = false;
    let p;
    try { p = spawn(cmd, args, { cwd: opt.cwd, stdio: ["ignore", "pipe", "pipe"] }); } catch (e) { resolve({ code: -1, out: e.message }); return; }
    const kill = setTimeout(() => { try { p.kill("SIGKILL"); } catch (_) { /* */ } }, opt.timeoutMs || 300000);
    p.stdout.on("data", (d) => { out += d; if (out.length > 20000) out = out.slice(-20000); });
    p.stderr.on("data", (d) => { out += d; if (out.length > 20000) out = out.slice(-20000); });
    p.on("error", (e) => { if (!done) { done = true; clearTimeout(kill); resolve({ code: -1, out: e.code === "ENOENT" ? `${cmd} not installed` : e.message }); } });
    p.on("close", (code) => { if (!done) { done = true; clearTimeout(kill); resolve({ code, out }); } });
  });
}
const FFMPEG = () => process.env.YANTRAFLOW_FFMPEG || "ffmpeg";
async function hasFfmpeg() { const r = await run(FFMPEG(), ["-version"], { timeoutMs: 15000 }); return r.code === 0; }
const NO_FFMPEG = "ffmpeg nahi mila. Install karo — Termux: pkg install ffmpeg · Windows: winget install ffmpeg · Linux: sudo apt install ffmpeg · Mac: brew install ffmpeg. Phir dobara Run karo.";

/* o = { plan, bg: {type:"video"|"image"|"gradient", files:[local paths]}, voice: "off"|"edge"|"espeak"|"auto", voiceName, music: "generated"|"off"|path, outFile, workDir } */
async function makeVideo(o) {
  if (!(await hasFfmpeg())) throw new Error(NO_FFMPEG);
  const plan = o.plan;
  const work = o.workDir || fs.mkdtempSync(path.join(require("node:os").tmpdir(), "yf-video-"));
  fs.mkdirSync(work, { recursive: true });
  const warnings = [];
  let bg = o.bg && o.bg.files && o.bg.files.length && o.bg.type !== "gradient" ? { type: o.bg.type, files: o.bg.files.map((f) => path.resolve(f)) } : null;
  if (!bg) {
    const files = plan.scenes.map((sc, i) => { const f = path.join(work, `bg${i}.ppm`); fs.writeFileSync(f, V.gradientPPM(216, 384, sc.bg[0], sc.bg[1], i + 1)); return f; });
    bg = { type: "image", files, gradient: true };
  }
  fs.writeFileSync(path.join(work, "captions.ass"), V.assFromPlan(plan, { font: o.font }));
  // optional voice-over
  let voice = ""; let voiceBy = "none";
  const want = o.voice || "off";
  if (want !== "off") {
    for (const eng of want === "auto" ? ["edge", "espeak"] : [want]) {
      const out = path.join(work, eng === "espeak" ? "voice.wav" : "voice.mp3");
      const [cmd, args] = V.ttsCommand(eng, V.voiceText(plan), o.voiceName, out);
      const r = await run(cmd, args, { cwd: work, timeoutMs: 120000 });
      if (r.code === 0 && fs.existsSync(out) && fs.statSync(out).size > 1000) { voice = out; voiceBy = eng === "edge" ? "edge-tts" : "espeak-ng"; break; }
      warnings.push(`${eng === "edge" ? "edge-tts" : "espeak-ng"} voice nahi bani (${(r.out || "").trim().split("\n").pop().slice(0, 160)}) — ${eng === "edge" ? "pip install edge-tts" : "pkg install espeak"}`);
    }
    if (voice) {
      // stretch the video so the whole voice-over fits (max 60 s)
      const pr = await run(process.env.YANTRAFLOW_FFPROBE || "ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", voice], { timeoutMs: 30000 });
      const vd = parseFloat(pr.out) || 0;
      if (vd + 1.2 > plan.duration && plan.duration < 60) {
        const nplan = V.planVideo(Object.assign({}, o.planInput || {}, { seconds: Math.min(60, Math.ceil(vd + 1.5)) }));
        if (o.planInput) { Object.assign(plan, nplan); fs.writeFileSync(path.join(work, "captions.ass"), V.assFromPlan(plan, { font: o.font })); }
      }
    }
  }
  const music = o.music === "off" ? "" : o.music && o.music !== "generated" ? path.resolve(o.music) : "generated";
  const outFile = path.resolve(o.outFile || path.join(work, "video.mp4"));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const args = V.ffmpegArgs(plan, { bg, voice, music, ass: "captions.ass", out: outFile, crf: o.crf, preset: o.preset });
  const r = await run(FFMPEG(), args, { cwd: work, timeoutMs: o.timeoutMs || 600000 });
  if (r.code !== 0 || !fs.existsSync(outFile)) throw new Error(`ffmpeg video nahi bana paaya: ${(r.out || "").trim().slice(-400)}`);
  if (!o.keepWork) for (const f of fs.readdirSync(work)) if (!path.resolve(work, f).startsWith(outFile)) { try { fs.unlinkSync(path.join(work, f)); } catch (_) { /* */ } }
  return { file: outFile, seconds: plan.duration, bytes: fs.statSync(outFile).size, voice: voiceBy, background: bg.gradient ? "gradient" : bg.type, warnings, width: plan.width, height: plan.height };
}
/* speech -> text segments with faster-whisper (pip install faster-whisper). Returns { language, segments:[{start,end,text}] } or throws. */
const WHISPER_PY = `
import sys, json
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[2], device="cpu", compute_type="int8")
segs, info = m.transcribe(sys.argv[1], vad_filter=True)
out = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs]
print(json.dumps({"language": info.language, "prob": round(info.language_probability, 2), "segments": out}))
`;
async function transcribe(file, model) {
  const py = process.env.YANTRAFLOW_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const r = await run(py, ["-c", WHISPER_PY, file, model || "base"], { timeoutMs: 600000 });
  if (r.code !== 0) throw new Error(/No module named|not installed/.test(r.out) ? "faster-whisper nahi mila — PC pe: pip install faster-whisper (Termux pe ye mushkil hai, wahan translate off rakho)" : `Transcribe fail: ${r.out.trim().slice(-200)}`);
  const line = r.out.trim().split("\n").reverse().find((l) => l.startsWith("{"));
  return JSON.parse(line);
}
async function probe(file) {
  const r = await run(process.env.YANTRAFLOW_FFPROBE || "ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file], { timeoutMs: 30000 });
  try { const j = JSON.parse(r.out); return { duration: parseFloat(j.format && j.format.duration) || 0, hasAudio: (j.streams || []).some((x) => x.codec_type === "audio"), hasVideo: (j.streams || []).some((x) => x.codec_type === "video") }; }
  catch (_) { return { duration: 0, hasAudio: false, hasVideo: false }; }
}
/* o = { input, hook, cta, watermark, maxSeconds, speed, music, theme, captions:[...], dubLines:[{start,text}], voiceName, outFile, workDir } */
async function editVideo(o) {
  if (!(await hasFfmpeg())) throw new Error(NO_FFMPEG);
  const work = o.workDir || fs.mkdtempSync(path.join(require("node:os").tmpdir(), "yf-edit-"));
  fs.mkdirSync(work, { recursive: true });
  const info = await probe(o.input);
  if (!info.hasVideo) throw new Error(`Ye video file nahi lagti: ${o.input}`);
  const warnings = []; const dubs = [];
  for (const [k, d] of (o.dubLines || []).slice(0, 14).entries()) {
    const out = path.join(work, `dub${k}.mp3`);
    const [cmd, args] = V.ttsCommand("edge", d.text, o.voiceName || "hi-IN-MadhurNeural", out);
    const r = await run(cmd, args, { cwd: work, timeoutMs: 60000 });
    if (r.code === 0 && fs.existsSync(out)) dubs.push({ file: out, start: d.start }); else { warnings.push("Hindi dub nahi bana (pip install edge-tts, internet chahiye)"); break; }
  }
  const sp = Math.max(0.5, Math.min(2, Number(o.speed) || 1));
  const D = Math.min(Number(o.maxSeconds) || 60, 60, (info.duration || 60) / sp);
  const caps = (o.captions || []).map((c) => ({ start: c.start / sp, end: c.end / sp, text: c.text }));
  fs.writeFileSync(path.join(work, "edit.ass"), V.editAss({ duration: D, hook: o.hook, cta: o.cta, watermark: o.watermark, captions: caps, theme: o.theme }));
  const music = o.music === "off" || !o.music ? "" : o.music === "generated" ? "generated" : path.resolve(o.music);
  const outFile = path.resolve(o.outFile || path.join(work, "edited.mp4"));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const e = V.editArgs({ input: path.resolve(o.input), hasAudio: info.hasAudio, srcDuration: info.duration, maxSeconds: o.maxSeconds, speed: sp, music, dubs, ass: "edit.ass", out: outFile });
  const r = await run(FFMPEG(), e.args, { cwd: work, timeoutMs: o.timeoutMs || 900000 });
  if (r.code !== 0 || !fs.existsSync(outFile)) throw new Error(`ffmpeg edit fail: ${(r.out || "").trim().slice(-400)}`);
  if (!o.keepWork) for (const f of fs.readdirSync(work)) { try { fs.unlinkSync(path.join(work, f)); } catch (_) { /* */ } }
  return { file: outFile, seconds: e.duration, bytes: fs.statSync(outFile).size, hadAudio: info.hasAudio, dubbed: dubs.length > 0, captions: caps.length, warnings };
}
module.exports = { editVideo, transcribe, probe, makeVideo, hasFfmpeg, NO_FFMPEG, run };
