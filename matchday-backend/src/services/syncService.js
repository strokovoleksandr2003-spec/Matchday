// Pulls fixtures from API-Football and folds them into our own tables.
//
// The tricky part is identity: our teams were entered by hand with
// Ukrainian names ("Полісся"), while the API returns its own ids and
// English names ("Polissya Zhytomyr"). Matching is done in three steps,
// most reliable first:
//
//   1. external_id — the team was matched on a previous run
//   2. name similarity — a one-time bridge, then the id is stored so
//      step 1 handles it from then on
//   3. create a new team — the API knows a club we don't
//
// Everything is idempotent: running the sync twice changes nothing the
// second time.

const apiFootball = require("./apiFootballClient");
const db = require("./db");

// Normalises a club name for comparison: lowercase, no punctuation, and
// with the common city//suffix words dropped, so "Polissya Zhytomyr"
// and "Полісся" can still be compared via their transliterations.
function normaliseName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Very small Cyrillic→Latin transliteration, enough to line up club
// names between our hand-entered Ukrainian rows and the API's English
// ones. Not a general-purpose transliterator.
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh",
  з: "z", и: "y", і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n",
  о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", "'": "",
};

function translit(name) {
  return normaliseName(name)
    .split("")
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join("");
}

// Ukrainian romanisation isn't standardised: "Полісся" shows up as both
// "Polissia" and "Polissya" depending on the source. Folding the common
// variants onto one spelling lets names compare equal regardless of
// which standard each side used.
function canonical(name) {
  return translit(name)
    .replace(/ya/g, "ia")
    .replace(/ye/g, "ie")
    .replace(/yu/g, "iu")
    .replace(/j/g, "i")
    .replace(/(.)\1+/g, "$1"); // collapse doubled letters (Polissia/Polisia)
}

// True when either canonical name starts with the other — catches
// "Polissya" vs "Полісся" without matching unrelated clubs.
function namesLineUp(a, b) {
  const x = canonical(a);
  const y = canonical(b);
  if (!x || !y) return false;
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

// API-Football gives a round as "Regular Season - 6"; we store just the
// number.
function parseMatchday(round) {
  const match = /(\d+)\s*$/.exec(round || "");
  return match ? Number(match[1]) : null;
}

// Resolves one API team to a row in our teams table, creating or
// linking as needed. `knownTeams` is the current team list, passed in
// so the caller can fetch it once per run rather than per fixture.
async function resolveTeam(apiTeam, knownTeams, league) {
  const byExternal = knownTeams.find((t) => t.external_id === apiTeam.externalId);
  if (byExternal) return byExternal;

  const byName = knownTeams.find(
    (t) => t.external_id == null && namesLineUp(t.name, apiTeam.name)
  );
  if (byName) {
    const linked = await db.setTeamExternalId(byName.id, apiTeam.externalId);
    Object.assign(byName, linked); // keep the in-memory list current
    return byName;
  }

  const created = await db.addTeam({
    name: apiTeam.name,
    league,
    externalId: apiTeam.externalId,
  });
  knownTeams.push(created);
  return created;
}

// Folds a single fixture into our tables. Returns what it did, so the
// caller can report a summary.
async function syncFixture(fixture, knownTeams, league) {
  const home = await resolveTeam(fixture.home, knownTeams, league);
  const away = await resolveTeam(fixture.away, knownTeams, league);
  const matchday = parseMatchday(fixture.round);

  const existing = await db.findMatchByExternalId(fixture.externalId);

  if (!existing) {
    const created = await db.addMatch({
      league,
      homeTeamId: home.id,
      awayTeamId: away.id,
      utcDate: fixture.utcDate,
      matchday,
      externalId: fixture.externalId,
    });
    if (fixture.isFinished && fixture.score) {
      await db.setMatchScore(created.id, fixture.score);
      return "created_finished";
    }
    return "created";
  }

  // kickoff moved or round corrected upstream
  const scheduleChanged =
    new Date(existing.utcDate).getTime() !== new Date(fixture.utcDate).getTime() ||
    existing.matchday !== matchday;
  if (scheduleChanged) {
    await db.updateMatchSchedule(existing.id, { utcDate: fixture.utcDate, matchday });
  }

  // result came in, or was corrected
  const scoreChanged =
    fixture.isFinished &&
    fixture.score &&
    (!existing.score ||
      existing.score.home !== fixture.score.home ||
      existing.score.away !== fixture.score.away);

  if (scoreChanged) {
    await db.setMatchScore(existing.id, fixture.score);
    return "result_updated";
  }

  return scheduleChanged ? "schedule_updated" : "unchanged";
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// Main entry point. Defaults to a window of the last 7 and next 14 days
// — wide enough to pick up a postponed match's new date and any result
// entered late, narrow enough to stay at one API request per run.
async function syncFixtures({ league = "upl", daysBack = 7, daysForward = 14 } = {}) {
  const now = Date.now();
  const from = isoDate(new Date(now - daysBack * 86400000));
  const to = isoDate(new Date(now + daysForward * 86400000));

  const fixtures = await apiFootball.fetchFixtures({ from, to });
  const knownTeams = await db.listTeams({ league });

  const summary = {
    window: { from, to },
    fetched: fixtures.length,
    created: 0,
    created_finished: 0,
    result_updated: 0,
    schedule_updated: 0,
    unchanged: 0,
    errors: [],
  };

  for (const fixture of fixtures) {
    try {
      const outcome = await syncFixture(fixture, knownTeams, league);
      summary[outcome] += 1;
    } catch (err) {
      // One bad fixture shouldn't abort the whole run.
      summary.errors.push({ fixture: fixture.externalId, message: err.message });
    }
  }

  return summary;
}

module.exports = { syncFixtures, syncFixture, namesLineUp, parseMatchday, translit, canonical };
