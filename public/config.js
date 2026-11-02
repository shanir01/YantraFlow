// "auto" = use the local server if it is running, else the in-browser web edition.
// "web" = always browser-only (used for the hosted site). "full" = always server.
window.YF_EDITION = "auto";

// Website login (email + password) — Supabase project of the site owner.
// The publishable key is SAFE in the browser (it only allows what Row Level Security allows).
// NEVER put a secret (server-side) key here.
window.YF_SUPABASE_URL = "https://kpmafhsvyozulwcuprpu.supabase.co";
window.YF_SUPABASE_KEY = "sb_publishable_48NObzWQgfhHaGjRN-i-dw_zXJWlNix";
// Website requires login. (The local full version never uses this: it uses a new password printed in the terminal at every start.)
window.YF_REQUIRE_LOGIN = true;
