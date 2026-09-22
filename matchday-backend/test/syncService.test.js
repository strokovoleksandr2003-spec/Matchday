const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const db = require("../src/services/db");
const apiFootball = require("../src/services/apiFootballClient");
const sync = require("../src/services/syncService");
const { createFakeSupabaseClient } = require("./fakeSupabaseClient");

// Replaces the network call with canned fixtures. Restored in afterEach.
const realFetchFixtures = apiFootball.fetchFixtures;

function stubFixtures(fixtures) {
  apiFootball.fetchFixtures = async () => fixtures;
}

function fixture(overrides = {}) {
  return {
    externalId: 1001,
    utcDate: "2026-09-20T15:00:00.000Z",
    statusShort: "FT",
    isFinished: true,
    round: "Regular Season - 5",
    home: { externalId: 501, name: "Polissya Zhytomyr" },
    away: { externalId: 502, name: "Dynamo Kyiv" },
    score: { home: 2, away: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  db._setClient(createFakeSupabaseClient());
});

afterEach(() => {
  apiFootball.fetchFixtures = realFetchFixtures;
});

describe("syncService.namesLineUp", () => {
  test("matches a Ukrainian name against its English API counterpart", () => {
    assert.equal(sync.namesLineUp("Полісся", "Polissya Zhytomyr"), true);
    assert.equal(sync.namesLineUp("Динамо", "Dynamo Kyiv"), true);
    assert.equal(sync.namesLineUp("Шахтар", "Shakhtar Donetsk"), true);
  });

  test("does not match unrelated clubs", () => {
    assert.equal(sync.namesLineUp("Полісся", "Dynamo Kyiv"), false);
    assert.equal(sync.namesLineUp("Карпати", "Kryvbas"), false);
  });

  test("refuses to match on very short fragments", () => {
    assert.equal(sync.namesLineUp("ЛНЗ", "L"), false);
  });
});

describe("syncService.parseMatchday", () => {
  test("pulls the round number out of API-Football's round string", () => {
    assert.equal(sync.parseMatchday("Regular Season - 6"), 6);
    assert.equal(sync.parseMatchday("Regular Season - 23"), 23);
  });

  test("returns null when there's no number", () => {
    assert.equal(sync.parseMatchday("Final"), null);
    assert.equal(sync.parseMatchday(null), null);
  });
});

describe("syncService.syncFixtures", () => {
  test("creates teams and a finished match on a first run", async () => {
    stubFixtures([fixture()]);
    const summary = await sync.syncFixtures();

    assert.equal(summary.fetched, 1);
    assert.equal(summary.created_finished, 1);

    const teams = await db.listTeams({ league: "upl" });
    assert.equal(teams.length, 2);

    const matches = await db.listMatches({ league: "upl", status: "finished" });
    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].score, { home: 2, away: 1 });
    assert.equal(matches[0].matchday, 5);
  });

  test("is idempotent — a second run changes nothing", async () => {
    stubFixtures([fixture()]);
    await sync.syncFixtures();
    const summary = await sync.syncFixtures();

    assert.equal(summary.unchanged, 1);
    assert.equal(summary.created, 0);
    assert.equal(summary.created_finished, 0);

    assert.equal((await db.listTeams({ league: "upl" })).length, 2);
    assert.equal((await db.listMatches({ league: "upl" })).length, 1);
  });

  test("links a hand-entered Ukrainian team instead of duplicating it", async () => {
    const existing = await db.addTeam({ name: "Полісся" });
    stubFixtures([fixture()]);

    await sync.syncFixtures();

    const teams = await db.listTeams({ league: "upl" });
    // Polissya was matched by name; only Dynamo is new
    assert.equal(teams.length, 2);

    const polissya = teams.find((t) => t.id === existing.id);
    assert.ok(polissya, "the hand-entered team should still be there");
    assert.equal(polissya.external_id, 501, "and should now be linked to the API id");
    assert.equal(polissya.name, "Полісся", "keeping its Ukrainian name");
  });

  test("fills in a result when a previously scheduled match finishes", async () => {
    stubFixtures([fixture({ isFinished: false, score: null, statusShort: "NS" })]);
    await sync.syncFixtures();

    let matches = await db.listMatches({ league: "upl" });
    assert.equal(matches[0].status, "scheduled");

    stubFixtures([fixture()]); // now finished, 2-1
    const summary = await sync.syncFixtures();

    assert.equal(summary.result_updated, 1);
    matches = await db.listMatches({ league: "upl" });
    assert.equal(matches[0].status, "finished");
    assert.deepEqual(matches[0].score, { home: 2, away: 1 });
  });

  test("moves a postponed match to its new date", async () => {
    stubFixtures([fixture({ isFinished: false, score: null })]);
    await sync.syncFixtures();

    stubFixtures([
      fixture({ isFinished: false, score: null, utcDate: "2026-10-05T18:00:00.000Z" }),
    ]);
    const summary = await sync.syncFixtures();

    assert.equal(summary.schedule_updated, 1);
    const matches = await db.listMatches({ league: "upl" });
    assert.equal(new Date(matches[0].utcDate).toISOString(), "2026-10-05T18:00:00.000Z");
  });

  test("corrects a result that changed upstream", async () => {
    stubFixtures([fixture()]);
    await sync.syncFixtures();

    stubFixtures([fixture({ score: { home: 3, away: 1 } })]);
    const summary = await sync.syncFixtures();

    assert.equal(summary.result_updated, 1);
    const matches = await db.listMatches({ league: "upl" });
    assert.deepEqual(matches[0].score, { home: 3, away: 1 });
  });

  test("one broken fixture doesn't abort the rest of the run", async () => {
    stubFixtures([
      fixture({ externalId: 1, home: { externalId: 9, name: "X" }, away: { externalId: 9, name: "X" } }), // same team both sides
      fixture({ externalId: 2 }),
    ]);

    const summary = await sync.syncFixtures();

    assert.equal(summary.errors.length, 1);
    assert.equal(summary.created_finished, 1, "the good fixture still synced");
  });

  test("reports the date window it queried", async () => {
    stubFixtures([]);
    const summary = await sync.syncFixtures({ daysBack: 1, daysForward: 1 });
    assert.match(summary.window.from, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(summary.window.to, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(summary.window.from < summary.window.to);
  });
});
