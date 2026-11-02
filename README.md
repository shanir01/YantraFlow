<p align="center"><img src="docs/banner.jpg" alt="YantraFlow — free n8n-style automation for PC and phone" width="100%"></p>

<p align="center"><img src="public/img/logo.svg" width="96" alt="YantraFlow logo"></p>
<h1 align="center">YantraFlow</h1>
<p align="center"><b>Free, n8n-style automation platform: free account, 17 ready-made Public Projects, and a drag-and-drop editor — on the web, your PC <i>and</i> your Android phone (Termux).</b><br>
Drag &amp; drop nodes → AI, Telegram, Instagram Reels, YouTube upload, webhooks, schedules. Zero dependencies. Your keys never leave your device.</p>

<p align="center">
<a href="https://yantraflow.sites.tab.bot/"><b>🌐 Try it live in your browser</b></a> ·
<a href="#-website-accounts--public-projects-v2">🧩 Public Projects</a> ·
<a href="#-quick-start-pc">💻 PC setup</a> ·
<a href="#-quick-start-android-termux">📱 Phone setup</a> ·
<a href="#-hinglish-quickstart">🇮🇳 Hinglish guide</a>
</p>
<p align="center">
<img src="https://img.shields.io/badge/license-MIT-7c5cff" alt="MIT"> <img src="https://img.shields.io/badge/node-%3E%3D18-22c55e" alt="Node 18+"> <img src="https://img.shields.io/badge/dependencies-0-00d4ff" alt="0 dependencies"> <img src="https://img.shields.io/badge/runs%20on-Windows%20%7C%20Mac%20%7C%20Linux%20%7C%20Termux-ff4fd8" alt="platforms"> <img src="https://img.shields.io/github/stars/shanir01/YantraFlow?style=social" alt="stars">
</p>

---

## Why YantraFlow?

| | YantraFlow | n8n (self-host) |
|---|---|---|
| Install | double-click `start.bat` / `sh start.sh` | Docker or `npx n8n` (heavy) |
| Runs on Android phone (Termux) | ✅ light (one Node process, ~80 MB RAM) | ⚠️ possible but heavy |
| npm dependencies | **0** | 1000+ |
| Price | Free, MIT | Free self-host (Sustainable Use License) |
| Built-in social posting | Instagram Reels, Facebook Page, YouTube upload, Telegram channel, X | via nodes |
| Works with your [FreeLLM-Router](https://github.com/shanir01/FreeLLM-Router) | ✅ default AI URL | manual |

> YantraFlow is **inspired by** n8n's idea, but it is written from scratch — no n8n code is used. n8n has far more integrations; YantraFlow is small, simple and phone-friendly.

## 📸 Screenshots

<p align="center"><img src="docs/screenshots/v2-login.jpg" width="23%" alt="Login"> <img src="docs/screenshots/v2-projects.jpg" width="23%" alt="Public Projects"> <img src="docs/screenshots/v2-project-detail.jpg" width="23%" alt="Project detail"> <img src="docs/screenshots/v2-profile.jpg" width="23%" alt="Profile"></p>

<p align="center">
<img src="docs/screenshots/phone-workflows.jpg" width="23%"> <img src="docs/screenshots/phone-run.jpg" width="23%"> <img src="docs/screenshots/phone-node.jpg" width="23%"> <img src="docs/screenshots/phone-palette.jpg" width="23%">
</p>
<p align="center"><img src="docs/screenshots/desktop-editor.jpg" width="92%"></p>

## ✨ Features

- 🎨 **Visual drag-and-drop editor** (works with touch on phones — tap ＋ to add, ⚙ to edit)
- ▶️ **Run & see every node's output** — green ✓ / red ✗ badges, item counts, full JSON
- 🧾 **Execution log** for every run (last 300 kept)
- ⏰ **Triggers:** Manual · Schedule (interval or cron) · Webhook · Folder Watch (new file) · Google Sheet / CSV new row
- 🧩 **Nodes:** HTTP Request · Set Fields · Code (JavaScript) · IF · Switch · Delay · Limit/Filter · AI Chat (any OpenAI-compatible API) · Telegram (text/photo/video/file) · Instagram Post (Reels/photos) · Facebook Page · YouTube Upload · X (Twitter) · Discord · Slack · Email (SMTP) · RSS Read · Read Sheet/CSV · Write File · Log · Respond to Webhook
- `{{ expressions }}` everywhere — `{{ $json.title }}`, `{{ $node["AI Chat"].json.text }}`, `{{ $today }}`
- 🔑 **Keys page** — tokens saved only on your device (`data/credentials.json`), never in workflows or exports
- ⬇⬆ **Import / export** workflows as JSON (share them with friends!)
- 📦 **6 ready templates** (below)
- 🌙 Dark premium UI, installable as an app (PWA), mobile-first
- 🪶 **Zero npm dependencies** — nothing to `npm install`, no native builds, perfect for Termux

## 📦 Templates

| Template | What it does |
|---|---|
| 📰 News → AI summary → Telegram | Every morning reads Google News RSS, AI writes a 2-line Hinglish summary, posts to Telegram |
| 💡 Daily AI quote → Telegram | 7 AM daily motivational quote to your chat/channel |
| 🪝 Webhook → AI reply | Your own AI API: `POST /webhook/ask {"message":"..."}` → `{"reply":"..."}` |
| 🎬 AI caption → Reel to Instagram + Telegram | 6 PM daily: AI caption + hashtags, posts Reel to Instagram and video to Telegram channel |
| 📤 New video in folder → YouTube | Drop a video in a folder → AI writes title/description/tags → uploads to YouTube → Telegram ping |
| 🚨 Website down alert | Checks a site every 5 min, Telegram alert if status ≠ 200 |

## 👤 Website accounts & Public Projects (v2)

The live website **https://yantraflow.sites.tab.bot/** is now a small platform:

- **Free account** — email + password only (Sign up / Log in / Forgot password). Each account gets its own workflows, runs and keys (keys stay in that browser, never on a server).
- **Profile** — avatar (initials or your photo), name, bio. **Settings**: theme (Dark / AMOLED / Light), language (English / Hinglish), Keys page, export data, delete data, change password, delete account. **About** and **Developer** pages.
- **🧩 Public Projects** — 17 ready-made automations with category filters (YouTube, Instagram, Telegram, Gmail, AI Content, Video). Every project has a `tier`/`price` field in [`public/js/projects.js`](public/js/projects.js) — **all FREE right now**. One tap on **Use this project** copies it into your workflows.

| Project | Category | Where it runs |
|---|---|---|
| AI viral script generator (topic → hook, script, caption, hashtags) | AI Content | 🌐 website |
| Viral video analyser (title/description/transcript → why it went viral + remake plan) | Video | 🌐 website — analyses **text only**, it cannot watch the video |
| Profile optimiser (unique name, bio, highlights, content pillars) | Instagram / YouTube | 🌐 website |
| YouTube title, description & tags (AI SEO) | YouTube | 🌐 website |
| Weekly content calendar generator | AI Content | 🌐 website |
| Comment keyword → auto DM text generator | Instagram | 🌐 website (writes the DM text; auto-sending DMs needs Meta's Messaging API) |
| Telegram channel daily post (AI) | Telegram | 🌐 website (24×7 in full version) |
| Daily AI quote → Telegram | Telegram | 🌐 website |
| Website down alert → Telegram | Telegram | 🌐 website |
| Auto-post Reel to Instagram + Telegram at a time | Instagram | 🛠️ needs Meta app token + public video URL |
| Gmail daily inbox summary → Telegram | Gmail | 🛠️ needs your Google OAuth token (expires in 1 h) |
| 2D / 3D cartoon video with lip-sync | Video | 🔑 needs **your own** video-AI API key (paid / free trial) — not free from us |
| Trending news → AI post | AI Content | 💻 full version (many feeds block browsers) |
| News → AI summary → Telegram | Telegram | 💻 full version |
| Gmail auto-reply (AI drafts → you approve) | Gmail | 💻 full version (SMTP send) |
| Auto YouTube upload from folder (AI title/desc/tags) | YouTube | 💻 full version |
| Webhook → AI reply | AI Content | 💻 full version |

### Supabase setup (site owner)
The website uses the owner's Supabase project (`public/config.js` holds the URL + **publishable** key — safe in the browser; never put a secret key there).

1. **Make signups work instantly:** Supabase → *Authentication* → *Sign In / Providers* → *Email* → turn **OFF "Confirm email"** → Save.
   *(If you keep it ON, Supabase's built-in email sends only a few emails per hour — add your own SMTP under Authentication → Emails → SMTP Settings, e.g. Gmail App Password, Brevo or Resend.)*
2. **Links in emails (password reset):** *Authentication* → *URL Configuration* → Site URL `https://yantraflow.sites.tab.bot` and add the same to **Redirect URLs**.
3. **Optional cloud sync + "Delete my account":** paste [`docs/supabase-setup.sql`](docs/supabase-setup.sql) into *SQL Editor* → Run. It creates the `yf_workflows` table with Row Level Security (each user sees only their own rows). Without it, workflows are saved on the device and Settings says "Cloud sync is off".

## 🧭 v3: real logos + workflow actions

- **No emoji icons anymore.** Every node, trigger and service uses a real icon: brand logos for Telegram, YouTube, Instagram, Facebook, Gmail, X, Discord, Slack, RSS, Google Sheets; clean line icons for Schedule, Webhook, HTTP, Code, IF, Switch, Delay, AI Chat, Email and the rest. Same icons in the web and PC/Termux versions, in Dark / AMOLED / Light.
- **Workflow actions:** on *Your automations*, **right-click** a card (PC), **long-press** it (phone) or tap the **⋮** button → *Open in editor, Rename, Duplicate, Export (.json), Share / send to others, Delete*.
- **Share links:** *Share* makes a link (the workflow is compressed inside the link itself, nothing is uploaded). Whoever opens it gets a preview and an **Add to my workflows** button. In the PC/Termux version: **Import → From share link** and paste it. API keys are never included.

**Hinglish:** Ab emoji ki jagah asli logo. Apne workflow pe right-click (PC) ya long-press (phone) ya ⋮ dabao → Rename, Duplicate, Export, Share link, Delete. Share link kisi ko bhi bhejo, wo khol ke "Add to my workflows" dabaye.

## 🔒 Full version (PC / Termux) password
The local full version has **no accounts**. Every time you run `start.bat` / `sh start.sh`, YantraFlow prints a **new random password** in the terminal:

```
  ════════════════════════════════════════════
  🔒 YantraFlow password:  Kp7m-Xq3Z
  ════════════════════════════════════════════
```

Type it on the lock screen at `http://localhost:5679`. Restarting makes a new password (old sessions stop working). **Webhooks (`/webhook/...`) never need the password**, so outside apps can still call them. Advanced: set `YANTRAFLOW_PASSWORD=...` to use a fixed password instead.

**Hinglish:** PC/Termux version me account nahi hai. Har baar `start.bat` / `sh start.sh` chalane par terminal me naya password dikhega (`🔒 YantraFlow password: XXXX-XXXX`). Browser me lock screen pe wahi password daalo. Dobara start kiya to naya password banega. Webhooks bina password ke chalte rahenge.

## 💻 Quick start (PC)

**Windows:** install nothing first — download this repo (**Code → Download ZIP**), unzip, double-click **`start.bat`**. If Node.js is missing it installs it (winget); run `start.bat` again. Browser opens **http://localhost:5679**.

**Mac / Linux:**
```bash
git clone https://github.com/shanir01/YantraFlow.git
cd YantraFlow
sh start.sh          # or: npm start
```

## 📱 Quick start (Android, Termux)

1. Install **Termux from [F-Droid](https://f-droid.org/packages/com.termux/)** (the Play Store version is outdated).
2. In Termux:
```bash
pkg update -y && pkg install -y git
git clone https://github.com/shanir01/YantraFlow.git
cd YantraFlow
sh start.sh
```
3. Chrome opens **http://localhost:5679** automatically (Node.js is installed for you on the first run).
4. Keep it running: `start.sh` takes a Termux **wake-lock**; also set *Battery → Termux → Unrestricted* in Android settings.
5. Want Folder Watch on your phone's Movies/Download folders? Run `termux-setup-storage` once, then use `/sdcard/Movies` as the folder.

Next time just: `cd YantraFlow && sh start.sh`. Update: `git pull`.

## 🌐 Web version vs full version

[yantraflow.sites.tab.bot](https://yantraflow.sites.tab.bot/) is the same editor running **100% in your browser** (saved in browser storage). Great to try and for AI / Telegram / Instagram / Facebook / Discord / HTTP / RSS flows while the tab is open.
These need the **full version** (this repo on PC/Termux) because a browser can't do them: Webhook, Folder Watch, YouTube upload (reads a file), Email (SMTP), Write File, X and Slack (they block browser requests), and schedules that run when the tab is closed. Some RSS feeds/APIs also block browsers (CORS) — the full version has no such limit.

## 🔑 Getting your free keys

All keys go on the **Keys** page (🔑). They stay on your device.

| Service | How to get it | Free? |
|---|---|---|
| 🤖 **AI** | Easiest: run [FreeLLM-Router](https://github.com/shanir01/FreeLLM-Router) → Base URL `http://localhost:8787/v1`, key `local`, model `auto`. Or any OpenAI-compatible API, e.g. Groq `https://api.groq.com/openai/v1` + key from console.groq.com/keys | Free tiers (daily limits) |
| ✈️ **Telegram** | Telegram → **@BotFather** → `/newbot` → copy token. Chat ID: send your bot a message, open `https://api.telegram.org/bot<TOKEN>/getUpdates`, copy `chat.id`. Channel: use `@channelname` and add the bot as **admin** | Free |
| 📸 **Instagram** | Needs an Instagram **Business or Creator** account linked to a **Facebook Page** + a Meta app at developers.facebook.com with `instagram_basic`, `instagram_content_publish`, `pages_show_list`. Use Graph API Explorer to get a token, exchange it for a long-lived token (~60 days). IG user ID: `GET /me/accounts?fields=instagram_business_account` | Free (Meta's posting limit applies — about 50 API posts / 24 h, check Meta docs) |
| 📘 **Facebook Page** | Same Meta app → Page access token with `pages_manage_posts`. Page ID in Page → About | Free |
| ▶️ **YouTube** | See [YouTube setup](#-youtube-upload-setup) below (client ID + secret + refresh token) | Free quota ≈ 6 uploads/day |
| 𝕏 **X / Twitter** | developer.x.com → project → app → *User authentication: Read and Write* → Keys and tokens (API key/secret + Access token/secret) | Free tier allows a limited number of posts per month (check X's current plan) |
| 📧 **Email** | Gmail: host `smtp.gmail.com`, port `465`, your Gmail, and an **App Password** (Google Account → Security → 2-Step Verification → App passwords) | Free |
| 🎮 Discord / 💬 Slack | Channel settings → Integrations → Webhooks / api.slack.com → Incoming Webhooks | Free |

### ▶️ YouTube upload setup
1. [console.cloud.google.com](https://console.cloud.google.com) → new project → **APIs & Services → Library → YouTube Data API v3 → Enable**.
2. **OAuth consent screen** → External → add your Gmail as *Test user* (later click **Publish app** so the token doesn't expire after 7 days).
3. **Credentials → Create OAuth client ID → Web application**, add redirect URI `https://developers.google.com/oauthplayground`. Copy **Client ID** and **Client secret**.
4. Open [OAuth Playground](https://developers.google.com/oauthplayground) → ⚙ → *Use your own OAuth credentials* → paste them → scope `https://www.googleapis.com/auth/youtube.upload` → Authorize → **Exchange authorization code for tokens** → copy the **Refresh token**.
5. Paste all three on the Keys page.

⚠️ Honest note: Google keeps videos uploaded by **unverified** API projects **private** until the project passes Google's audit. YantraFlow uploads as *private* by default — open YouTube Studio and make it public, or apply for the audit.

## 🔗 Connect to other apps

- **Webhook URL:** `http://localhost:5679/webhook/<path>` (workflow must be **Active**). Example:
```bash
curl -X POST http://localhost:5679/webhook/ask -H "content-type: application/json" -d '{"message":"Termux kya hai?"}'
```
- **From the internet** (e.g. a form or another server): use a free tunnel such as `cloudflared tunnel --url http://localhost:5679` (`pkg install cloudflared` on Termux).
- **Open the phone's editor from your PC on the same Wi-Fi:** `HOST=0.0.0.0 sh start.sh`, then open `http://<phone-ip>:5679` and type the password shown in Termux.

## ⚙️ Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `5679` | Port |
| `HOST` | `127.0.0.1` | `0.0.0.0` = reachable from your Wi-Fi |
| `YANTRAFLOW_PASSWORD` | new random password every start | Fixed password for the editor instead of the random one (webhooks stay open) |
| `YANTRAFLOW_DATA` | `./data` | Where workflows, runs, keys and files are saved |
| `YANTRAFLOW_MAX_RUNS` | `300` | Run history kept |
| `NO_BROWSER` | – | `1` = don't open the browser on start |

## 🇮🇳 Hinglish quickstart

**Website (naya v2):** https://yantraflow.sites.tab.bot/ kholo → *Sign up* (sirf email + password) → *Projects* me jao → koi bhi project → **Use this project** → Keys page pe apni AI/Telegram key → ▶ Run. Saare projects abhi FREE hain.

**YantraFlow kya hai?** n8n jaisa apna free automation tool — drag-drop karke "jab ye ho, tab wo karo" workflow banao. PC aur Android phone (Termux) dono pe chalta hai. Koi paisa nahi, koi Docker nahi, data tumhare device pe hi rehta hai.

**PC (Windows) pe:**
1. Is page pe **Code → Download ZIP** → unzip karo.
2. **`start.bat`** pe double-click. Node.js nahi hai to khud install karega (phir dobara `start.bat` chalao).
3. Browser me **http://localhost:5679** khulega. Bas! 🎉

**Phone (Termux) pe:**
1. **F-Droid** se Termux install karo (Play Store wala purana hai).
2. Termux me ye likho:
```bash
pkg update -y && pkg install -y git
git clone https://github.com/shanir01/YantraFlow.git
cd YantraFlow && sh start.sh
```
3. Chrome me editor khul jayega. Agli baar: `cd YantraFlow && sh start.sh`
4. Background me chalta rahe: Settings → Battery → Termux → *Unrestricted*.

**Pehla workflow (2 min):**
1. **Keys** 🔑 page pe Telegram bot token + chat ID daalo (@BotFather se), aur AI ke liye FreeLLM-Router ka link `http://localhost:8787/v1` (ya Groq key).
2. **Templates** ✨ → "Daily AI quote → Telegram" → *Use template*.
3. ▶ **Run** dabao — Telegram pe quote aa jayega ✅
4. Upar **Active** switch on karo — ab roz 7 baje apne aap chalega.

**Auto post (Instagram / YouTube):** template "AI caption → Reel" aur "Folder → YouTube" use karo. Instagram ke liye Business/Creator account + Meta app chahiye, aur video ka **public link** (phone ki file direct nahi jaati). YouTube ke liye upar "YouTube upload setup" dekho — pehle video *private* upload hogi.

**Try bina install:** 👉 https://yantraflow.sites.tab.bot/

## 🧪 Tests

```bash
npm test     # 27 tests: engine, cron, expressions, all 6 templates end-to-end with mocked APIs
```
Every outside service (AI, Telegram, Instagram/Facebook Graph, Google/YouTube, X, Discord, Slack, SMTP, RSS, Sheets) is mocked in `test/helpers.js` — tests never touch the internet or real keys.

## 🗂 Project structure

```
src/server.js      HTTP server, API, webhooks
src/runner.js      scheduler (cron/interval) + folder/sheet polling
src/nodes.js       every node (add your own here!)
public/            the editor UI (vanilla JS + Drawflow)
public/js/engine-core.js   workflow engine (shared by server & web version)
public/templates/  ready workflows
data/              your workflows, runs, keys (git-ignored)
```

**Add your own node:** copy any `def({...})` block in `src/nodes.js`, change `type`, `label`, `params` and `run()`, then `npm run build:meta`.

## 🔒 Security notes
- Keys are stored in plain JSON on your device (`data/credentials.json`) — keep your device safe, never commit `data/`.
- The Code node runs JavaScript with full access to your computer — only import workflows you trust.
- By default the server listens on `127.0.0.1` only, and the editor is locked with a new random password printed at every start.

## 📬 Contact

Questions, bugs, ideas or collaboration: **[shanir01.ai@gmail.com](mailto:shanir01.ai@gmail.com)**

**Hinglish:** Koi sawaal, bug ya naya idea ho to email karo 👉 **[shanir01.ai@gmail.com](mailto:shanir01.ai@gmail.com)**

## 🙏 Credits

Created by **Nirbhay Sharma (Nishu)** & **Tab** · login by [supabase-js](https://github.com/supabase/supabase-js) (MIT, vendored in `public/vendor/`).

- Canvas: [Drawflow](https://github.com/jerosoler/Drawflow) by Jero Soler (MIT)
- Idea inspired by [n8n](https://n8n.io) (no n8n code used)
- Icons: brand logos from [Simple Icons](https://simpleicons.org) (CC0 1.0) and line icons from [Lucide](https://lucide.dev) (ISC) — bundled locally in `public/js/icons.js` (licences in `public/vendor/LICENSE-icons.txt`). Brand names and logos belong to their owners.

## ⭐ Support
If YantraFlow saves you time, **give it a ⭐ star** — it really helps! Share your workflows (Export → JSON) and open a PR with new nodes. PRs welcome.

Made with ❤️ in India by **Nirbhay Sharma (NISHU)** · [@shanir01](https://github.com/shanir01) · MIT License
