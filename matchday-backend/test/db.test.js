const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const db = require("../src/services/db");
const { createFakeSupabaseClient } = require("./fakeSupabaseClient");

beforeEach(() => {
  db._setClient(createFakeSupabaseClient());
});

describe("db.teams", () => {
  test("starts empty", async () => {
    assert.deepEqual(await db.listTeams(), []);
  });

  test("addTeam persists and returns the created team", async () => {
    const team = await db.addTeam({ name: "Polissya" });
    assert.equal(team.name, "Polissya");
    assert.equal(team.league, "upl");
    assert.ok(team.id);
    assert.deepEqual(await db.listTeams(), [team]);
  });

  test("addTeam rejects a blank name", async () => {
    await assert.rejects(() => db.addTeam({ name: "   " }), /required/);
  });

  test("deleteTeam removes it and reports success", async () => {
    const team = await db.addTeam({ name: "Shakhtar" });
    assert.equal(await db.deleteTeam(team.id), true);
    assert.deepEqual(await db.listTeams(), []);
  });

  test("deleteTeam reports false for an unknown id", async () => {
    assert.equal(await db.deleteTeam("00000000-0000-0000-0000-000000000000"), false);
  });

  test("listTeams only returns teams for the requested league", async () => {
    await db.addTeam({ name: "A", league: "upl" });
    await db.addTeam({ name: "B", league: "other" });
    const upl = await db.listTeams({ league: "upl" });
    assert.equal(upl.length, 1);
    assert.equal(upl[0].name, "A");
  });
});

describe("db.matches", () => {
  test("addMatch requires two different, valid teams and a date", async () => {
    const a = await db.addTeam({ name: "A" });
    const b = await db.addTeam({ name: "B" });

    await assert.rejects(
      () => db.addMatch({ homeTeamId: a.id, awayTeamId: a.id, utcDate: "2026-10-01" }),
      /can't play itself/
    );
    await assert.rejects(
      () => db.addMatch({ homeTeamId: a.id, awayTeamId: b.id, utcDate: "not-a-date" }),
      /valid date/
    );

    const match = await db.addMatch({
      homeTeamId: a.id,
      awayTeamId: b.id,
      utcDate: "2026-10-01T15:00:00.000Z",
    });
    assert.equal(match.status, "scheduled");
    assert.equal(match.score, null);
    assert.equal(match.homeTeamId, a.id);
  });

  test("setMatchScore records a result and flips status to finished", async () => {
    const a = await db.addTeam({ name: "A" });
    const b = await db.addTeam({ name: "B" });
    const match = await db.addMatch({ homeTeamId: a.id, awayTeamId: b.id, utcDate: "2026-10-01T15:00:00.000Z" });

    const updated = await db.setMatchScore(match.id, { home: 2, away: 0 });
    assert.equal(updated.status, "finished");
    assert.deepEqual(updated.score, { home: 2, away: 0 });
  });

  test("setMatchScore with null score reverts to scheduled", async () => {
    const a = await db.addTeam({ name: "A" });
    const b = await db.addTeam({ name: "B" });
    const match = await db.addMatch({ homeTeamId: a.id, awayTeamId: b.id, utcDate: "2026-10-01T15:00:00.000Z" });
    await db.setMatchScore(match.id, { home: 2, away: 0 });

    const reverted = await db.setMatchScore(match.id, { home: null, away: null });
    assert.equal(reverted.status, "scheduled");
    assert.equal(reverted.score, null);
  });

  test("setMatchScore throws for an unknown match id", async () => {
    await assert.rejects(
      () => db.setMatchScore("00000000-0000-0000-0000-000000000000", { home: 1, away: 0 }),
      /No match with id/
    );
  });

  test("listMatches filters by league and status", async () => {
    const a = await db.addTeam({ name: "A" });
    const b = await db.addTeam({ name: "B" });
    const m1 = await db.addMatch({ homeTeamId: a.id, awayTeamId: b.id, utcDate: "2026-10-01T15:00:00.000Z" });
    await db.addMatch({ league: "other", homeTeamId: a.id, awayTeamId: b.id, utcDate: "2026-10-02T15:00:00.000Z" });
    await db.setMatchScore(m1.id, { home: 1, away: 1 });

    assert.equal((await db.listMatches({ league: "upl" })).length, 1);
    assert.equal((await db.listMatches({ league: "upl", status: "finished" })).length, 1);
    assert.equal((await db.listMatches({ league: "upl", status: "scheduled" })).length, 0);
    assert.equal((await db.listMatches({ league: "other" })).length, 1);
  });

  test("deleteMatch removes it", async () => {
    const a = await db.addTeam({ name: "A" });
    const b = await db.addTeam({ name: "B" });
    const match = await db.addMatch({ homeTeamId: a.id, awayTeamId: b.id, utcDate: "2026-10-01T15:00:00.000Z" });
    assert.equal(await db.deleteMatch(match.id), true);
    assert.deepEqual(await db.listMatches({ league: "upl" }), []);
  });
});
