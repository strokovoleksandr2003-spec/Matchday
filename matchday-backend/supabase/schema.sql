-- Run this once in Supabase → SQL Editor → New query.
-- Creates the two tables the app needs, plus the same UPL teams and
-- sample matches that were seeded in the old local db.json.

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  league text not null default 'upl',
  coach text,
  stadium text
);

-- safe to re-run on a table that already existed before these columns did
alter table teams add column if not exists coach text;
alter table teams add column if not exists stadium text;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  name text not null,
  position text,
  jersey_number int,
  is_captain boolean not null default false,
  status text not null default 'available' check (status in ('available', 'injured', 'suspended')),
  status_note text
);

create index if not exists players_team_idx on players (team_id);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  league text not null default 'upl',
  home_team_id uuid not null references teams(id) on delete cascade,
  away_team_id uuid not null references teams(id) on delete cascade,
  utc_date timestamptz not null,
  matchday int,
  status text not null default 'scheduled' check (status in ('scheduled', 'finished')),
  score_home int,
  score_away int,
  constraint different_teams check (home_team_id <> away_team_id)
);

create index if not exists matches_league_status_idx on matches (league, status);

-- Row Level Security: the app only ever talks to Supabase through the
-- service_role key from the Netlify Function (never from the browser),
-- so RLS can stay simple — locked by default, service_role bypasses it.
alter table teams enable row level security;
alter table matches enable row level security;
alter table players enable row level security;

-- --- seed data -------------------------------------------------------

insert into teams (id, name, league) values
  ('11111111-1111-1111-1111-111111111111', 'Полісся', 'upl'),
  ('22222222-2222-2222-2222-222222222222', 'Шахтар', 'upl'),
  ('33333333-3333-3333-3333-333333333333', 'Карпати', 'upl'),
  ('44444444-4444-4444-4444-444444444444', 'Динамо', 'upl'),
  ('55555555-5555-5555-5555-555555555555', 'ЛНЗ', 'upl')
on conflict (id) do nothing;

insert into matches (league, home_team_id, away_team_id, utc_date, matchday, status, score_home, score_away) values
  ('upl', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', '2026-09-13T15:00:00Z', 4, 'finished', 2, 1),
  ('upl', '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', '2026-09-20T15:00:00Z', 5, 'finished', 1, 1),
  ('upl', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', '2026-09-27T18:00:00Z', 6, 'scheduled', null, null)
on conflict do nothing;

insert into players (team_id, name, position, jersey_number, is_captain, status) values
  ('11111111-1111-1111-1111-111111111111', 'Гравець 1 (приклад)', 'GK', 1, true, 'available'),
  ('11111111-1111-1111-1111-111111111111', 'Гравець 2 (приклад)', 'DF', 4, false, 'injured'),
  ('11111111-1111-1111-1111-111111111111', 'Гравець 3 (приклад)', 'MF', 8, false, 'available')
on conflict do nothing;
