/* YantraFlow link preview — read a page's OpenGraph / Twitter / <title> tags.
   Shared by the PC/Termux server and the website. The fetching is done by each edition;
   this file only parses HTML and builds the Telegram caption. MIT License. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YFLinkPreview = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", hellip: "...", mdash: "-", ndash: "-", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };
  function decode(t) {
    return String(t || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
      if (e[0] === "#") { const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (_) { return m; } }
      return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
    }).replace(/\s+/g, " ").trim();
  }
  function attrs(tag) {
    const o = {};
    const re = /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let m;
    while ((m = re.exec(tag))) o[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5];
    return o;
  }
  function absolute(u, base) {
    u = String(u || "").trim();
    if (!u) return "";
    try { return new URL(u, base || undefined).href; } catch (_) { return /^https?:\/\//i.test(u) ? u : ""; }
  }
  function youtubeId(url) {
    const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  /* -> { url, title, description, image, siteName, type, video } */
  function parse(html, pageUrl) {
    html = String(html || "");
    const head = html.slice(0, 600000);
    const meta = {};
    const tags = head.match(/<meta\b[^>]*>/gi) || [];
    for (const t of tags) {
      const a = attrs(t);
      const k = (a.property || a.name || a.itemprop || "").toLowerCase();
      if (k && a.content !== undefined && meta[k] === undefined) meta[k] = decode(a.content);
    }
    const link = {};
    for (const t of head.match(/<link\b[^>]*>/gi) || []) { const a = attrs(t); const rel = (a.rel || "").toLowerCase(); if (rel && a.href && !link[rel]) link[rel] = a.href; }
    const titleTag = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    const pick = (...keys) => { for (const k of keys) if (meta[k]) return meta[k]; return ""; };
    const url = absolute(pick("og:url", "twitter:url") || link.canonical || pageUrl, pageUrl) || pageUrl || "";
    const out = {
      url: pageUrl || url,
      canonicalUrl: url,
      title: pick("og:title", "twitter:title") || decode(titleTag) || "",
      description: pick("og:description", "twitter:description", "description"),
      image: absolute(pick("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src", "image", "thumbnailurl") || link["image_src"], url || pageUrl),
      siteName: pick("og:site_name", "application-name", "twitter:site"),
      type: pick("og:type"),
      video: absolute(pick("og:video:secure_url", "og:video:url", "og:video"), url || pageUrl),
    };
    const yt = youtubeId(pageUrl) || youtubeId(url);
    if (yt && !out.image) out.image = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
    if (yt && !out.siteName) out.siteName = "YouTube";
    if (!out.siteName) { try { out.siteName = new URL(out.url).hostname.replace(/^www\./, ""); } catch (_) { /* */ } }
    return out;
  }
  // Same shape from a JSON metadata service (microlink.io style or our Supabase function)
  function fromService(json, pageUrl) {
    const d = (json && (json.data || json)) || {};
    const img = d.image && typeof d.image === "object" ? d.image.url : d.image;
    const out = { url: pageUrl, canonicalUrl: d.url || pageUrl, title: decode(d.title || ""), description: decode(d.description || ""), image: img || "", siteName: decode(d.publisher || d.siteName || ""), type: d.type || "", video: (d.video && d.video.url) || "" };
    const yt = youtubeId(pageUrl);
    if (yt && !out.image) out.image = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;
    return out;
  }
  function esc(t) { return String(t || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  /* Telegram caption (HTML mode). Photo captions max 1024 chars, messages 4096. */
  function caption(p, max) {
    max = max || 1024;
    const link = p.url || p.canonicalUrl || "";
    const title = String(p.title || "").slice(0, 250);
    const tail = `\n\n${esc(link)}`;
    const headTxt = (title ? `<b>${esc(title)}</b>` : "") + (p.siteName ? `${title ? "\n" : ""}<i>${esc(p.siteName)}</i>` : "");
    let desc = String(p.description || "");
    const room = max - headTxt.length - tail.length - 4;
    if (desc.length > room) desc = desc.slice(0, Math.max(0, room - 3)).replace(/\s+\S*$/, "") + "...";
    return (headTxt + (desc ? `\n\n${esc(desc)}` : "") + tail).trim();
  }
  function looksEmpty(p) { return !p || (!p.title && !p.description && !p.image); }
  // Telegram's words when it cannot download a URL itself -> we download + upload the bytes instead
  const TG_URL_FAIL = /failed to get HTTP URL content|wrong file identifier|wrong type of the web page content|wrong remote file|WEBPAGE_MEDIA_EMPTY|WEBPAGE_CURL_FAILED|IMAGE_PROCESS_FAILED|PHOTO_INVALID_DIMENSIONS|failed to get/i;
  return { parse, fromService, caption, youtubeId, decode, looksEmpty, TG_URL_FAIL, esc };
});
