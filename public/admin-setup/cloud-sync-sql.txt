-- YantraFlow website: OPTIONAL Supabase setup (cloud sync of workflows + "Delete my account")
-- Paste this whole file in Supabase Dashboard → SQL Editor → New query → Run.
-- Login itself works WITHOUT this file. API keys are never stored here (they stay on the user's device).

-- 1) Workflows table (one row per workflow per user)
create table if not exists public.yf_workflows (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- 2) Row Level Security: every user sees and changes ONLY their own rows
alter table public.yf_workflows enable row level security;

drop policy if exists "yf select own" on public.yf_workflows;
drop policy if exists "yf insert own" on public.yf_workflows;
drop policy if exists "yf update own" on public.yf_workflows;
drop policy if exists "yf delete own" on public.yf_workflows;

create policy "yf select own" on public.yf_workflows for select to authenticated using ((select auth.uid()) = user_id);
create policy "yf insert own" on public.yf_workflows for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "yf update own" on public.yf_workflows for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "yf delete own" on public.yf_workflows for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.yf_workflows to authenticated;

-- 3) "Delete my account" button in Settings (a user can delete only themselves)
create or replace function public.yf_delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not logged in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.yf_delete_my_account() from public, anon;
grant execute on function public.yf_delete_my_account() to authenticated;
