"use strict";
// Minimal SMTP client (no dependencies). Supports SSL (port 465), STARTTLS (587)
// and plain (25 / local test servers), AUTH LOGIN/PLAIN, UTF-8 subject + body.
const net = require("node:net");
const tls = require("node:tls");
const os = require("node:os");
const crypto = require("node:crypto");

function b64(s) { return Buffer.from(String(s), "utf8").toString("base64"); }
function wrap76(s) { return s.replace(/.{1,76}/g, "$&\r\n"); }
function encodeHeader(s) {
  s = String(s || "");
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
}

class Conn {
  constructor(socket, timeoutMs) {
    this.timeoutMs = timeoutMs;
    this.attach(socket);
  }
  attach(socket) {
    this.socket = socket;
    this.buf = "";
    this.waiters = [];
    this.lines = [];
    socket.setEncoding("utf8");
    socket.on("data", (d) => { this.buf += d; this.pump(); });
    socket.on("error", (e) => this.fail(e));
    socket.on("close", () => this.fail(new Error("SMTP connection closed")));
  }
  detach() { this.socket.removeAllListeners("data"); this.socket.removeAllListeners("error"); this.socket.removeAllListeners("close"); }
  fail(e) { const w = this.waiters.splice(0); w.forEach((x) => x.reject(e)); this.dead = e; }
  pump() {
    let i;
    while ((i = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, i).replace(/\r$/, "");
      this.buf = this.buf.slice(i + 1);
      this.lines.push(line);
      if (/^\d{3} /.test(line) || /^\d{3}$/.test(line)) {
        const resp = { code: parseInt(line.slice(0, 3), 10), lines: this.lines.splice(0) };
        const w = this.waiters.shift();
        if (w) w.resolve(resp); else this.pending = resp;
      }
    }
  }
  read() {
    if (this.pending) { const p = this.pending; this.pending = null; return Promise.resolve(p); }
    if (this.dead) return Promise.reject(this.dead);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("SMTP timeout")), this.timeoutMs);
      this.waiters.push({ resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
    });
  }
  async cmd(line, expect) {
    if (line !== null) this.socket.write(line + "\r\n");
    const r = await this.read();
    if (expect && !expect.includes(r.code)) {
      const shown = /^AUTH|^[A-Za-z0-9+/=]{8,}$/.test(line || "") ? "(credentials)" : line;
      throw new Error(`SMTP ${shown || "greeting"} -> ${r.lines.join(" | ")}`);
    }
    return r;
  }
}

function connect(opts) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => reject(e);
    const s = opts.secure
      ? tls.connect({ host: opts.host, port: opts.port, servername: opts.host, rejectUnauthorized: opts.rejectUnauthorized !== false }, () => resolve(s))
      : net.connect({ host: opts.host, port: opts.port }, () => resolve(s));
    s.once("error", onErr);
    s.setTimeout(opts.timeoutMs, () => s.destroy(new Error("SMTP connect timeout")));
  });
}

async function sendMail(opts, msg) {
  const o = Object.assign({ port: 587, secure: false, timeoutMs: 20000 }, opts);
  o.port = Number(o.port) || 587;
  if (o.secure === "true") o.secure = true;
  if (o.port === 465 && opts.secure === undefined) o.secure = true;
  if (!o.host) throw new Error("SMTP host is empty. Fill Settings → Email (SMTP).");
  const to = String(msg.to || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (!to.length) throw new Error("Email 'To' is empty");
  const from = msg.from || o.from || o.user;
  if (!from) throw new Error("Email 'From' is empty (set it in Settings → Email)");
  const addr = (s) => { const m = String(s).match(/<([^>]+)>/); return m ? m[1] : String(s).trim(); };

  const sock = await connect(o);
  const c = new Conn(sock, o.timeoutMs);
  const host = os.hostname() || "yantraflow.local";
  try {
    await c.cmd(null, [220]);
    let ehlo = await c.cmd(`EHLO ${host}`, [250]);
    if (!o.secure && ehlo.lines.some((l) => /STARTTLS/i.test(l))) {
      await c.cmd("STARTTLS", [220]);
      c.detach();
      const secured = await new Promise((resolve, reject) => {
        const t = tls.connect({ socket: sock, servername: o.host, rejectUnauthorized: o.rejectUnauthorized !== false }, () => resolve(t));
        t.once("error", reject);
      });
      c.attach(secured);
      ehlo = await c.cmd(`EHLO ${host}`, [250]);
    }
    if (o.user) {
      const caps = ehlo.lines.join(" ");
      if (/AUTH[^\n]*PLAIN/i.test(caps)) {
        await c.cmd(`AUTH PLAIN ${b64(`\u0000${o.user}\u0000${o.pass || ""}`)}`, [235]);
      } else {
        await c.cmd("AUTH LOGIN", [334]);
        await c.cmd(b64(o.user), [334]);
        await c.cmd(b64(o.pass || ""), [235]);
      }
    }
    await c.cmd(`MAIL FROM:<${addr(from)}>`, [250]);
    for (const r of to) await c.cmd(`RCPT TO:<${addr(r)}>`, [250, 251]);
    await c.cmd("DATA", [354]);
    const messageId = `<${crypto.randomUUID()}@yantraflow>`;
    const isHtml = !!msg.html;
    const body = isHtml ? msg.html : String(msg.text || "");
    const data = [
      `From: ${from}`,
      `To: ${to.join(", ")}`,
      `Subject: ${encodeHeader(msg.subject || "(no subject)")}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: ${messageId}`,
      "MIME-Version: 1.0",
      `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap76(b64(body)),
    ].join("\r\n");
    await c.cmd(data + "\r\n.", [250]);
    try { await c.cmd("QUIT", [221]); } catch (_) { /* some servers just close */ }
    return { accepted: to, messageId };
  } finally {
    c.socket.destroy();
  }
}

module.exports = { sendMail };
