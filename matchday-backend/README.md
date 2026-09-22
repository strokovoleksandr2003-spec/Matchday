# Matchday backend

Express app for data, Supabase (Postgres) for storage, deployed to Netlify
as a serverless function. Same admin form and API as before — only where
the data lives, and where the app runs, changed.

## 1. Set up Supabase (free)

1. Create a project at **supabase.com** (free tier, no time limit).
2. Open **SQL Editor** → paste in `supabase/schema.sql` → run it. This
   creates the `teams`/`matches` tables and seeds the five UPL teams
   already used in the design.
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role key** (not the `anon` one) → `SUPABASE_SERVICE_ROLE_KEY`

The service role key bypasses Row Level Security and must never reach the
browser — it's only used inside the Netlify Function / local server, never
in `public/*.html`.

## 2. Run locally

```
npm install
cp .env.example .env   # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN
npm run dev
```

Open `http://localhost:4000/admin.html` to enter teams/results, or
`http://localhost:4000/` for the live standings page.

## 3. Deploy to Netlify (free)

1. Push this project to a GitHub repo.
2. On **netlify.com** → **Add new site → Import an existing project** →
   pick the repo. Netlify reads `netlify.toml` automatically (publish
   dir, function dir, and the `/api/*` redirect are already configured).
3. Under **Site configuration → Environment variables**, add the same
   three variables as `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `ADMIN_TOKEN`.
4. Deploy. Your admin form is at `https://<your-site>.netlify.app/admin.html`.

## Public read endpoints

| Method | Path | Feeds |
|---|---|---|
| GET | `/api/leagues/:league/standings` | standings table (computed from results) |
| GET | `/api/leagues/:league/next-match` | "next match" card |
| GET | `/api/leagues/:league/fixtures/week` | "this week" list |
| GET | `/api/leagues/:league/form?limit=5` | recent form badges |

## Admin endpoints (need `x-admin-token` header)

| Method | Path | Does |
|---|---|---|
| GET / POST | `/api/admin/teams` | list / add a team |
| DELETE | `/api/admin/teams/:id` | remove a team |
| GET / POST | `/api/admin/matches` | list / schedule a match |
| PATCH | `/api/admin/matches/:id/score` | enter or correct a result |
| DELETE | `/api/admin/matches/:id` | remove a match |

## How the pieces fit together

- **`src/app.js`** — the actual Express app (routes, static files). Used
  both locally (via `src/server.js`) and on Netlify (via
  `netlify/functions/api.js`, which wraps the same app with
  `serverless-http`). The app itself never changes between the two.
- **`src/services/db.js`** — the only place that talks to Supabase.
  Routes call `db.listTeams()`, `db.addMatch()`, etc. and get back plain
  JS objects; nothing else in the app knows it's Postgres underneath.
- **`netlify.toml`** — routes `/api/*` to the function *without* rewriting
  the path (no `:splat`), so the function sees the original
  `/api/leagues/...` path and Express's existing route mounts just work.
- Tests use a small in-memory fake of Supabase's query builder
  (`test/fakeSupabaseClient.js`) via `db._setClient(...)`, so `npm test`
  never touches a real project.

## Notes

- `ADMIN_TOKEN` is a shared secret, not real accounts. Fine for one or two
  trusted editors; upgrade to per-user auth (e.g. Supabase Auth) if that
  grows.
- Local dev and Netlify both read the same Supabase project by default —
  point `.env` and Netlify's env vars at different Supabase projects if
  you want separate dev/prod data.
