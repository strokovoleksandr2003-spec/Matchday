const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { buildStandings } = require("../src/services/standingsCalculator");

const teams = [
  { id: "tm_a", name: "A" },
  { id: "tm_b", name: "B" },
  { id: "tm_c", name: "C" },
];

describe("standingsCalculator.buildStandings", () => {
  test("gives every team a zeroed row when there are no matches", () => {
    const rows = buildStandings(teams, []);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((r) => r.points === 0 && r.matches_played === 0));
  });

  test("awards 3 points for a win, 1 each for a draw, 0 for a loss", () => {
    const rows = buildStandings(teams, [
      { homeTeamId: "tm_a", awayTeamId: "tm_b", score: { home: 2, away: 0 } }, // A beats B
      { homeTeamId: "tm_b", awayTeamId: "tm_c", score: { home: 1, away: 1 } }, // B draws C
    ]);

    const byId = Object.fromEntries(rows.map((r) => [r.team.id, r]));
    assert.equal(byId.tm_a.points, 3);
    assert.equal(byId.tm_a.wins, 1);
    assert.equal(byId.tm_b.points, 1);
    assert.equal(byId.tm_b.draws, 1);
    assert.equal(byId.tm_b.losses, 1);
    assert.equal(byId.tm_c.points, 1);
  });

  test("ranks by points, then goal difference, then goals scored", () => {
    const rows = buildStandings(teams, [
      { homeTeamId: "tm_a", awayTeamId: "tm_b", score: { home: 3, away: 0 } },
      { homeTeamId: "tm_c", awayTeamId: "tm_b", score: { home: 1, away: 0 } },
    ]);
    // A: 3 pts, +3 GD. C: 3 pts, +1 GD. B: 0 pts.
    assert.deepEqual(
      rows.map((r) => r.team.name),
      ["A", "C", "B"]
    );
    assert.equal(rows[0].position, 1);
    assert.equal(rows[1].position, 2);
  });

  test("ignores a match referencing a team not in the list", () => {
    const rows = buildStandings(teams, [
      { homeTeamId: "tm_a", awayTeamId: "tm_ghost", score: { home: 2, away: 0 } },
    ]);
    assert.ok(rows.every((r) => r.matches_played === 0));
  });
});
