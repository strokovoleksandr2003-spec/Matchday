const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { requireConfig, normaliseFixture } = require("../src/services/apiFootballClient");

const saved = {};

beforeEach(() => {
  for (const k of ["API_FOOTBALL_KEY", "API_FOOTBALL_HOST", "API_FOOTBALL_LEAGUE_ID", "API_FOOTBALL_SEASON"]) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("apiFootballClient.requireConfig", () => {
  test("throws a useful error when no key is set", () => {
    assert.throws(() => requireConfig(), /API_FOOTBALL_KEY must be set/);
  });

  test("defaults to the direct host with the x-apisports-key header", () => {
    process.env.API_FOOTBALL_KEY = "abc123";
    const cfg = requireConfig();

    assert.equal(cfg.host, "v3.football.api-sports.io");
    assert.equal(cfg.baseUrl, "https://v3.football.api-sports.io");
    assert.deepEqual(cfg.headers, { "x-apisports-key": "abc123" });
    assert.ok(!("x-rapidapi-key" in cfg.headers), "must not send RapidAPI headers to the direct host");
  });

  test("switches to RapidAPI headers when a RapidAPI host is configured", () => {
    process.env.API_FOOTBALL_KEY = "abc123";
    process.env.API_FOOTBALL_HOST = "api-football-v1.p.rapidapi.com";
    const cfg = requireConfig();

    assert.equal(cfg.baseUrl, "https://api-football-v1.p.rapidapi.com/v3");
    assert.deepEqual(cfg.headers, {
      "x-rapidapi-key": "abc123",
      "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
    });
  });

  test("tolerates a host given with a scheme or trailing slash", () => {
    process.env.API_FOOTBALL_KEY = "abc123";
    process.env.API_FOOTBALL_HOST = "https://v3.football.api-sports.io/";
    assert.equal(requireConfig().host, "v3.football.api-sports.io");
  });

  test("defaults the league to the UPL", () => {
    process.env.API_FOOTBALL_KEY = "abc123";
    assert.equal(requireConfig().leagueId, "333");
  });
});

describe("apiFootballClient.normaliseFixture", () => {
  test("flattens a finished fixture", () => {
    const out = normaliseFixture({
      fixture: { id: 42, date: "2026-09-20T15:00:00+00:00", status: { short: "FT" } },
      league: { round: "Regular Season - 5" },
      teams: { home: { id: 1, name: "A" }, away: { id: 2, name: "B" } },
      goals: { home: 2, away: 1 },
    });

    assert.equal(out.externalId, 42);
    assert.equal(out.isFinished, true);
    assert.deepEqual(out.score, { home: 2, away: 1 });
    assert.equal(out.home.name, "A");
  });

  test("treats a not-started fixture as unfinished with no score", () => {
    const out = normaliseFixture({
      fixture: { id: 43, date: "2026-10-01T15:00:00+00:00", status: { short: "NS" } },
      league: { round: "Regular Season - 6" },
      teams: { home: { id: 1, name: "A" }, away: { id: 2, name: "B" } },
      goals: { home: null, away: null },
    });

    assert.equal(out.isFinished, false);
    assert.equal(out.score, null);
  });

  test("does not treat a postponed fixture as finished", () => {
    const out = normaliseFixture({
      fixture: { id: 44, date: "2026-10-01T15:00:00+00:00", status: { short: "PST" } },
      league: { round: "Regular Season - 6" },
      teams: { home: { id: 1, name: "A" }, away: { id: 2, name: "B" } },
      goals: { home: null, away: null },
    });

    assert.equal(out.isFinished, false);
  });
});
