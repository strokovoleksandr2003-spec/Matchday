// Shared fixture data for tests. Shape matches what routes/league.js
// produces after joining team ids onto names — {home_team, away_team,
// score, utc_date} — so it can feed formCalculator directly.

const finishedMatches = [
  {
    id: "mt_f1",
    utc_date: "2026-09-13T15:00:00.000Z",
    home_team: { id: "tm_pol", name: "Polissya Zhytomyr" },
    away_team: { id: "tm_dyn", name: "Dynamo Kyiv" },
    score: { home: 2, away: 1 },
  },
  {
    id: "mt_f2",
    utc_date: "2026-09-20T15:00:00.000Z",
    home_team: { id: "tm_shk", name: "Shakhtar Donetsk" },
    away_team: { id: "tm_pol", name: "Polissya Zhytomyr" },
    score: { home: 1, away: 1 },
  },
];

module.exports = { finishedMatches };
