const express = require("express");
const { getLeague } = require("../config/leagues");
const db = require("../services/db");
const { buildStandings } = require("../services/standingsCalculator");
const { buildFormByTeam } = require("../services/formCalculator");

const router = express.Router();

// Joins a team id onto the {id, name} shape formCalculator and the
// design's cards expect, so the pieces we already built didn't need
// to change when the data source did.
function withTeamNames(match, teamsById) {
  return {
    id: match.id,
    matchday: match.matchday,
    status: match.status,
    utc_date: match.utcDate,
    home_team: teamsById.get(match.homeTeamId) || { id: match.homeTeamId, name: "Unknown" },
    away_team: teamsById.get(match.awayTeamId) || { id: match.awayTeamId, name: "Unknown" },
    score: match.score,
  };
}

async function teamsMap(league) {
  const teams = await db.listTeams({ league });
  return new Map(teams.map((t) => [t.id, { id: t.id, name: t.name }]));
}

// GET /api/leagues/:league/standings
router.get("/:league/standings", async (req, res) => {
  try {
    getLeague(req.params.league); // validates the league key
    const teams = await db.listTeams({ league: req.params.league });
    const finishedRaw = await db.listMatches({ league: req.params.league, status: "finished" });
    const finished = finishedRaw.map((m) => ({
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      score: m.score,
    }));

    const standings = buildStandings(teams, finished);
    res.json({ league: req.params.league, standings });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/leagues/:league/next-match
router.get("/:league/next-match", async (req, res) => {
  try {
    getLeague(req.params.league);
    const teams = await teamsMap(req.params.league);
    const scheduled = (
      await db.listMatches({ league: req.params.league, status: "scheduled" })
    ).sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));

    const next = scheduled[0] ? withTeamNames(scheduled[0], teams) : null;
    res.json({ league: req.params.league, match: next });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/leagues/:league/fixtures/week
router.get("/:league/fixtures/week", async (req, res) => {
  try {
    getLeague(req.params.league);
    const teams = await teamsMap(req.params.league);
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const scheduled = await db.listMatches({ league: req.params.league, status: "scheduled" });
    const fixtures = scheduled
      .filter((m) => {
        const d = new Date(m.utcDate);
        return d >= now && d <= weekFromNow;
      })
      .sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate))
      .map((m) => withTeamNames(m, teams));

    res.json({ league: req.params.league, fixtures });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/leagues/:league/form?limit=5
router.get("/:league/form", async (req, res) => {
  try {
    getLeague(req.params.league);
    const teams = await teamsMap(req.params.league);
    const limit = Number(req.query.limit) || 5;

    const finishedRaw = await db.listMatches({ league: req.params.league, status: "finished" });
    const finished = finishedRaw.map((m) => withTeamNames(m, teams));

    const form = buildFormByTeam(finished, { limit });
    res.json({ league: req.params.league, form });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/leagues/:league/teams/:teamId — team info (coach, stadium)
// plus its squad (players, with captain/injury/suspension status)
router.get("/:league/teams/:teamId", async (req, res) => {
  try {
    getLeague(req.params.league);
    const teams = await db.listTeams({ league: req.params.league });
    const team = teams.find((t) => t.id === req.params.teamId);
    if (!team) return res.status(404).json({ error: "Team not found" });

    const players = await db.listPlayers({ teamId: req.params.teamId });
    res.json({ team, players });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
