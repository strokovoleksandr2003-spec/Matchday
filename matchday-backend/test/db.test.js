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

describe("db.updateTeam", () => {
  test("sets coach and stadium, leaves other fields alone", async () => {
    const team = await db.addTeam({ name: "Polissya" });
    const updated = await db.updateTeam(team.id, { coach: "Ruslan Rotan", stadium: "Polissya Arena" });
    assert.equal(updated.coach, "Ruslan Rotan");
    assert.equal(updated.stadium, "Polissya Arena");
    assert.equal(updated.name, "Polissya");
  });

  test("throws for an unknown team id", async () => {
    await assert.rejects(
      () => db.updateTeam("00000000-0000-0000-0000-000000000000", { coach: "X" }),
      /No team with id/
    );
  });
});

describe("db.players", () => {
  test("addPlayer requires a teamId and a name", async () => {
    const team = await db.addTeam({ name: "A" });
    await assert.rejects(() => db.addPlayer({ name: "X" }), /teamId is required/);
    await assert.rejects(() => db.addPlayer({ teamId: team.id, name: "  " }), /name is required/);
  });

  test("addPlayer defaults status to available and isCaptain to false", async () => {
    const team = await db.addTeam({ name: "A" });
    const player = await db.addPlayer({ teamId: team.id, name: "Ivan Petrenko", position: "MF", jerseyNumber: 8 });
    assert.equal(player.status, "available");
    assert.equal(player.isCaptain, false);
    assert.equal(player.jerseyNumber, 8);
  });

  test("listPlayers only returns players for the requested team", async () => {
    const a = await db.addTeam({ name: "A" });
    const b = await db.addTeam({ name: "B" });
    await db.addPlayer({ teamId: a.id, name: "A1" });
    await db.addPlayer({ teamId: b.id, name: "B1" });

    const aPlayers = await db.listPlayers({ teamId: a.id });
    assert.equal(aPlayers.length, 1);
    assert.equal(aPlayers[0].name, "A1");
  });

  test("updatePlayer changes status and captain flag", async () => {
    const team = await db.addTeam({ name: "A" });
    const player = await db.addPlayer({ teamId: team.id, name: "X" });

    const injured = await db.updatePlayer(player.id, { status: "injured", statusNote: "hamstring" });
    assert.equal(injured.status, "injured");
    assert.equal(injured.statusNote, "hamstring");

    const captain = await db.updatePlayer(player.id, { isCaptain: true });
    assert.equal(captain.isCaptain, true);
  });

  test("updatePlayer rejects an invalid status", async () => {
    const team = await db.addTeam({ name: "A" });
    const player = await db.addPlayer({ teamId: team.id, name: "X" });
    await assert.rejects(
      () => db.updatePlayer(player.id, { status: "on-loan" }),
      /status must be one of/
    );
  });

  test("deletePlayer removes them", async () => {
    const team = await db.addTeam({ name: "A" });
    const player = await db.addPlayer({ teamId: team.id, name: "X" });
    assert.equal(await db.deletePlayer(player.id), true);
    assert.deepEqual(await db.listPlayers({ teamId: team.id }), []);
  });
});
