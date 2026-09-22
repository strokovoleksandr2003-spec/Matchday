const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { buildFormByTeam } = require("../src/services/formCalculator");
const { finishedMatches } = require("../fixtures/matches.fixtures");

describe("formCalculator.buildFormByTeam", () => {
  test("derives W/D/L per team from finished matches, oldest first", () => {
    const form = buildFormByTeam(finishedMatches);

    // Polissya: won at home 2-1, then drew away 1-1 -> "W","D"
    assert.deepEqual(form["Polissya Zhytomyr"], ["W", "D"]);
    // Shakhtar: drew at home 1-1 -> "D"
    assert.deepEqual(form["Shakhtar Donetsk"], ["D"]);
    // Dynamo: lost away 1-2 -> "L"
    assert.deepEqual(form["Dynamo Kyiv"], ["L"]);
  });

  test("respects the limit option, keeping the most recent results", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `mt_${i}`,
      utc_date: new Date(2026, 0, i + 1).toISOString(),
      home_team: { id: "tm_x", name: "Team X" },
      away_team: { id: "tm_y", name: `Opp ${i}` },
      // Team X wins every even-indexed match, loses odd
      score: i % 2 === 0 ? { home: 2, away: 0 } : { home: 0, away: 2 },
    }));

    const form = buildFormByTeam(many, { limit: 3 });
    assert.equal(form["Team X"].length, 3);
    // last three of W,L,W,L,W,L,W -> L,W,L (indices 4,5,6)
    assert.deepEqual(form["Team X"], ["W", "L", "W"]);
  });

  test("ignores matches with no score", () => {
    const withUnplayed = [
      {
        id: "mt_x",
        utc_date: "2026-09-25T00:00:00.000Z",
        home_team: { id: "tm_a", name: "A" },
        away_team: { id: "tm_b", name: "B" },
        score: { home: null, away: null },
      },
    ];
    const form = buildFormByTeam(withUnplayed);
    assert.deepEqual(form, {});
  });

  test("returns an empty object for an empty match list", () => {
    assert.deepEqual(buildFormByTeam([]), {});
  });
});
