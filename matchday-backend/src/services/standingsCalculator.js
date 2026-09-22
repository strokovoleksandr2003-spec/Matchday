// Builds the standings table from teams + finished matches, the way
// any league table is derived: 3 points for a win, 1 for a draw,
// ranked by points, then goal difference, then goals scored.

function buildStandings(teams, finishedMatches) {
  const rows = new Map(
    teams.map((team) => [
      team.id,
      {
        team: { id: team.id, name: team.name },
        matches_played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        points: 0,
      },
    ])
  );

  for (const match of finishedMatches) {
    if (!match.score) continue;
    const home = rows.get(match.homeTeamId);
    const away = rows.get(match.awayTeamId);
    if (!home || !away) continue; // team was deleted after the match was recorded

    const { home: hg, away: ag } = match.score;

    home.matches_played += 1;
    away.matches_played += 1;
    home.goals_for += hg;
    home.goals_against += ag;
    away.goals_for += ag;
    away.goals_against += hg;

    if (hg > ag) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
    } else if (hg < ag) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      goal_difference: row.goals_for - row.goals_against,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goal_difference !== a.goal_difference)
        return b.goal_difference - a.goal_difference;
      return b.goals_for - a.goals_for;
    })
    .map((row, i) => ({ position: i + 1, ...row }));
}

module.exports = { buildStandings };
