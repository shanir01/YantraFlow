"use strict";
// v4.5 Terminal (PC / Termux only): runs shell commands in the YantraFlow folder for the logged-in owner.
// Safety: needs the start-up password session, only from this device (127.0.0.1) unless YANTRAFLOW_TERMINAL=lan,
// YANTRAFLOW_TERMINAL=off turns it off, and a few machine-wrecking commands are refused.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DENY = [
  [/\brm\s+(-[a-z]*\s+)*-[a-z]*r[a-z]*f?[a-z]*\s+(-[a-z]+\s+)*(\/|~|\$HOME|\/\*|\*)\s*$/i, "poora system / home delete karne wala rm"],
  [/\brm\s+(-[a-z]*\s+)*-[a-z]*f[a-z]*r[a-z]*\s+(\/|~|\$HOME|\/\*)\s*$/i, "poora system / home delete karne wala rm"],
  [/\bmkfs(\.\w+)?\b/i, "disk format (mkfs)"],
  [/\bdd\b[^|]*\bof=\/dev\//i, "disk pe dd likhna"],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, "fork bomb"],
  [/\b(shutdown|reboot|halt|poweroff)\b/i, "PC band / restart"],
  [/>\s*\/dev\/(sd[a-z]|nvme|mmcblk)/i, "disk overwrite"],
];
function checkCommand(cmd) {
  const c = String(cmd || "").trim();
  if (!c) return { ok: false, reason: "Khaali command" };
  if (c.length > 4000) return { ok: false, reason: "Command bahut lamba hai" };
  for (const [re, why] of DENY) if (re.test(c)) return { ok: false, reason: `Ye command block hai (${why}). Zaroori ho to apne PC ke asli terminal me chalao.` };
  return { ok: true };
}
/* "cd x" alone changes the session folder (each command runs in a fresh shell). */
function resolveCd(cmd, cwd, home) {
  const m = String(cmd).trim().match(/^cd(?:\s+(.+))?$/);
  if (!m) return null;
  let target = (m[1] || "~").trim().replace(/^["']|["']$/g, "");
  if (target === "~" || target.startsWith("~/")) target = path.join(home || os.homedir(), target.slice(1));
  const next = path.resolve(cwd, target);
  if (!fs.existsSync(next) || !fs.statSync(next).isDirectory()) return { error: `cd: folder nahi mila: ${target}` };
  return { cwd: next };
}
function isLocal(addr) { return /^(127\.|::1$|::ffff:127\.)/.test(String(addr || "")); }
function shellFor() {
  if (process.platform === "win32") return { sh: process.env.ComSpec || "cmd.exe", args: (c) => ["/d", "/s", "/c", c] };
  const sh = [process.env.SHELL, "/data/data/com.termux/files/usr/bin/bash", "/bin/bash", "/bin/sh"].find((x) => x && fs.existsSync(x)) || "/bin/sh";
  return { sh, args: (c) => ["-c", c] };
}

function createTerminal({ root, env = process.env }) {
  const mode = String(env.YANTRAFLOW_TERMINAL || "local").toLowerCase(); // local | lan | off
  const cwds = new Map(); // session -> cwd
  const procs = new Map(); // session -> child
  const cwdOf = (sid) => cwds.get(sid) || root;
  function allowed(req) {
    if (mode === "off") return "Terminal band hai (YANTRAFLOW_TERMINAL=off).";
    if (mode !== "lan" && !isLocal(req.socket.remoteAddress)) return "Terminal sirf isi PC/phone (localhost) se khulta hai. Dusre device se chahiye to YANTRAFLOW_TERMINAL=lan set karo.";
    if (req.headers["x-yf-terminal"] !== "1") return "Missing terminal header.";
    return null;
  }
  function info(sid) { const { sh } = shellFor(); return { enabled: mode !== "off", mode, cwd: cwdOf(sid), shell: sh, platform: process.platform, termux: !!env.PREFIX && /com\.termux/.test(env.PREFIX), running: procs.has(sid) }; }
  function run(req, res, sid, cmd) {
    const deny = allowed(req); if (deny) { res.writeHead(403, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: deny })); }
    const chk = checkCommand(cmd); if (!chk.ok) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: chk.reason })); }
    if (procs.has(sid)) { res.writeHead(409, { "content-type": "application/json" }); return res.end(JSON.stringify({ error: "Pichhla command abhi chal raha hai — Stop (Ctrl+C) dabao." })); }
    const cd = resolveCd(cmd, cwdOf(sid), env.HOME);
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
    if (cd) { if (cd.cwd) cwds.set(sid, cd.cwd); res.write(cd.error ? cd.error + "\n" : ""); return res.end(`\n[exit ${cd.error ? 1 : 0}] ${cwdOf(sid)}\n`); }
    const { sh, args } = shellFor();
    const child = spawn(sh, args(cmd), { cwd: cwdOf(sid), env: Object.assign({}, env, { TERM: "dumb", FORCE_COLOR: "0", NO_COLOR: "1", CI: "1" }) });
    procs.set(sid, child);
    const t = setTimeout(() => { res.write("\n[15 min ho gaye — command roka gaya]\n"); try { child.kill("SIGKILL"); } catch (_) { /* */ } }, 15 * 60 * 1000);
    const strip = (b) => b.toString().replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
    child.stdout.on("data", (d) => res.write(strip(d)));
    child.stderr.on("data", (d) => res.write(strip(d)));
    child.on("error", (e) => { res.write(`\n${e.message}\n`); });
    child.on("close", (code, signal) => { clearTimeout(t); procs.delete(sid); res.end(`\n[exit ${code === null ? signal || "killed" : code}] ${cwdOf(sid)}\n`); });
    req.on("close", () => { if (procs.get(sid) === child && !res.writableEnded) { try { child.kill("SIGTERM"); } catch (_) { /* */ } } });
  }
  function kill(req, sid) {
    const deny = allowed(req); if (deny) return { ok: false, error: deny };
    const c = procs.get(sid); if (!c) return { ok: true, killed: false };
    try { c.kill("SIGINT"); setTimeout(() => { if (procs.get(sid) === c) try { c.kill("SIGKILL"); } catch (_) { /* */ } }, 1500); } catch (_) { /* */ }
    return { ok: true, killed: true };
  }
  return { run, kill, info, allowed, mode };
}
module.exports = { createTerminal, checkCommand, resolveCd, isLocal };
