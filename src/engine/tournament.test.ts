import { describe, expect, it } from 'vitest';
import type { Match, Player, Tournament, TournamentConfig } from './types';
import { defaultConfig } from './types';
import { Resolver } from './resolve';
import { relevantMatches } from './doubleKo';
import {
  allStandings,
  computeFinalRanking,
  createTournament,
  decidingMatch,
  finishTournament,
  generatePlan,
  groupOrigins,
  groupPhaseComplete,
  redraw,
  seedOf,
  standingsFor,
  standingsOptions,
  startKoPhase,
  tournamentComplete,
} from './tournament';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Spieler ${i + 1}`,
    seed: i + 1,
  }));
}

function config(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return { ...defaultConfig(), ...overrides };
}

const numberOf = (playerId: string) => Number(playerId.slice(1));

function setResult(tournament: Tournament, matchId: string, winner: 'a' | 'b', legs = 2): Tournament {
  const result = winner === 'a' ? { legsA: legs, legsB: 0 } : { legsA: 0, legsB: legs };
  return {
    ...tournament,
    matches: tournament.matches.map((m) => (m.id === matchId ? { ...m, result } : m)),
  };
}

/**
 * Spielt alle spielbereiten Partien aus. `pick` bestimmt den Sieger; ohne
 * Angabe gewinnt der Spieler mit der kleineren Nummer, damit der Ablauf
 * reproduzierbar bleibt.
 */
function playAll(
  tournament: Tournament,
  pick: (match: Match, a: string, b: string) => 'a' | 'b' = (_m, a, b) =>
    numberOf(a) < numberOf(b) ? 'a' : 'b',
): Tournament {
  let current = tournament;

  for (let guard = 0; guard < 500; guard++) {
    const resolver = new Resolver(current.matches);
    const visible = relevantMatches(current.matches, resolver);
    const next = visible.find((m) => resolver.status(m) === 'ready');
    if (!next) break;
    const [a, b] = resolver.playerIds(next);
    current = setResult(current, next.id, pick(next, a, b));
  }

  return current;
}

function playGroupPhase(tournament: Tournament): Tournament {
  const groupIds = new Set(tournament.matches.filter((m) => m.phase === 'group').map((m) => m.id));
  let current = tournament;
  for (const id of groupIds) {
    const match = current.matches.find((m) => m.id === id) as Match;
    const [a, b] = new Resolver(current.matches).playerIds(match);
    current = setResult(current, id, numberOf(a) < numberOf(b) ? 'a' : 'b');
  }
  return current;
}

/**
 * Dreier-Gruppe im Ringschluss: p1 schlägt p2, p2 schlägt p3, p3 schlägt p1 –
 * jeweils über ein einzelnes Leg mit erfassten Punkten. Punkte und Legs sind in
 * beiden Sportarten identisch, nur die Wertung unterscheidet sich.
 */
function circleTournament(sport: 'dart' | 'cornhole'): Tournament {
  const players = makePlayers(3);
  const pairings: Array<[string, string, number, number]> = [
    ['p1', 'p2', 21, 5],
    ['p2', 'p3', 21, 19],
    ['p3', 'p1', 21, 18],
  ];

  const matches: Match[] = pairings.map(([a, b, pointsA, pointsB], i) => ({
    id: `m${i + 1}`,
    phase: 'group',
    round: i + 1,
    indexInRound: 0,
    groupId: 'g1',
    label: `Gruppe A · Runde ${i + 1}`,
    roundLabel: `Runde ${i + 1}`,
    a: { kind: 'player', playerId: a },
    b: { kind: 'player', playerId: b },
    result: { legsA: 1, legsB: 0, pointsA, pointsB },
  }));

  return {
    id: 't-ring',
    createdAt: new Date(0).toISOString(),
    config: config({
      sport,
      participants: 3,
      groupCount: 1,
      groupSize: 3,
      groupFinal: false,
      cornhole: { legs: 1, targetPoints: 21 },
      dart: { game: '501', legs: { '301': 1, '501': 1, cricket: 1 } },
    }),
    players,
    seed: 1,
    groups: [{ id: 'g1', name: 'Gruppe A', playerIds: ['p1', 'p2', 'p3'] }],
    matches,
    stage: 'group',
  };
}

describe('Setzlistenzugriff', () => {
  it('liefert die Setzposition eines Spielers', () => {
    const lookup = seedOf(makePlayers(4));
    expect(lookup('p1')).toBe(1);
    expect(lookup('p4')).toBe(4);
  });

  it('setzt unbekannte Spieler ans Ende, statt die Sortierung zu sprengen', () => {
    expect(seedOf(makePlayers(4))('gibt-es-nicht')).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('Spielplan erzeugen', () => {
  it('teilt im Gruppenmodus jeden Spieler genau einer Gruppe zu', () => {
    const { groups, matches } = generatePlan(
      config({ participants: 16, groupCount: 4, groupSize: 4 }),
      makePlayers(16),
      42,
    );

    expect(groups).toHaveLength(4);
    const assigned = groups.flatMap((g) => g.playerIds);
    expect(assigned).toHaveLength(16);
    expect(new Set(assigned).size).toBe(16);
    // 4 Gruppen à 4 Spieler = 4 × 6 Partien.
    expect(matches.filter((m) => m.phase === 'group')).toHaveLength(24);
  });

  it('terminiert jedes Gruppenspiel mit Zeit und Feld', () => {
    const { matches } = generatePlan(
      config({ participants: 16, groupCount: 4, groupSize: 4, fields: 2 }),
      makePlayers(16),
      7,
    );

    for (const match of matches) {
      expect(match.scheduledAt, match.id).toBeDefined();
      expect(match.field, match.id).toBeDefined();
    }
  });

  it('baut im Single-KO ein Bracket ohne Gruppen, mit Spiel um Platz 3', () => {
    const { groups, matches } = generatePlan(
      config({ format: 'single_ko', participants: 8, thirdPlaceMatch: true }),
      makePlayers(8),
      3,
    );

    expect(groups).toEqual([]);
    expect(matches.filter((m) => m.phase === 'ko')).toHaveLength(7);
    expect(matches.filter((m) => m.phase === 'third')).toHaveLength(1);
  });

  it('lässt das Spiel um Platz 3 weg, wenn es abgewählt ist', () => {
    const { matches } = generatePlan(
      config({ format: 'single_ko', participants: 8, thirdPlaceMatch: false }),
      makePlayers(8),
      3,
    );
    expect(matches.some((m) => m.phase === 'third')).toBe(false);
  });

  it('füllt krumme Teilnehmerzahlen im Single-KO mit Freilosen auf', () => {
    const { matches } = generatePlan(
      config({ format: 'single_ko', participants: 13 }),
      makePlayers(13),
      5,
    );
    const firstRound = matches.filter((m) => m.phase === 'ko' && m.round === 1);
    expect(firstRound).toHaveLength(8);
    expect(firstRound.filter((m) => m.a.kind === 'bye' || m.b.kind === 'bye')).toHaveLength(3);
  });
});

describe('Neu auslosen', () => {
  const base = () =>
    createTournament(config({ participants: 16, groupCount: 4, groupSize: 4 }), makePlayers(16), 11);

  it('liefert mit demselben Seed wieder dieselbe Auslosung', () => {
    const again = redraw(base(), 11);
    expect(again.groups.map((g) => g.playerIds)).toEqual(base().groups.map((g) => g.playerIds));
  });

  it('ändert mit einem anderen Seed die Auslosung, behält aber alle Spieler', () => {
    const before = base();
    const after = redraw(before, 12);

    expect(after.seed).toBe(12);
    expect(after.groups.map((g) => g.playerIds)).not.toEqual(before.groups.map((g) => g.playerIds));
    expect(after.groups.flatMap((g) => g.playerIds).sort()).toEqual(
      before.groups.flatMap((g) => g.playerIds).sort(),
    );
  });

  it('verwirft bereits eingetragene Ergebnisse', () => {
    const played = playGroupPhase(base());
    expect(played.matches.every((m) => m.result)).toBe(true);

    const after = redraw(played, 12);
    expect(after.matches.some((m) => m.result)).toBe(false);
  });
});

describe('Wertungsoptionen je Sportart', () => {
  it('wertet die Punkte nur beim Cornhole mit', () => {
    expect(standingsOptions(config({ sport: 'cornhole' }))).toEqual({ usePoints: true });
    expect(standingsOptions(config({ sport: 'dart' }))).toEqual({ usePoints: false });
  });

  it('lässt beim Cornhole die Punktdifferenz vor dem direkten Vergleich entscheiden', () => {
    // Dreier-Ringschluss: jeder gewinnt einmal, alle haben 2 Punkte und die
    // Leg-Differenz 0. Beim Cornhole trennt sie erst die Punktdifferenz.
    const rows = standingsFor(circleTournament('cornhole'), 'g1');

    expect(rows.every((r) => r.played === 2)).toBe(true);
    expect(rows.map((r) => r.points)).toEqual([2, 2, 2]);
    expect(rows.map((r) => r.legDiff)).toEqual([0, 0, 0]);
    expect(rows.map((r) => r.pointsDiff)).toEqual([13, 1, -14]);
    expect(rows.map((r) => r.playerId)).toEqual(['p1', 'p3', 'p2']);
  });

  it('ignoriert dieselben Punkte beim Dart und entscheidet über den Losentscheid', () => {
    const rows = standingsFor(circleTournament('dart'), 'g1');

    expect(rows.every((r) => r.played === 2)).toBe(true);
    // Direkter Vergleich bleibt im Ringschluss gleich, gewonnene Legs auch –
    // deshalb entscheidet die Setzliste.
    expect(rows.map((r) => r.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(rows.every((r) => r.tiebreak === 'Losentscheid')).toBe(true);
  });
});

describe('Gruppentabelle eines Turniers', () => {
  const tournament = () =>
    playGroupPhase(
      createTournament(
        config({ participants: 16, groupCount: 4, groupSize: 4 }),
        makePlayers(16),
        23,
      ),
    );

  it('liefert für eine unbekannte Gruppe eine leere Tabelle', () => {
    expect(standingsFor(tournament(), 'gibt-es-nicht')).toEqual([]);
  });

  it('sortiert die Gruppe nach den tatsächlich gespielten Ergebnissen', () => {
    const played = tournament();
    const group = played.groups[0];
    const rows = standingsFor(played, group.id);

    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.played === 3)).toBe(true);
    // Der Spieler mit der kleineren Nummer gewinnt immer – die Tabelle muss
    // deshalb genau dieser Reihenfolge folgen.
    expect(rows.map((r) => r.playerId)).toEqual([...group.playerIds].sort((a, b) => numberOf(a) - numberOf(b)));
    expect(rows.map((r) => r.points)).toEqual([6, 4, 2, 0]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('führt alle Gruppen in einer Übersicht zusammen', () => {
    const played = tournament();
    const all = allStandings(played);
    expect(all.size).toBe(4);
    expect([...all.values()].flat()).toHaveLength(16);
  });
});

describe('Herkunft aus der Gruppenphase', () => {
  it('kürzt die Herkunft als Gruppenbuchstabe plus Platz ab', () => {
    const played = playGroupPhase(
      createTournament(config({ participants: 8, groupCount: 2, groupSize: 4 }), makePlayers(8), 9),
    );
    const origins = groupOrigins(played);
    const groupA = played.groups[0];
    const best = [...groupA.playerIds].sort((a, b) => numberOf(a) - numberOf(b))[0];

    expect(origins.size).toBe(8);
    expect(origins.get(best)).toEqual({ groupName: 'Gruppe A', short: 'A1', rank: 1 });
  });

  it('bleibt ohne Gruppenphase leer', () => {
    const ko = createTournament(config({ format: 'single_ko', participants: 8 }), makePlayers(8), 2);
    expect(groupOrigins(ko).size).toBe(0);
  });
});

describe('Fortschritt der Gruppenphase', () => {
  const tournament = createTournament(
    config({ participants: 8, groupCount: 2, groupSize: 4 }),
    makePlayers(8),
    13,
  );

  it('ist erst mit dem letzten Gruppenspiel abgeschlossen', () => {
    expect(groupPhaseComplete(tournament)).toBe(false);

    const open = tournament.matches.filter((m) => m.phase === 'group');
    const almost = playGroupPhase(tournament);
    const missingOne = {
      ...almost,
      matches: almost.matches.map((m) => (m.id === open[0].id ? { ...m, result: undefined } : m)),
    };
    expect(groupPhaseComplete(missingOne)).toBe(false);
    expect(groupPhaseComplete(almost)).toBe(true);
  });

  it('gilt ohne Gruppenspiele nicht als abgeschlossen', () => {
    const ko = createTournament(config({ format: 'single_ko', participants: 8 }), makePlayers(8), 1);
    expect(groupPhaseComplete(ko)).toBe(false);
  });
});

describe('Das entscheidende Spiel', () => {
  it('ist im Single-KO das Finale, nicht das Spiel um Platz 3', () => {
    const tournament = createTournament(
      config({ format: 'single_ko', participants: 8, thirdPlaceMatch: true }),
      makePlayers(8),
      6,
    );
    const deciding = decidingMatch(tournament);

    expect(deciding?.phase).toBe('ko');
    expect(deciding?.roundLabel).toBe('Finale');
  });

  it('ist im Doppel-KO das Grand Final', () => {
    const tournament = createTournament(
      config({ format: 'double_ko', participants: 4 }),
      makePlayers(4),
      6,
    );
    expect(decidingMatch(tournament)?.phase).toBe('gf');
  });

  it('wird zum Rückspiel, sobald der Sieger der Siegerrunde das Grand Final verliert', () => {
    const tournament = createTournament(
      config({ format: 'double_ko', participants: 4 }),
      makePlayers(4),
      6,
    );
    // Im Grand Final gewinnt der Finalist aus der Verliererrunde – erst damit
    // haben beide genau eine Niederlage und das Rückspiel wird gebraucht.
    const played = playAll(tournament, (match, a, b) =>
      match.phase === 'gf' ? 'b' : numberOf(a) < numberOf(b) ? 'a' : 'b',
    );

    expect(played.matches.find((m) => m.phase === 'gf')?.result).toBeDefined();
    expect(decidingMatch(played)?.phase).toBe('gf_reset');
  });

  it('gibt es ohne KO-Spiele nicht', () => {
    const tournament = createTournament(
      config({ participants: 6, groupCount: 1, groupSize: 6, groupFinal: false }),
      makePlayers(6),
      8,
    );
    expect(decidingMatch(tournament)).toBeUndefined();
  });
});

describe('Turnierende', () => {
  const eightPlayerKo = () =>
    createTournament(
      config({ format: 'single_ko', participants: 8, thirdPlaceMatch: true }),
      makePlayers(8),
      6,
    );

  it('ist erst erreicht, wenn auch das Spiel um Platz 3 gespielt ist', () => {
    const tournament = eightPlayerKo();
    const withoutThird = playAll(tournament, (match, a, b) => {
      if (match.phase === 'third') return 'a';
      return numberOf(a) < numberOf(b) ? 'a' : 'b';
    });
    const thirdId = withoutThird.matches.find((m) => m.phase === 'third')?.id as string;
    const open = {
      ...withoutThird,
      matches: withoutThird.matches.map((m) => (m.id === thirdId ? { ...m, result: undefined } : m)),
    };

    expect(tournamentComplete(open)).toBe(false);
    expect(tournamentComplete(withoutThird)).toBe(true);
  });

  it('ist im Doppel-KO erst mit dem nötigen Rückspiel erreicht', () => {
    const tournament = createTournament(
      config({ format: 'double_ko', participants: 4 }),
      makePlayers(4),
      6,
    );
    const played = playAll(tournament, (match, a, b) =>
      match.phase === 'gf' ? 'b' : numberOf(a) < numberOf(b) ? 'a' : 'b',
    );
    const withoutReset = {
      ...played,
      matches: played.matches.map((m) => (m.phase === 'gf_reset' ? { ...m, result: undefined } : m)),
    };

    expect(tournamentComplete(withoutReset)).toBe(false);
    expect(tournamentComplete(played)).toBe(true);
  });
});

describe('Endplatzierung', () => {
  it('vergibt im Single-KO jeden Rang genau einmal bis zur gemeinsamen Runde', () => {
    const played = playAll(
      createTournament(
        config({ format: 'single_ko', participants: 8, thirdPlaceMatch: true }),
        makePlayers(8),
        6,
      ),
    );
    const ranking = computeFinalRanking(played);

    expect(ranking).toHaveLength(8);
    // 1.–4. einzeln, die vier Viertelfinalverlierer teilen sich Rang 5.
    expect(ranking.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 5, 5, 5]);
    expect(ranking[0].playerId).toBe('p1');
    expect(ranking[1].playerId).toBe('p2');
  });

  it('vergibt ohne Spiel um Platz 3 den dritten Rang an beide Halbfinalverlierer', () => {
    const played = playAll(
      createTournament(
        config({ format: 'single_ko', participants: 8, thirdPlaceMatch: false }),
        makePlayers(8),
        6,
      ),
    );
    expect(computeFinalRanking(played).map((r) => r.rank)).toEqual([1, 2, 3, 3, 5, 5, 5, 5]);
  });

  it('platziert auch die Spieler, die die KO-Phase verpasst haben', () => {
    const tournament = playGroupPhase(
      createTournament(
        config({ participants: 16, groupCount: 4, groupSize: 4 }),
        makePlayers(16),
        23,
      ),
    );
    const played = playAll(startKoPhase(tournament));
    const ranking = computeFinalRanking(played);

    expect(ranking).toHaveLength(16);
    expect(new Set(ranking.map((r) => r.playerId)).size).toBe(16);
    // Gruppendritte und -vierte kommen nicht in die KO-Runde und teilen sich
    // je einen Rang hinter den acht Qualifizierten.
    expect(ranking.filter((r) => r.rank === 9)).toHaveLength(4);
    expect(ranking.filter((r) => r.rank === 13)).toHaveLength(4);
  });

  it('lässt im Doppel-KO den Verlierer des Verliererrunden-Finales Dritter werden', () => {
    const played = playAll(
      createTournament(config({ format: 'double_ko', participants: 8 }), makePlayers(8), 6),
    );
    const ranking = computeFinalRanking(played);
    const lbFinal = played.matches
      .filter((m) => m.phase === 'lb')
      .reduce((best, m) => (m.round > best.round ? m : best));
    const loser = new Resolver(played.matches).loser(lbFinal.id);

    expect(ranking).toHaveLength(8);
    expect(loser.kind).toBe('player');
    if (loser.kind === 'player') {
      expect(ranking.find((r) => r.playerId === loser.playerId)?.rank).toBe(3);
    }
  });
});

describe('Turnier abschließen', () => {
  it('friert Stand, Zeitpunkt und Endplatzierung ein', () => {
    const played = playAll(
      createTournament(config({ format: 'single_ko', participants: 8 }), makePlayers(8), 6),
    );
    const finished = finishTournament(played);

    expect(finished.stage).toBe('finished');
    expect(finished.finishedAt).toBeDefined();
    expect(Number.isNaN(Date.parse(finished.finishedAt as string))).toBe(false);
    expect(finished.finalRanking).toHaveLength(8);
    expect(finished.finalRanking?.[0]).toEqual({ playerId: 'p1', rank: 1 });
    // Die Spiele bleiben unangetastet.
    expect(finished.matches).toEqual(played.matches);
  });
});
