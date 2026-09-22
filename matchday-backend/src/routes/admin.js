const express = require("express");
const db = require("../services/db");
const { adminAuth } = require("../middleware/adminAuth");

const router = express.Router();
router.use(adminAuth);

// --- teams ---------------------------------------------------------

router.get("/teams", async (req, res) => {
  try {
    const teams = await db.listTeams({ league: req.query.league || "upl" });
    res.json({ teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/teams", async (req, res) => {
  try {
    const team = await db.addTeam({ name: req.body.name, league: req.body.league });
    res.status(201).json({ team });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/teams/:id", async (req, res) => {
  try {
    const deleted = await db.deleteTeam(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Team not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// team info — coach and stadium
router.patch("/teams/:id", async (req, res) => {
  try {
    const team = await db.updateTeam(req.params.id, {
      coach: req.body.coach,
      stadium: req.body.stadium,
    });
    res.json({ team });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- matches ---------------------------------------------------------

router.get("/matches", async (req, res) => {
  try {
    const matches = await db.listMatches({ league: req.query.league || "upl" });
    res.json({ matches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/matches", async (req, res) => {
  try {
    const match = await db.addMatch({
      league: req.body.league,
      homeTeamId: req.body.homeTeamId,
      awayTeamId: req.body.awayTeamId,
      utcDate: req.body.utcDate,
      matchday: req.body.matchday,
    });
    res.status(201).json({ match });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// enter or correct a result — {home: 2, away: 1}; {home: null, away: null}
// reverts the match to "scheduled" in case of a typo
router.patch("/matches/:id/score", async (req, res) => {
  try {
    const match = await db.setMatchScore(req.params.id, {
      home: req.body.home,
      away: req.body.away,
    });
    res.json({ match });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/matches/:id", async (req, res) => {
  try {
    const deleted = await db.deleteMatch(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Match not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- players (squad) -------------------------------------------------

router.get("/players", async (req, res) => {
  try {
    const players = await db.listPlayers({ teamId: req.query.teamId });
    res.json({ players });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/players", async (req, res) => {
  try {
    const player = await db.addPlayer({
      teamId: req.body.teamId,
      name: req.body.name,
      position: req.body.position,
      jerseyNumber: req.body.jerseyNumber,
      isCaptain: req.body.isCaptain,
    });
    res.status(201).json({ player });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// partial update — name/position/jerseyNumber/isCaptain/status/statusNote,
// send only what changed
router.patch("/players/:id", async (req, res) => {
  try {
    const player = await db.updatePlayer(req.params.id, req.body);
    res.json({ player });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/players/:id", async (req, res) => {
  try {
    const deleted = await db.deletePlayer(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Player not found" });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
