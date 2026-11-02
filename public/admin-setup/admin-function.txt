// YantraFlow ADMIN Edge Function (Supabase, Deno) — users list / block / delete / make admin.
// The service key lives ONLY here (Supabase gives it to the function automatically as
// SUPABASE_SERVICE_ROLE_KEY). It is NEVER sent to the website.
//
// Deploy (one time) — Dashboard: Edge Functions → Deploy a new function → Via editor →
//   name: admin → paste this file → (Settings) "Verify JWT" OFF → Deploy.
//   CLI: supabase functions deploy admin --no-verify-jwt --project-ref kpmafhsvyozulwcuprpu
// Optional secret ADMIN_EMAILS = "a@x.com,b@y.com" (shanir01.ai@gmail.com is always admin).
// The function itself checks the caller's login token and that the caller is an admin.
import { createClient } from "npm:@supabase/supabase-js@2";

const VERSION = "1.0.0";
const PRIMARY_ADMIN = "shanir01.ai@gmail.com";
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SB_SECRET_KEY") ?? "";
const ADMINS = [PRIMARY_ADMIN, ...(Deno.env.get("ADMIN_EMAILS") ?? "").split(/[,\s]+/)].map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!URL_ || !SERVICE) return json({ error: "Function secrets missing: SUPABASE_SERVICE_ROLE_KEY (or SB_SECRET_KEY)" }, 500);
  const sb = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1) who is calling? (verify the user's login token with Supabase Auth)
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "login required" }, 401);
  const { data: who, error: whoErr } = await sb.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: "login expired — log in again" }, 401);
  const me = who.user;
  const myEmail = (me.email ?? "").toLowerCase();
  let isAdmin = ADMINS.includes(myEmail);
  if (!isAdmin) {
    const [{ data: p }, { data: a }] = await Promise.all([
      sb.from("profiles").select("is_admin,blocked").eq("id", me.id).maybeSingle(),
      sb.from("yf_admin_emails").select("email").eq("email", myEmail).maybeSingle(),
    ]);
    isAdmin = !!a || (!!p?.is_admin && !p?.blocked);
  }
  if (!isAdmin) return json({ error: "admin only" }, 403);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "ping");
  const uid = String(body.user_id ?? "");
  const guardSelf = () => {
    if (!uid) return "user_id missing";
    if (uid === me.id) return "Aap apne aap ko block/delete nahi kar sakte";
    return "";
  };
  const isPrimary = async (id: string) => { const { data } = await sb.auth.admin.getUserById(id); return (data?.user?.email ?? "").toLowerCase() === PRIMARY_ADMIN; };

  try {
    if (action === "ping") return json({ ok: true, admin: true, email: myEmail, version: VERSION });

    if (action === "list") {
      const page = Math.max(1, Number(body.page ?? 1) || 1);
      const perPage = Math.min(200, Math.max(1, Number(body.per_page ?? 100) || 100));
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const q = String(body.search ?? "").trim().toLowerCase();
      let users = data.users;
      if (q) users = users.filter((u) => (u.email ?? "").toLowerCase().includes(q));
      const ids = users.map((u) => u.id);
      const counts: Record<string, number> = {};
      const profiles: Record<string, { is_admin: boolean; blocked: boolean; last_seen_at: string | null }> = {};
      if (ids.length) {
        const { data: pr } = await sb.from("profiles").select("id,is_admin,blocked,last_seen_at").in("id", ids);
        for (const p of pr ?? []) profiles[p.id] = p;
        const { data: wf, error: wfErr } = await sb.from("yf_workflows").select("user_id").in("user_id", ids).limit(100000);
        if (!wfErr) for (const w of wf ?? []) counts[w.user_id] = (counts[w.user_id] ?? 0) + 1;
      }
      const now = Date.now();
      return json({
        ok: true, page, per_page: perPage, total: (data as { total?: number }).total ?? null,
        users: users.map((u) => ({
          id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null,
          last_seen_at: profiles[u.id]?.last_seen_at ?? null,
          banned: !!(u.banned_until && Date.parse(u.banned_until) > now) || !!profiles[u.id]?.blocked,
          is_admin: ADMINS.includes((u.email ?? "").toLowerCase()) || !!profiles[u.id]?.is_admin,
          primary: (u.email ?? "").toLowerCase() === PRIMARY_ADMIN,
          workflows: counts[u.id] ?? 0,
        })),
      });
    }

    if (action === "block" || action === "unblock") {
      const bad = guardSelf(); if (bad) return json({ error: bad }, 400);
      if (action === "block" && await isPrimary(uid)) return json({ error: "Main admin ko block nahi kar sakte" }, 400);
      const { error } = await sb.auth.admin.updateUserById(uid, { ban_duration: action === "block" ? "876000h" : "none" });
      if (error) throw error;
      await sb.from("profiles").update({ blocked: action === "block" }).eq("id", uid);
      return json({ ok: true });
    }

    if (action === "delete") {
      const bad = guardSelf(); if (bad) return json({ error: bad }, 400);
      if (await isPrimary(uid)) return json({ error: "Main admin ko delete nahi kar sakte" }, 400);
      const { error } = await sb.auth.admin.deleteUser(uid);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "set_admin") {
      if (!uid) return json({ error: "user_id missing" }, 400);
      const on = body.value !== false;
      if (!on && uid === me.id) return json({ error: "Apna admin khud nahi hata sakte" }, 400);
      if (!on && await isPrimary(uid)) return json({ error: "Main admin hamesha admin rahega" }, 400);
      const { data: u } = await sb.auth.admin.getUserById(uid);
      const { error } = await sb.from("profiles").upsert({ id: uid, email: (u?.user?.email ?? "").toLowerCase(), is_admin: on }, { onConflict: "id" });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "stats") {
      const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw error;
      return json({ ok: true, users: (data as { total?: number }).total ?? null });
    }

    return json({ error: "unknown action: " + action }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
