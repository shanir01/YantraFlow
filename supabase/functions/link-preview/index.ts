// YantraFlow link-preview proxy — a Supabase Edge Function (Deno).
// Lets the YantraFlow WEBSITE read any link's preview (browsers can't, because of CORS),
// without the ~50/day limit of the free public service.
//   GET  ?url=https://...            -> { title, description, image, siteName, url }
//   GET  ?image=1&url=https://...    -> the image bytes (so the website can upload them to Telegram)
// Deploy (one time):  supabase functions deploy link-preview --no-verify-jwt
// Then paste https://<project-ref>.supabase.co/functions/v1/link-preview on the YantraFlow Keys page.
// It stores nothing and needs no secret. MIT License.

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "*" };
const UA = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";
const BOT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
const decode = (t = "") => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m).replace(/\s+/g, " ").trim();
function attrs(tag: string) { const o: Record<string, string> = {}; for (const m of tag.matchAll(/([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) o[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5]; return o; }
function parse(html: string, pageUrl: string) {
  const meta: Record<string, string> = {};
  for (const t of html.slice(0, 600000).match(/<meta\b[^>]*>/gi) || []) { const a = attrs(t); const k = (a.property || a.name || a.itemprop || "").toLowerCase(); if (k && a.content !== undefined && meta[k] === undefined) meta[k] = decode(a.content); }
  const pick = (...k: string[]) => k.map((x) => meta[x]).find(Boolean) || "";
  const abs = (u: string) => { try { return u ? new URL(u, pageUrl).href : ""; } catch { return ""; } };
  const title = pick("og:title", "twitter:title") || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const yt = pageUrl.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return { url: pageUrl, title, description: pick("og:description", "twitter:description", "description"), image: abs(pick("og:image:secure_url", "og:image", "twitter:image", "twitter:image:src")) || (yt ? `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` : ""), siteName: pick("og:site_name") || new URL(pageUrl).hostname.replace(/^www\./, "") };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const q = new URL(req.url).searchParams;
  let url = (q.get("url") || "").trim();
  if (!/^https?:\/\//i.test(url)) return Response.json({ error: "Give ?url=https://..." }, { status: 400, headers: CORS });
  try {
    if (q.get("image")) {
      const r = await fetch(url, { headers: { "user-agent": UA } });
      const type = r.headers.get("content-type") || "application/octet-stream";
      if (!r.ok || !/^image\//.test(type)) return Response.json({ error: `not an image (${r.status} ${type})` }, { status: 502, headers: CORS });
      return new Response(r.body, { headers: { ...CORS, "content-type": type, "cache-control": "public, max-age=3600" } });
    }
    let best: ReturnType<typeof parse> | null = null;
    for (const ua of [UA, BOT]) {
      const r = await fetch(url, { headers: { "user-agent": ua, "accept-language": "en-IN,en;q=0.9" }, redirect: "follow" });
      const p = parse(await r.text(), url);
      if (!best || (p.title && !best.title) || (p.image && !best.image)) best = p;
      if (p.title && p.image) break;
    }
    return Response.json(best, { headers: { ...CORS, "cache-control": "public, max-age=600" } });
  } catch (e) {
    return Response.json({ error: String((e as Error).message || e) }, { status: 502, headers: CORS });
  }
});
