const { test, describe, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const db = require("../src/services/db");
const { createFakeSupabaseClient } = require("./fakeSupabaseClient");

let app;

before(() => {
  process.env.ADMIN_TOKEN = "test-secret";
  const { createApp } = require("../src/app");
  app = createApp();
});

after(() => {
  delete process.env.ADMIN_TOKEN;
});

beforeEach(() => {
  db._setClient(createFakeSupabaseClient());
});

describe("admin auth", () => {
  test("401s with no token", async () => {
    const res = await request(app).get("/api/admin/teams");
    assert.equal(res.status, 401);
  });

  test("401s with the wrong token", async () => {
    const res = await request(app).get("/api/admin/teams").set("x-admin-token", "nope");
    assert.equal(res.status, 401);
  });

  test("succeeds with the right token", async () => {
    const res = await request(app).get("/api/admin/teams").set("x-admin-token", "test-secret");
    assert.equal(res.status, 200);
  });
});

describe("admin teams CRUD", () => {
  test("add then list then delete a team", async () => {
    const add = await request(app)
      .post("/api/admin/teams")
      .set("x-admin-token", "test-secret")
      .send({ name: "Polissya", league: "upl" });
    assert.equal(add.status, 201);
    const teamId = add.body.team.id;

    const list = await request(app).get("/api/admin/teams").set("x-admin-token", "test-secret");
    assert.equal(list.body.teams.length, 1);

    const del = await request(app)
      .delete(`/api/admin/teams/${teamId}`)
      .set("x-admin-token", "test-secret");
    assert.equal(del.status, 200);
    assert.equal(del.body.deleted, true);
  });

  test("400s for a blank team name", async () => {
    const res = await request(app)
      .post("/api/admin/teams")
      .set("x-admin-token", "test-secret")
      .send({ name: "" });
    assert.equal(res.status, 400);
  });
});

describe("admin matches CRUD", () => {
  test("schedule a match, enter a score, delete it", async () => {
    const teamA = (
      await request(app).post("/api/admin/teams").set("x-admin-token", "test-secret").send({ name: "A" })
    ).body.team;
    const teamB = (
      await request(app).post("/api/admin/teams").set("x-admin-token", "test-secret").send({ name: "B" })
    ).body.team;

    const scheduled = await request(app)
      .post("/api/admin/matches")
      .set("x-admin-token", "test-secret")
      .send({ homeTeamId: teamA.id, awayTeamId: teamB.id, utcDate: "2026-10-01T15:00:00.000Z" });
    assert.equal(scheduled.status, 201);
    assert.equal(scheduled.body.match.status, "scheduled");

    const scored = await request(app)
      .patch(`/api/admin/matches/${scheduled.body.match.id}/score`)
      .set("x-admin-token", "test-secret")
      .send({ home: 2, away: 1 });
    assert.equal(scored.status, 200);
    assert.equal(scored.body.match.status, "finished");
    assert.deepEqual(scored.body.match.score, { home: 2, away: 1 });

    const deleted = await request(app)
      .delete(`/api/admin/matches/${scheduled.body.match.id}`)
      .set("x-admin-token", "test-secret");
    assert.equal(deleted.status, 200);
  });

  test("400s when scheduling a team against itself", async () => {
    const teamA = (
      await request(app).post("/api/admin/teams").set("x-admin-token", "test-secret").send({ name: "A" })
    ).body.team;

    const res = await request(app)
      .post("/api/admin/matches")
      .set("x-admin-token", "test-secret")
      .send({ homeTeamId: teamA.id, awayTeamId: teamA.id, utcDate: "2026-10-01T15:00:00.000Z" });
    assert.equal(res.status, 400);
  });
});
