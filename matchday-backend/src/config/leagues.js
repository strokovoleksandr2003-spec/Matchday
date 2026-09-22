// No external API to map to anymore — this just says which league
// keys the app knows about, so a typo in a URL gets a clean 400
// instead of silently returning an empty table.

const LEAGUES = {
  upl: { label: "UPL" },
};

function getLeague(key) {
  const league = LEAGUES[key];
  if (!league) {
    const known = Object.keys(LEAGUES).join(", ");
    throw new Error(`Unknown league "${key}". Known leagues: ${known}`);
  }
  return { key, ...league };
}

module.exports = { LEAGUES, getLeague };
