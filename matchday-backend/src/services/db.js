// Same shapes the rest of the app already expects (homeTeamId, utcDate,
// score: {home, away} | null) — only the storage underneath changed,
// from a local JSON file to a Supabase Postgres table. Routes call
// these the same way; they just need `await` now.

const { createClient } = require("@supabase/supabase-js");

let client = null;

function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)"
    );
  }
  client = createClient(url, key);
  return client;
}

// Test-only escape hatch: inject a fake client so tests don't need a
// live Supabase project. Never called from application code.
function _setClient(fakeClient) {
  client = fakeClient;
}

function mapMatchRow(row) {
  return {
    id: row.id,
    league: row.league,
    homeTeamId: row.home_team_id,
    awayTeamId: row.away_team_id,
    utcDate: row.utc_date,
    matchday: row.matchday,
    status: row.status,
    score:
      row.score_home == null || row.score_away == null
        ? null
        : { home: row.score_home, away: row.score_away },
  };
}

function ensure(result) {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

// --- teams ---------------------------------------------------------

async function listTeams({ league = "upl" } = {}) {
  const result = await getClient()
    .from("teams")
    .select("*")
    .eq("league", league)
    .order("name");
  return ensure(result);
}

async function addTeam({ name, league = "upl" }) {
  if (!name || !name.trim()) throw new Error("Team name is required");
  const result = await getClient()
    .from("teams")
    .insert({ name: name.trim(), league })
    .select()
    .single();
  return ensure(result);
}

async function deleteTeam(teamId) {
  const result = await getClient().from("teams").delete().eq("id", teamId).select();
  return ensure(result).length > 0;
}

// --- matches ---------------------------------------------------------

async function listMatches({ league = "upl", status } = {}) {
  let query = getClient().from("matches").select("*").eq("league", league);
  if (status) query = query.eq("status", status);
  const result = await query.order("utc_date");
  return ensure(result).map(mapMatchRow);
}

async function addMatch({ league = "upl", homeTeamId, awayTeamId, utcDate, matchday }) {
  if (!homeTeamId || !awayTeamId) {
    throw new Error("homeTeamId and awayTeamId are required");
  }
  if (homeTeamId === awayTeamId) {
    throw new Error("A team can't play itself");
  }
  if (!utcDate || Number.isNaN(new Date(utcDate).getTime())) {
    throw new Error("utcDate must be a valid date string");
  }

  const result = await getClient()
    .from("matches")
    .insert({
      league,
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      utc_date: utcDate,
      matchday: matchday ?? null,
      status: "scheduled",
    })
    .select()
    .single();
  return mapMatchRow(ensure(result));
}

// Records a result and flips the match to "finished". Pass null score
// values to push it back to "scheduled" (e.g. to undo a typo).
async function setMatchScore(matchId, { home, away }) {
  const patch =
    home == null || away == null
      ? { score_home: null, score_away: null, status: "scheduled" }
      : { score_home: Number(home), score_away: Number(away), status: "finished" };

  const result = await getClient()
    .from("matches")
    .update(patch)
    .eq("id", matchId)
    .select()
    .single();

  if (result.error) {
    // PostgREST reports "no rows" as an error on .single()
    throw new Error(`No match with id ${matchId}`);
  }
  return mapMatchRow(result.data);
}

async function deleteMatch(matchId) {
  const result = await getClient().from("matches").delete().eq("id", matchId).select();
  return ensure(result).length > 0;
}

module.exports = {
  _setClient,
  listTeams,
  addTeam,
  deleteTeam,
  listMatches,
  addMatch,
  setMatchScore,
  deleteMatch,
};
