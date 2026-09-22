// Thin wrapper over API-Football (api-sports.io) v3. Only the pieces
// the sync job needs: fixtures for a date range. Everything else the
// app already computes from our own data (standings, form), so there's
// no reason to spend quota fetching it.
//
// Free tier is 100 requests/day, so each sync run should stay in the
// low single digits of calls.

const BASE_URL = "https://v3.football.api-sports.io";

// API-Football status codes that mean the match is over. Anything else
// (NS, 1H, HT, LIVE, PST, CANC…) is not a final result.
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

function requireConfig() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    throw new Error("API_FOOTBALL_KEY must be set (see .env.example)");
  }
  return {
    key,
    leagueId: process.env.API_FOOTBALL_LEAGUE_ID || "333", // UPL
    season: process.env.API_FOOTBALL_SEASON || String(new Date().getFullYear()),
  };
}

// Normalises API-Football's nested fixture object into the flat shape
// the sync service works with, so the mapping logic isn't tangled up
// with the provider's response format.
function normaliseFixture(raw) {
  return {
    externalId: raw.fixture.id,
    utcDate: raw.fixture.date,
    statusShort: raw.fixture.status?.short,
    isFinished: FINISHED_STATUSES.has(raw.fixture.status?.short),
    round: raw.league?.round || null,
    home: { externalId: raw.teams.home.id, name: raw.teams.home.name },
    away: { externalId: raw.teams.away.id, name: raw.teams.away.name },
    score:
      raw.goals?.home == null || raw.goals?.away == null
        ? null
        : { home: raw.goals.home, away: raw.goals.away },
  };
}

// Pulls fixtures within a date window. `from`/`to` are YYYY-MM-DD.
// Narrowing the window rather than fetching a whole season keeps each
// run to one request and well inside the free quota.
async function fetchFixtures({ from, to } = {}) {
  const { key, leagueId, season } = requireConfig();

  const params = new URLSearchParams({ league: leagueId, season });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const res = await fetch(`${BASE_URL}/fixtures?${params}`, {
    headers: {
      "x-rapidapi-key": key,
      "x-rapidapi-host": "v3.football.api-sports.io",
    },
  });

  if (!res.ok) {
    throw new Error(`API-Football request failed: ${res.status} ${res.statusText}`);
  }

  const body = await res.json();

  // API-Football returns HTTP 200 with an `errors` object on quota
  // exhaustion or a bad key, so a failure has to be detected from the
  // body rather than the status code.
  if (body.errors && Object.keys(body.errors).length) {
    throw new Error(`API-Football error: ${JSON.stringify(body.errors)}`);
  }

  return (body.response || []).map(normaliseFixture);
}

module.exports = { fetchFixtures, normaliseFixture, FINISHED_STATUSES };
