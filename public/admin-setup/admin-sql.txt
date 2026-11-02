-- =====================================================================
-- YantraFlow ADMIN PANEL — Supabase setup (run ONCE, safe to run again)
-- Supabase Dashboard → SQL Editor → New query → paste this WHOLE file → Run
--
-- Creates: profiles (blocked / is_admin / last login), site_settings,
--          page_views (anonymous traffic), videos, storage buckets
--          "videos" + "site", and Row Level Security so ONLY admins can
--          read users/traffic or change settings/videos.
-- No secret key is needed for this file. Primary admin: shanir01.ai@gmail.com
-- =====================================================================

-- ---------- 0) admin email list (add more admins here or from the panel)
create table if not exists public.yf_admin_emails (
  email text primary key check (email = lower(email))
);
insert into public.yf_admin_emails (email) values ('shanir01.ai@gmail.com') on conflict do nothing;
alter table public.yf_admin_emails enable row level security;
revoke all on public.yf_admin_emails from anon, authenticated;

-- ---------- 1) profiles: one row per signed-up user
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  created_at    timestamptz not null default now(),
  last_sign_in_at timestamptz,
  last_seen_at  timestamptz,
  blocked       boolean not null default false,
  is_admin      boolean not null default false
);
alter table public.profiles add column if not exists last_sign_in_at timestamptz;
alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists blocked boolean not null default false;
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- is the CURRENT logged-in user an admin? (used by every policy below)
create or replace function public.yf_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (select 1 from public.yf_admin_emails a where a.email = lower(coalesce(auth.jwt() ->> 'email', '')))
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin and not p.blocked),
    false);
$$;
revoke all on function public.yf_is_admin() from public, anon;
grant execute on function public.yf_is_admin() to authenticated;

-- new signup -> profile row; login -> last_sign_in_at copied
create or replace function public.yf_handle_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, created_at, last_sign_in_at)
  values (new.id, lower(new.email), coalesce(new.created_at, now()), new.last_sign_in_at)
  on conflict (id) do update set email = excluded.email, last_sign_in_at = excluded.last_sign_in_at;
  return new;
end;
$$;
drop trigger if exists yf_on_auth_user on auth.users;
create trigger yf_on_auth_user
  after insert or update of email, last_sign_in_at on auth.users
  for each row execute function public.yf_handle_user();

-- backfill users who signed up before this file was run
insert into public.profiles (id, email, created_at, last_sign_in_at)
select u.id, lower(u.email), u.created_at, u.last_sign_in_at from auth.users u
on conflict (id) do update set email = excluded.email, last_sign_in_at = excluded.last_sign_in_at;

alter table public.profiles enable row level security;
drop policy if exists "profiles self read" on public.profiles;
drop policy if exists "profiles admin read" on public.profiles;
drop policy if exists "profiles admin update" on public.profiles;
drop policy if exists "profiles admin delete" on public.profiles;
create policy "profiles self read"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles admin read"  on public.profiles for select to authenticated using ((select public.yf_is_admin()));
create policy "profiles admin update" on public.profiles for update to authenticated using ((select public.yf_is_admin())) with check ((select public.yf_is_admin()));
create policy "profiles admin delete" on public.profiles for delete to authenticated using ((select public.yf_is_admin()));
grant select, update, delete on public.profiles to authenticated;

-- the website calls this after login: updates "last seen" and says if the user is blocked / admin
create or replace function public.yf_me()
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare r public.profiles;
begin
  if auth.uid() is null then return json_build_object('logged_in', false); end if;
  insert into public.profiles (id, email) values (auth.uid(), lower(auth.jwt() ->> 'email')) on conflict (id) do nothing;
  update public.profiles set last_seen_at = now() where id = auth.uid() returning * into r;
  return json_build_object('logged_in', true, 'blocked', r.blocked, 'is_admin', public.yf_is_admin(), 'created_at', r.created_at);
end;
$$;
revoke all on function public.yf_me() from public, anon;
grant execute on function public.yf_me() to authenticated;

-- ---------- 2) site_settings: ONE row (id = 1) with all customisation as JSON
create table if not exists public.site_settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.site_settings (id, data) values (1, '{}'::jsonb) on conflict do nothing;
alter table public.site_settings enable row level security;
drop policy if exists "settings public read" on public.site_settings;
drop policy if exists "settings admin write" on public.site_settings;
drop policy if exists "settings admin insert" on public.site_settings;
create policy "settings public read"  on public.site_settings for select to anon, authenticated using (true);
create policy "settings admin write"  on public.site_settings for update to authenticated using ((select public.yf_is_admin())) with check ((select public.yf_is_admin()));
create policy "settings admin insert" on public.site_settings for insert to authenticated with check ((select public.yf_is_admin()));
grant select on public.site_settings to anon, authenticated;
grant insert, update on public.site_settings to authenticated;

-- ---------- 3) page_views: anonymous first-party traffic (no email, no user id, no IP)
create table if not exists public.page_views (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path       text not null check (char_length(path) between 1 and 200),
  referrer   text not null default 'direct' check (char_length(referrer) <= 120),
  device     text not null default 'desktop' check (device in ('mobile', 'tablet', 'desktop')),
  country    text not null default '' check (char_length(country) <= 2),
  visitor_id text not null default 'anon' check (char_length(visitor_id) <= 40)
);
create index if not exists page_views_created_at_idx on public.page_views (created_at desc);
alter table public.page_views enable row level security;
drop policy if exists "page_views anyone insert" on public.page_views;
drop policy if exists "page_views admin read" on public.page_views;
drop policy if exists "page_views admin delete" on public.page_views;
create policy "page_views anyone insert" on public.page_views for insert to anon, authenticated with check (true);
create policy "page_views admin read"    on public.page_views for select to authenticated using ((select public.yf_is_admin()));
create policy "page_views admin delete"  on public.page_views for delete to authenticated using ((select public.yf_is_admin()));
grant insert on public.page_views to anon, authenticated;
grant select, delete on public.page_views to authenticated;

-- ---------- 4) videos shown on the public Videos / Tutorials page
create table if not exists public.videos (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null check (char_length(title) between 1 and 140),
  description text not null default '' check (char_length(description) <= 600),
  kind        text not null default 'youtube' check (kind in ('youtube', 'file')),
  url         text not null check (char_length(url) <= 600),
  storage_path text,
  sort        int not null default 0,
  visible     boolean not null default true
);
alter table public.videos enable row level security;
drop policy if exists "videos public read" on public.videos;
drop policy if exists "videos admin read" on public.videos;
drop policy if exists "videos admin write" on public.videos;
create policy "videos public read" on public.videos for select to anon, authenticated using (visible);
create policy "videos admin read"  on public.videos for select to authenticated using ((select public.yf_is_admin()));
create policy "videos admin write" on public.videos for all to authenticated using ((select public.yf_is_admin())) with check ((select public.yf_is_admin()));
grant select on public.videos to anon, authenticated;
grant insert, update, delete on public.videos to authenticated;

-- ---------- 5) workflow count per user (only if cloud sync table exists) — admin only
create or replace function public.yf_admin_workflow_counts()
returns table (user_id uuid, workflows bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.yf_is_admin() then raise exception 'admin only'; end if;
  if to_regclass('public.yf_workflows') is null then return; end if;
  return query execute 'select user_id, count(*)::bigint from public.yf_workflows group by user_id';
end;
$$;
revoke all on function public.yf_admin_workflow_counts() from public, anon;
grant execute on function public.yf_admin_workflow_counts() to authenticated;

-- ---------- 6) storage buckets (public read, admin upload). Free plan: max 50 MB per file.
insert into storage.buckets (id, name, public, file_size_limit)
values ('videos', 'videos', true, 52428800), ('site', 'site', true, 5242880)
on conflict (id) do update set public = true;

drop policy if exists "yf storage public read" on storage.objects;
drop policy if exists "yf storage admin insert" on storage.objects;
drop policy if exists "yf storage admin update" on storage.objects;
drop policy if exists "yf storage admin delete" on storage.objects;
create policy "yf storage public read"  on storage.objects for select to anon, authenticated using (bucket_id in ('videos', 'site'));
create policy "yf storage admin insert" on storage.objects for insert to authenticated with check (bucket_id in ('videos', 'site') and (select public.yf_is_admin()));
create policy "yf storage admin update" on storage.objects for update to authenticated using (bucket_id in ('videos', 'site') and (select public.yf_is_admin()));
create policy "yf storage admin delete" on storage.objects for delete to authenticated using (bucket_id in ('videos', 'site') and (select public.yf_is_admin()));

-- Done. Open https://yantraflow.sites.tab.bot/#/admin → Setup tab should show green ticks.
