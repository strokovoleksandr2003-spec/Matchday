// Turns a list of finished matches into a per-team form strip, e.g.
// { "Polissya": ["W","W","D","W","W"] } — most recent last, matching
// the form badges in the design.

function resultLetter(teamGoals, oppGoals) {
  if (teamGoals > oppGoals) return "W";
  if (teamGoals === oppGoals) return "D";
  return "L";
}

function buildFormByTeam(finishedMatches, { limit = 5 } = {}) {
  const byTeam = new Map();

  // matches should already be sorted oldest→newest by the API; sort
  // defensively so the "last N" slice below is always correct
  const sorted = [...finishedMatches].sort(
    (a, b) => new Date(a.utc_date) - new Date(b.utc_date)
  );

  for (const match of sorted) {
    const { home_team, away_team, score } = match;
    if (!score || score.home == null || score.away == null) continue;

    const homeLetter = resultLetter(score.home, score.away);
    const awayLetter = resultLetter(score.away, score.home);

    for (const [teamName, letter] of [
      [home_team.name, homeLetter],
      [away_team.name, awayLetter],
    ]) {
      if (!byTeam.has(teamName)) byTeam.set(teamName, []);
      byTeam.get(teamName).push(letter);
    }
  }

  const result = {};
  for (const [teamName, letters] of byTeam) {
    result[teamName] = letters.slice(-limit);
  }
  return result;
}

module.exports = { buildFormByTeam };
