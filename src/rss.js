"use strict";
// Small RSS 2.0 / Atom parser — good enough for news feeds, YouTube, blogs.
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function decode(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] !== undefined ? ENT[n.toLowerCase()] : m))
    .trim();
}
function stripHtml(s) {
  return decode(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function tag(block, names) {
  for (const n of names) {
    const re = new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i");
    const m = block.match(re);
    if (m) return decode(m[1]);
  }
  return "";
}
function parseFeed(xml) {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const re = isAtom ? /<entry[\s>][\s\S]*?<\/entry>/gi : /<item[\s>][\s\S]*?<\/item>/gi;
  const blocks = xml.match(re) || [];
  for (const b of blocks) {
    let link = tag(b, ["link"]);
    if (!link) {
      const m = b.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      if (m) link = decode(m[1]);
    }
    const raw = tag(b, ["content:encoded", "content", "description", "summary", "media:description"]);
    const text = stripHtml(raw);
    items.push({
      title: stripHtml(tag(b, ["title"])),
      link,
      pubDate: tag(b, ["pubDate", "published", "updated", "dc:date"]),
      author: stripHtml(tag(b, ["author", "dc:creator", "name"])),
      content: text,
      contentSnippet: text.length > 300 ? text.slice(0, 297) + "..." : text,
      guid: tag(b, ["guid", "id"]) || link,
    });
  }
  const head = xml.replace(re, "");
  return { title: stripHtml(tag(head, ["title"])), items };
}
module.exports = { parseFeed, stripHtml };
