import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreOf, computeStandings, computeLeaders, generateRoundRobin } from '../js/stats.js';

const teams = [
  { id: 'a', name: 'Aslanlar', players: [{ id: 'p1', name: 'Ali' }, { id: 'p2', name: 'Can' }] },
  { id: 'b', name: 'Boğalar', players: [{ id: 'p3', name: 'Deniz' }] },
  { id: 'c', name: 'Ceylanlar', players: [] },
];

const goal = (teamId, scorerId = null, assistId = null) => ({ id: Math.random().toString(36), teamId, scorerId, assistId });

test('scoreOf counts goals per side', () => {
  const m = { homeTeamId: 'a', awayTeamId: 'b', goals: [goal('a'), goal('a'), goal('b')] };
  assert.deepEqual(scoreOf(m), { home: 2, away: 1 });
  assert.deepEqual(scoreOf({ homeTeamId: 'a', awayTeamId: 'b' }), { home: 0, away: 0 });
});

test('computeStandings awards 3/1/0 and ignores unplayed matches', () => {
  const matches = [
    { homeTeamId: 'a', awayTeamId: 'b', status: 'played', goals: [goal('a'), goal('a'), goal('b')] },
    { homeTeamId: 'b', awayTeamId: 'c', status: 'played', goals: [] },
    { homeTeamId: 'a', awayTeamId: 'c', status: 'scheduled', goals: [goal('c'), goal('c')] },
  ];
  const [first, second, third] = computeStandings(teams, matches);

  assert.equal(first.teamId, 'a');
  assert.deepEqual(
    { p: first.played, w: first.won, gf: first.gf, ga: first.ga, gd: first.gd, pts: first.points },
    { p: 1, w: 1, gf: 2, ga: 1, gd: 1, pts: 3 },
  );
  assert.equal(second.teamId, 'c');
  assert.equal(second.points, 1);
  assert.equal(third.teamId, 'b');
  assert.equal(third.points, 1);
  assert.equal(third.lost, 1);
});

test('computeStandings skips matches whose team was deleted', () => {
  const matches = [{ homeTeamId: 'a', awayTeamId: 'gone', status: 'played', goals: [goal('a')] }];
  const a = computeStandings(teams, matches).find((r) => r.teamId === 'a');
  assert.equal(a.played, 0);
});

test('computeLeaders ranks scorers and assisters from played matches', () => {
  const matches = [
    { homeTeamId: 'a', awayTeamId: 'b', status: 'played', goals: [goal('a', 'p1', 'p2'), goal('a', 'p1'), goal('b', 'p3')] },
    { homeTeamId: 'a', awayTeamId: 'b', status: 'scheduled', goals: [goal('a', 'p2')] },
    { homeTeamId: 'a', awayTeamId: 'c', status: 'played', goals: [goal('a', null, 'p2'), goal('a', 'deleted')] },
  ];

  const scorers = computeLeaders(teams, matches, 'scorerId');
  assert.deepEqual(
    scorers.map((s) => [s.name, s.count, s.teamName]),
    [['Ali', 2, 'Aslanlar'], ['Deniz', 1, 'Boğalar']],
  );

  const assists = computeLeaders(teams, matches, 'assistId');
  assert.deepEqual(assists.map((s) => [s.name, s.count]), [['Can', 2]]);
});

test('generateRoundRobin pairs every team exactly once', () => {
  for (const n of [2, 3, 4, 5, 6, 7]) {
    const ids = Array.from({ length: n }, (_, i) => `t${i}`);
    const rounds = generateRoundRobin(ids);
    const seen = new Set();
    for (const round of rounds) {
      const inRound = new Set();
      for (const [h, a] of round) {
        assert.notEqual(h, a);
        assert.ok(!inRound.has(h) && !inRound.has(a), 'team plays twice in one round');
        inRound.add(h);
        inRound.add(a);
        const key = [h, a].sort().join('-');
        assert.ok(!seen.has(key), `duplicate pairing ${key}`);
        seen.add(key);
      }
    }
    assert.equal(seen.size, (n * (n - 1)) / 2);
  }
  assert.deepEqual(generateRoundRobin(['solo']), []);
});
