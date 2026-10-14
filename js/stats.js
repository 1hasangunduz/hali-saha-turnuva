export function scoreOf(match) {
  const goals = match.goals || [];
  return {
    home: goals.filter((g) => g.teamId === match.homeTeamId).length,
    away: goals.filter((g) => g.teamId === match.awayTeamId).length,
  };
}

export function computeStandings(teams, matches) {
  const rows = new Map(
    teams.map((t) => [
      t.id,
      { teamId: t.id, name: t.name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, gd: 0, points: 0 },
    ]),
  );

  for (const m of matches) {
    if (m.status !== 'played') continue;
    const home = rows.get(m.homeTeamId);
    const away = rows.get(m.awayTeamId);
    if (!home || !away) continue;

    const s = scoreOf(m);
    home.played++;
    away.played++;
    home.gf += s.home;
    home.ga += s.away;
    away.gf += s.away;
    away.ga += s.home;

    if (s.home > s.away) {
      home.won++;
      away.lost++;
      home.points += 3;
    } else if (s.home < s.away) {
      away.won++;
      home.lost++;
      away.points += 3;
    } else {
      home.drawn++;
      away.drawn++;
      home.points++;
      away.points++;
    }
  }

  for (const r of rows.values()) r.gd = r.gf - r.ga;

  return [...rows.values()].sort(
    (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name, 'tr'),
  );
}

export function computeLeaders(teams, matches, field) {
  const players = new Map();
  for (const t of teams) {
    for (const p of t.players || []) players.set(p.id, { name: p.name, teamName: t.name });
  }

  const counts = new Map();
  for (const m of matches) {
    if (m.status !== 'played') continue;
    for (const g of m.goals || []) {
      const id = g[field];
      if (!id || !players.has(id)) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([playerId, count]) => ({ playerId, count, ...players.get(playerId) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'tr'));
}

export function generateRoundRobin(teamIds) {
  const list = [...teamIds];
  if (list.length < 2) return [];
  if (list.length % 2) list.push(null);

  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a && b) pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop());
  }
  return rounds;
}
