-- Aliyah's Flashcards — Supabase (Postgres) schema  [M2 DRAFT — review before applying]
--
-- Design: one table per sync collection, each storing the full record as `doc`
-- (jsonb) plus extracted columns for indexing + row-level security:
--   id          uuid        — the record's UUID (matches doc->>'id')
--   owner       uuid        — who may read/write this row (see below)
--   updated_at  timestamptz — drives the pull-since-cursor sync
--   deleted_at  timestamptz — tombstone (null = live)
--   doc         jsonb       — the whole record (camelCase, same shape as export/import)
--
-- `owner` rules:
--   decks/lessons/cards        -> the content owner (doc->>'ownerId')
--   progress/review_events     -> the STUDIER's base user (trackBaseUser of doc->>'userId');
--                                 an admin's emulation track `admin@as:target` has owner = admin
--   users                      -> the user themselves (id = owner = their GoTrue auth uid)
--
-- AUTH MAPPING: a user's app id = their Supabase/GoTrue auth uid, so RLS uses
-- auth.uid(). On first Google sign-in the app creates the `users` row with
-- id = auth.uid(). Admins (allowlist.role='admin') may read all rows to inspect/
-- manage other users' content (the emulation feature); they never write to
-- another user's progress (that stays app-enforced + owner-keyed).
--
-- Apply via Supabase Studio SQL editor or psql. Idempotent-ish (IF NOT EXISTS).

create extension if not exists pgcrypto;

-- ---- allowlist (who may use the app) --------------------------------------
create table if not exists allowlist (
  email text primary key,
  role  text not null default 'user' check (role in ('user','admin'))
);
-- seed the initial two users (safe to re-run)
insert into allowlist (email, role) values
  ('mikebailey1979@gmail.com', 'admin'),
  ('aliyahannbailey@gmail.com', 'user')
on conflict (email) do nothing;

-- ---- helper: is the caller an admin? --------------------------------------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from allowlist a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid() and a.role = 'admin'
  );
$$;

-- ---- helper: is the caller allowlisted at all? ----------------------------
create or replace function is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from allowlist a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid()
  );
$$;

-- lock the allowlist table: only admins may read it (emails are private); the
-- is_admin()/is_allowed() functions are SECURITY DEFINER so they still work.
alter table allowlist enable row level security;
drop policy if exists allowlist_sel on allowlist;
create policy allowlist_sel on allowlist for select using (is_admin());

-- ---- collection tables ----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['users','decks','lessons','cards','progress','review_events'] loop
    execute format($f$
      create table if not exists %I (
        id         uuid primary key,
        owner      uuid not null,
        updated_at timestamptz not null,
        deleted_at timestamptz,
        doc        jsonb not null
      );
      create index if not exists %I on %I (owner, updated_at);
      alter table %I enable row level security;
    $f$, t, t||'_owner_updated_idx', t, t);
  end loop;
end $$;

-- ---- RLS policies: owner (or admin) may read; owner may write -------------
-- Run once; DROP POLICY first if you re-tune them.
do $$
declare t text;
begin
  foreach t in array array['users','decks','lessons','cards','progress','review_events'] loop
    execute format($f$
      drop policy if exists %I on %I;
      create policy %I on %I for select using (owner = auth.uid() or is_admin());
      drop policy if exists %I on %I;
      create policy %I on %I for insert with check (owner = auth.uid());
      drop policy if exists %I on %I;
      create policy %I on %I for update using (owner = auth.uid()) with check (owner = auth.uid());
      drop policy if exists %I on %I;
      create policy %I on %I for delete using (owner = auth.uid());
    $f$,
      t||'_sel', t, t||'_sel', t,
      t||'_ins', t, t||'_ins', t,
      t||'_upd', t, t||'_upd', t,
      t||'_del', t, t||'_del', t);
  end loop;
end $$;

-- NOTE: writes are hard upserts from the client (last-write-wins by updated_at);
-- the app never hard-deletes — deletions are tombstones (deleted_at set, doc kept).
-- Admin emulation never writes another user's progress: those rows are owned by
-- the admin's own track id, so the insert/update WITH CHECK (owner = auth.uid())
-- already forbids writing a row owned by someone else.
