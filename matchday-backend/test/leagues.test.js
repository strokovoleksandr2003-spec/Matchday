const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { getLeague } = require("../src/config/leagues");

describe("leagues.getLeague", () => {
  test("resolves a known league key", () => {
    assert.deepEqual(getLeague("upl"), { key: "upl", label: "UPL" });
  });

  test("throws a helpful error for an unknown league key", () => {
    assert.throws(
      () => getLeague("not-a-real-league"),
      /Unknown league "not-a-real-league"/
    );
  });
});
