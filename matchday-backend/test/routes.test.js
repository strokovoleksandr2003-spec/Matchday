const { test, describe, before, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const db = require("../src/services/db");
const { createFakeSupabaseClient } = require("./fakeSupabaseClient");

let app;

before(() => {
  const { createApp } = require("../src/app");
  app = createApp();
});

let polissya, dynamo, shakhtar;

beforeEach(async () => {
  db._setClient(createFakeSupabaseClient());

  polissya = await db.addTeam({ name: "Polissya" });
  dynamo = await db.addTeam({ name: "Dynamo" });
  shakhtar = await db.addTeam({ name: "Shakhtar" });

  const finished1 = await db.addMatch({
    homeTeamId: polissya.id,
    awayTeamId: dynamo.id,
    utcDate: "2026-09-13T15:00:00.000Z",
  });
  await db.setMatchScore(finished1.id, { home: 2, away: 1 });

  const finished2 = await db.addMatch({
    homeTeamId: shakhtar.id,
    awayTeamId: polissya.id,
    utcDate: "2026-09-20T15:00:00.000Z",
  });
  await db.setMatchScore(finished2.id, { home: 1, away: 1 });

  const soon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const later = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const farAway = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();

  await db.addMatch({ homeTeamId: polissya.id, awayTeamId: shakhtar.id, utcDate: later });
  await db.addMatch({ homeTeamId: dynamo.id, awayTeamId: shakhtar.id, utcDate: soon });
  await db.addMatch({ homeTeamId: dynamo.id, awayTeamId: polissya.id, utcDate: farAway }); // outside the 7-day window
});

describe("GET /api/leagues/:league/standings", () => {
  test("returns a computed table for a known league", async () => {
    const res = await request(app).get("/api/leagues/upl/standings");
    assert.equal(res.status, 200);
    assert.equal(res.body.standings.length, 3);
    assert.equal(res.body.standings[0].team.name, "Polissya"); // 4 pts vs Dynamo's 0, Shakhtar's 1
  });

  test("400s for an unknown league", async () => {
    const res = await request(app).get("/api/leagues/nope/standings");
    assert.equal(res.status, 400);
    assert.match(res.body.error, /Unknown league/);
  });
});

describe("GET /api/leagues/:league/next-match", () => {
  test("returns the soonest scheduled match", async () => {
    const res = await request(app).get("/api/leagues/upl/next-match");
    assert.equal(res.status, 200);
    assert.equal(res.body.match.home_team.name, "Dynamo");
    assert.equal(res.body.match.away_team.name, "Shakhtar");
  });
});

describe("GET /api/leagues/:league/fixtures/week", () => {
  test("only includes matches within the next 7 days", async () => {
    const res = await request(app).get("/api/leagues/upl/fixtures/week");
    assert.equal(res.status, 200);
    assert.equal(res.body.fixtures.length, 2); // "soon" and "later", not "farAway"
  });
});

describe("GET /api/leagues/:league/form", () => {
  test("returns computed W/D/L form per team", async () => {
    const res = await request(app).get("/api/leagues/upl/form?limit=5");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.form["Polissya"], ["W", "D"]);
    assert.deepEqual(res.body.form["Shakhtar"], ["D"]);
    assert.deepEqual(res.body.form["Dynamo"], ["L"]);
  });
});
