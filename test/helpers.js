"use strict";
// Mock versions of every outside service, so tests never touch the internet or real keys.
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function listen(server) { return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server.address().port))); }

async function startMockApis() {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const body = raw.toString("utf8");
      const u = new URL(req.url, "http://x");
      calls.push({ method: req.method, path: u.pathname, query: Object.fromEntries(u.searchParams), headers: req.headers, body, size: raw.length });
      const json = (code, obj, headers = {}) => { res.writeHead(code, Object.assign({ "content-type": "application/json" }, headers)); res.end(JSON.stringify(obj)); };
      const p = u.pathname;
      if (p.endsWith("/chat/completions")) {
        const j = JSON.parse(body);
        const q = j.messages[j.messages.length - 1].content;
        if (q.includes("FAIL")) return json(429, { error: { message: "rate limited" } });
        const text = /JSON/.test(q) ? '{"title":"Mock title","description":"Mock desc #ai","tags":["a","b"]}' : `AI says: ${q.slice(0, 50)}`;
        return json(200, { model: "mock-model", choices: [{ message: { role: "assistant", content: text } }], usage: { total_tokens: 7 } });
      }
      if (p.startsWith("/bot")) {
        if (p.includes("BADTOKEN")) return json(401, { ok: false, error_code: 401, description: "Unauthorized" });
        return json(200, { ok: true, result: { message_id: 42, chat: { id: 1, username: "mychannel" } } });
      }
      if (p === "/rss") { res.writeHead(200, { "content-type": "application/rss+xml" }); return res.end(`<?xml version="1.0"?><rss><channel><title>Mock Feed</title><item><title>First &amp; best</title><link>https://e.com/1</link><description><![CDATA[<b>One</b> story]]></description></item><item><title>Second</title><link>https://e.com/2</link><description>Two</description></item><item><title>Third</title><link>https://e.com/3</link><description>Three</description></item></channel></rss>`); }
      if (p === "/atom") { res.writeHead(200, { "content-type": "application/atom+xml" }); return res.end(`<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>A1</title><link href="https://e.com/a1"/><summary>S1</summary><updated>2026-11-02</updated></entry></feed>`); }
      if (p === "/sheet.csv") { res.writeHead(200, { "content-type": "text/csv" }); return res.end(server.csv || "caption,videoUrl\nhello,https://v/1.mp4\n"); }
      // Instagram / Facebook Graph API
      let m;
      if ((m = p.match(/^\/graph\/(\w+)\/media$/))) return json(200, { id: "container123" });
      if (p === "/graph/container123") { server.igPolls = (server.igPolls || 0) + 1; return json(200, { status_code: server.igPolls < 2 ? "IN_PROGRESS" : "FINISHED" }); }
      if ((m = p.match(/^\/graph\/(\w+)\/media_publish$/))) return json(200, { id: "ig_media_999" });
      if ((m = p.match(/^\/graph\/(\w+)\/(feed|photos|videos)$/))) return json(200, { id: `fb_${m[2]}_1`, post_id: `page_${m[2]}_1` });
      // Google / YouTube
      if (p === "/google/token") return json(200, { access_token: "ya29.mock", expires_in: 3600 });
      if (p === "/youtube/upload" && req.method === "POST") return json(200, {}, { location: `http://127.0.0.1:${server.address().port}/youtube/session1` });
      if (p === "/youtube/session1" && req.method === "PUT") return json(200, { id: "yt_vid_123", snippet: {} });
      // X
      if (p === "/x/2/tweets") { if (!/^OAuth /.test(req.headers.authorization || "")) return json(401, { title: "Unauthorized" }); return json(201, { data: { id: "tweet_1", text: JSON.parse(body).text } }); }
      // Discord / Slack webhooks
      if (p.startsWith("/discord/")) { res.writeHead(204); return res.end(); }
      if (p.startsWith("/slack/")) { res.writeHead(200); return res.end("ok"); }
      if (p === "/status/500") return json(500, { down: true });
      if (p === "/json") return json(200, { hello: "world", n: 5 });
      json(404, { error: "mock: no route " + p });
    });
  });
  const port = await listen(server);
  const base = `http://127.0.0.1:${port}`;
  process.env.YANTRAFLOW_TELEGRAM_API = base;
  process.env.YANTRAFLOW_GRAPH_API = `${base}/graph`;
  process.env.YANTRAFLOW_GOOGLE_TOKEN_URL = `${base}/google/token`;
  process.env.YANTRAFLOW_YOUTUBE_UPLOAD = `${base}/youtube/upload`;
  process.env.YANTRAFLOW_X_API = `${base}/x`;
  process.env.YANTRAFLOW_IG_POLL_MS = "10";
  return { server, base, calls, close: () => new Promise((r) => server.close(r)) };
}

// Tiny SMTP server: records the message, accepts AUTH LOGIN/PLAIN.
async function startMockSmtp() {
  const mails = [];
  const server = net.createServer((sock) => {
    let buf = ""; let inData = false; let cur = { rcpt: [] }; let authStep = 0;
    sock.write("220 mock ESMTP\r\n");
    sock.on("data", (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") { inData = false; mails.push(cur); cur = { rcpt: [] }; sock.write("250 OK queued\r\n"); }
          else cur.data = (cur.data || "") + line + "\r\n";
          continue;
        }
        if (authStep === 1) { cur.user = Buffer.from(line, "base64").toString(); authStep = 2; sock.write("334 UGFzc3dvcmQ6\r\n"); continue; }
        if (authStep === 2) { cur.pass = Buffer.from(line, "base64").toString(); authStep = 0; sock.write("235 ok\r\n"); continue; }
        if (/^EHLO/i.test(line)) sock.write("250-mock\r\n250-AUTH LOGIN\r\n250 OK\r\n");
        else if (/^AUTH LOGIN/i.test(line)) { authStep = 1; sock.write("334 VXNlcm5hbWU6\r\n"); }
        else if (/^MAIL FROM/i.test(line)) { cur.from = line; sock.write("250 OK\r\n"); }
        else if (/^RCPT TO/i.test(line)) { cur.rcpt.push(line); sock.write("250 OK\r\n"); }
        else if (/^DATA/i.test(line)) { inData = true; sock.write("354 go\r\n"); }
        else if (/^QUIT/i.test(line)) { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("250 OK\r\n");
      }
    });
    sock.on("error", () => {});
  });
  const port = await listen(server);
  return { port, mails, close: () => new Promise((r) => server.close(r)) };
}

function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), "yantraflow-test-")); }
const silent = { log() {} };
module.exports = { startMockApis, startMockSmtp, tmpDir, silent, listen };
