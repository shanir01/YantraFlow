/* Credentials page fields — shared by server and browser. Secrets are stored
   only on your own device (data/credentials.json or browser localStorage). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.YF_CRED_SCHEMA = factory();
})(typeof self !== "undefined" ? self : this, function () {
  return [
    { id: "ai", title: "AI (OpenAI-compatible)", icon: "sparkles", help: "Default works with your FreeLLM-Router on http://localhost:8787/v1. Or use Groq / OpenRouter / Gemini OpenAI-endpoints with your own key. Model blank = auto-pick: Groq (https://api.groq.com/openai/v1) uses openai/gpt-oss-120b, Gemini (https://generativelanguage.googleapis.com/v1beta/openai) uses gemini-3.8-flash, OpenRouter uses openrouter/auto, OpenAI uses gpt-4o-mini, FreeLLM-Router uses auto.",
      test: true, fields: [
        { key: "baseUrl", label: "Base URL", placeholder: "http://localhost:8787/v1" },
        { key: "apiKey", label: "API key", secret: true, placeholder: "local (FreeLLM-Router) or your key" },
        { key: "model", label: "Model", placeholder: "blank = auto-pick · Groq: openai/gpt-oss-120b · Gemini: gemini-3.8-flash" },
      ] },
    { id: "telegram", title: "Telegram bot", icon: "telegram", help: "Telegram → @BotFather → /newbot → copy token. Chat ID: message your bot, then open https://api.telegram.org/bot<TOKEN>/getUpdates. For a channel use @channelname and add the bot as admin.",
      test: true, fields: [
        { key: "botToken", label: "Bot token", secret: true, placeholder: "123456:ABC-DEF…" },
        { key: "chatId", label: "Default chat ID / @channel", placeholder: "123456789 or @mychannel" },
      ] },
    { id: "instagram", title: "Instagram (Graph API)", icon: "instagram", help: "Needs an Instagram Business/Creator account linked to a Facebook Page + a Meta developer app (developers.facebook.com). Get a long-lived token with instagram_content_publish permission, and your IG user ID. Photo/Reel ka link public hona chahiye (Instagram khud download karta hai) — Google Drive/localhost link nahi chalega.",
      fields: [
        { key: "userId", label: "Instagram user ID", placeholder: "1784…" },
        { key: "accessToken", label: "Access token", secret: true },
      ] },
    { id: "facebook", title: "Facebook Page", icon: "facebook", help: "Meta developer app → Graph API Explorer → Page access token with pages_manage_posts. Page ID is in Page → About.",
      fields: [
        { key: "pageId", label: "Page ID" },
        { key: "pageToken", label: "Page access token", secret: true },
      ] },
    { id: "youtube", title: "YouTube upload", icon: "youtube", help: "Google Cloud Console → enable YouTube Data API v3 → OAuth client (Desktop) → get a refresh token with scope youtube.upload (README has the steps). Free quota ≈ 6 uploads/day.",
      fields: [
        { key: "clientId", label: "OAuth client ID" },
        { key: "clientSecret", label: "OAuth client secret", secret: true },
        { key: "refreshToken", label: "Refresh token", secret: true },
      ] },
    { id: "x", title: "X / Twitter", icon: "x", help: "developer.x.com → your app → User authentication: Read and Write → Keys and tokens. Dhyan: X API se post karna ab paid hai (paid plan / pay-per-use credits) — free account se post fail ho sakta hai. Posting sirf full version (PC/Termux) se.",
      fields: [
        { key: "apiKey", label: "API key", secret: true },
        { key: "apiSecret", label: "API key secret", secret: true },
        { key: "accessToken", label: "Access token", secret: true },
        { key: "accessSecret", label: "Access token secret", secret: true },
      ] },
    { id: "linkedin", title: "LinkedIn", icon: "linkedin", help: "linkedin.com/developers → Create app → Products: add \"Share on LinkedIn\" (+ \"Sign In with LinkedIn using OpenID Connect\") → Auth → OAuth 2.0 tools → token with scopes w_member_social openid profile. Token ~60 din chalta hai, phir naya banao. Posting sirf full version (PC/Termux) se — LinkedIn browser calls block karta hai.",
      fields: [
        { key: "accessToken", label: "Access token", secret: true },
        { key: "authorUrn", label: "Author URN (optional)", placeholder: "blank = auto (urn:li:person:…)" },
        { key: "version", label: "API version (YYYYMM)", placeholder: "202610" },
      ] },
    { id: "linkpreview", title: "Link preview (website only)", icon: "link", help: "Website pe link ka preview padhne ke liye: khaali = free public service (microlink.io, ~50 links/din, no key). Apna unlimited chahiye to Supabase Edge Function deploy karo (README → v4 → Link preview proxy) aur uska URL yahan daalo. PC/Termux version ko iski zaroorat nahi.",
      fields: [
        { key: "proxyUrl", label: "Your proxy URL (optional)", placeholder: "https://<project>.supabase.co/functions/v1/link-preview" },
      ] },
    { id: "smtp", title: "Email (SMTP)", icon: "mail", help: "Gmail: smtp.gmail.com, port 465, your Gmail + an App Password (Google Account → Security → App passwords).",
      fields: [
        { key: "host", label: "SMTP host", placeholder: "smtp.gmail.com" },
        { key: "port", label: "Port", placeholder: "465" },
        { key: "user", label: "Username / email" },
        { key: "pass", label: "Password / App password", secret: true },
        { key: "from", label: "From (optional)", placeholder: "Nishu <me@gmail.com>" },
      ] },
    { id: "discord", title: "Discord", icon: "discord", help: "Channel → Edit → Integrations → Webhooks → New → Copy URL.",
      fields: [{ key: "webhookUrl", label: "Default webhook URL", secret: true }] },
    { id: "slack", title: "Slack", icon: "slack", help: "api.slack.com/apps → Incoming Webhooks → Add to channel → copy URL.",
      fields: [{ key: "webhookUrl", label: "Default webhook URL", secret: true }] },
  ];
});
