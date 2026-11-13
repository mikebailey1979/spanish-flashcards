-- Migration: roleplay_sessions (R4 — scripted "pretend chat" transcripts)
-- Apply to the live self-hosted Supabase (api.aliyahsflashcards.com) via the
-- Studio SQL editor or psql. Idempotent (safe to re-run).
--
-- Adds one collection table shaped exactly like the others ({id, owner,
-- updated_at, deleted_at, doc}) so the existing sync transport handles it with
-- no new code. `owner` = the STUDIER's base user (set client-side, same as
-- progress), and the select policy grants admins read access — that is what
-- makes the transcripts PARENT-VISIBLE for review.
--
-- Prereqs: the is_admin() / is_allowed() helpers from db/schema.sql must already
-- exist (they do — they back the other tables). After applying, flip
-- app/config.js  roleplay.synced -> true  so the client includes roleplay
-- transcripts in sync (until then they persist locally only).

create table if not exists roleplay_sessions (
  id         uuid primary key,
  owner      uuid not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  doc        jsonb not null
);
create index if not exists roleplay_sessions_owner_updated_idx
  on roleplay_sessions (owner, updated_at);

alter table roleplay_sessions enable row level security;

-- owner (or an admin) may read; only the owner may write. is_allowed() keeps the
-- whole thing invite-only (defence in depth), matching every other table.
drop policy if exists roleplay_sessions_sel on roleplay_sessions;
create policy roleplay_sessions_sel on roleplay_sessions
  for select using ((owner = auth.uid() or is_admin()) and is_allowed());

drop policy if exists roleplay_sessions_ins on roleplay_sessions;
create policy roleplay_sessions_ins on roleplay_sessions
  for insert with check (owner = auth.uid() and is_allowed());

drop policy if exists roleplay_sessions_upd on roleplay_sessions;
create policy roleplay_sessions_upd on roleplay_sessions
  for update using (owner = auth.uid() and is_allowed())
  with check (owner = auth.uid() and is_allowed());

drop policy if exists roleplay_sessions_del on roleplay_sessions;
create policy roleplay_sessions_del on roleplay_sessions
  for delete using (owner = auth.uid() and is_allowed());
