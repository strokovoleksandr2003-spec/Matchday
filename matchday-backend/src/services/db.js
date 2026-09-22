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

// Partial update — coach and/or stadium. Player-level info (captain,
// injuries) lives on the players table instead, since a captain is a
// player, not a team-level fact.
async function updateTeam(teamId, { coach, stadium } = {}) {
  const patch = {};
  if (coach !== undefined) patch.coach = coach;
  if (stadium !== undefined) patch.stadium = stadium;

  const result = await getClient().from("teams").update(patch).eq("id", teamId).select().single();
  if (result.error) throw new Error(`No team with id ${teamId}`);
  return result.data;
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

// --- players (squad) -------------------------------------------------

const PLAYER_STATUSES = ["available", "injured", "suspended"];

function mapPlayerRow(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    position: row.position,
    jerseyNumber: row.jersey_number,
    isCaptain: row.is_captain,
    status: row.status,
    statusNote: row.status_note,
  };
}

async function listPlayers({ teamId }) {
  if (!teamId) throw new Error("teamId is required");
  const result = await getClient()
    .from("players")
    .select("*")
    .eq("team_id", teamId)
    .order("jersey_number");
  return ensure(result).map(mapPlayerRow);
}

async function addPlayer({ teamId, name, position, jerseyNumber, isCaptain }) {
  if (!teamId) throw new Error("teamId is required");
  if (!name || !name.trim()) throw new Error("Player name is required");

  const result = await getClient()
    .from("players")
    .insert({
      team_id: teamId,
      name: name.trim(),
      position: position || null,
      jersey_number: jerseyNumber ?? null,
      is_captain: !!isCaptain,
      status: "available",
    })
    .select()
    .single();
  return mapPlayerRow(ensure(result));
}

// Partial update — pass only the fields that changed. Used both for
// editing a player's details and for flipping their availability
// status (available/injured/suspended) before a matchday.
async function updatePlayer(playerId, patch = {}) {
  if (patch.status !== undefined && !PLAYER_STATUSES.includes(patch.status)) {
    throw new Error(`status must be one of: ${PLAYER_STATUSES.join(", ")}`);
  }

  const dbPatch = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (patch.position !== undefined) dbPatch.position = patch.position;
  if (patch.jerseyNumber !== undefined) dbPatch.jersey_number = patch.jerseyNumber;
  if (patch.isCaptain !== undefined) dbPatch.is_captain = patch.isCaptain;
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.statusNote !== undefined) dbPatch.status_note = patch.statusNote;

  const result = await getClient().from("players").update(dbPatch).eq("id", playerId).select().single();
  if (result.error) throw new Error(`No player with id ${playerId}`);
  return mapPlayerRow(result.data);
}

async function deletePlayer(playerId) {
  const result = await getClient().from("players").delete().eq("id", playerId).select();
  return ensure(result).length > 0;
}

module.exports = {
  _setClient,
  PLAYER_STATUSES,
  listTeams,
  addTeam,
  deleteTeam,
  updateTeam,
  listMatches,
  addMatch,
  setMatchScore,
  deleteMatch,
  listPlayers,
  addPlayer,
  updatePlayer,
  deletePlayer,
};
