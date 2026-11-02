"use strict";
// OAuth 1.0a request signing (HMAC-SHA1) — used by the X/Twitter node.
const crypto = require("node:crypto");
const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
function oauth1Header({ method, url, consumerKey, consumerSecret, token, tokenSecret, nonce, timestamp }) {
  const u = new URL(url);
  const oauth = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce || crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(timestamp || Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
  };
  const params = [];
  for (const [k, v] of u.searchParams) params.push([enc(k), enc(v)]);
  for (const [k, v] of Object.entries(oauth)) params.push([enc(k), enc(v)]);
  params.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const paramStr = params.map(([k, v]) => `${k}=${v}`).join("&");
  const base = [method.toUpperCase(), enc(`${u.origin}${u.pathname}`), enc(paramStr)].join("&");
  const key = `${enc(consumerSecret)}&${enc(tokenSecret || "")}`;
  oauth.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return "OAuth " + Object.entries(oauth).map(([k, v]) => `${enc(k)}="${enc(v)}"`).join(", ");
}
module.exports = { oauth1Header };
