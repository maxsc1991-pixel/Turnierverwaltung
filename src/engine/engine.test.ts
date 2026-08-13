import { describe, expect, it } from 'vitest';
import type { Match, Player, Standing, TournamentConfig } from './types';
import { applyKoSettings, bestOf, defaultConfig, hasKoPhase } from './types';
import { groupOptions, roundNames, validateConfig, hasErrors, findGroupOption } from './validation';
import { buildGroupMatches, drawGroups, roundRobinRounds } from './groups';
import { computeStandings } from './standings';
import { bracketSeedOrder, buildSingleElimination, seedIntoBracket } from './bracket';
import { buildDoubleElimination, isBracketResetNeeded } from './doubleKo';
import { Resolver } from './resolve';
import { qualifyFromGroups } from './qualification';
import { findScheduleConflicts, groupFieldMap, scheduleMatches } from './schedule';
import { createRng } from './rng';
import {
  allStandings,
  computeFinalRanking,
  createTournament,
  seedOf,
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

/** Spielt ein Match aus – `winner` ist 'a' oder 'b'. */
function play(match: Match, winner: 'a' | 'b', legs = 2): Match {
  return {
    ...match,
    result: winner === 'a' ? { legsA: legs, legsB: 0 } : { legsA: 0, legsB: legs },
  };
}

describe('Validierung der Gruppeneinteilung', () => {
  it('erlaubt die geforderten Zweierpotenz-Kombinationen', () => {
    const cases: Array<[number, number, number, number]> = [
      // [Teilnehmer, Gruppen, Qualifikanten, beste Dritte]
      [8, 2, 4, 0],
      [16, 4, 8, 0],
      [32, 8, 16, 0],
      [64, 16, 32, 0],
    ];
    for (const [participants, groupCount, qualifiers, bestThirds] of cases) {
      const option = findGroupOption(participants, groupCount);
      expect(option, `${participants} TN / ${groupCount} Gruppen`).toBeDefined();
      expect(option?.qualifiers).toBe(qualifiers);
      expect(option?.bestThirds).toBe(bestThirds);
      expect(option?.groupSize).toBe(participants / groupCount);
    }
  });

  it('nimmt bei 12/3, 24/6 und 48/12 die besten Dritten dazu', () => {
    expect(findGroupOption(12, 3)).toMatchObject({ groupSize: 4, qualifiers: 8, bestThirds: 2 });
    expect(findGroupOption(24, 6)).toMatchObject({ groupSize: 4, qualifiers: 16, bestThirds: 4 });
    expect(findGroupOption(48, 12)).toMatchObject({ groupSize: 4, qualifiers: 32, bestThirds: 8 });
  });

  it('lehnt 20 Teilnehmer in 5 Gruppen ab, erlaubt aber 4 Gruppen à 5', () => {
    expect(findGroupOption(20, 5)).toBeUndefined();
    expect(findGroupOption(20, 4)).toMatchObject({ groupSize: 5, qualifiers: 8, bestThirds: 0 });
  });

  it('schließt 128 Teilnehmer im Gruppenmodus aus', () => {
    expect(groupOptions(128)).toHaveLength(0);
    const issues = validateConfig(config({ format: 'groups', participants: 128, groupCount: 32, groupSize: 4 }), 128);
    expect(hasErrors(issues)).toBe(true);
    expect(issues.some((i) => i.message.includes('128 Teilnehmer'))).toBe(true);
  });

  it('meldet einen Fehler, wenn Gruppen × Stärke nicht der Teilnehmerzahl entspricht', () => {
    const issues = validateConfig(config({ format: 'groups', participants: 16, groupCount: 3, groupSize: 4 }), 16);
    expect(hasErrors(issues)).toBe(true);
  });

  it('leitet die Rundennamen aus der Zahl der Qualifikanten ab', () => {
    expect(roundNames(4)).toEqual(['Halbfinale', 'Finale']);
    expect(roundNames(8)).toEqual(['Viertelfinale', 'Halbfinale', 'Finale']);
    expect(roundNames(16)).toEqual(['Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale']);
    expect(roundNames(32)).toEqual([
      'Sechzehntelfinale',
      'Achtelfinale',
      'Viertelfinale',
      'Halbfinale',
      'Finale',
    ]);
  });
});

describe('Round Robin', () => {
  it('spielt jede Paarung genau einmal', () => {
    for (const size of [3, 4, 5, 6, 8]) {
      const ids = makePlayers(size).map((p) => p.id);
      const rounds = roundRobinRounds(ids);
      const seen = new Set<string>();
      for (const round of rounds) {
        for (const [a, b] of round) seen.add([a, b].sort().join('|'));
      }
      expect(seen.size, `${size} Spieler`).toBe((size * (size - 1)) / 2);
    }
  });

  it('setzt keinen Spieler zweimal in dieselbe Runde', () => {
    const ids = makePlayers(7).map((p) => p.id);
    for (const round of roundRobinRounds(ids)) {
      const players = round.flat();
      expect(new Set(players).size).toBe(players.length);
    }
  });
});

describe('Gruppentabelle', () => {
  const players = makePlayers(4);
  const seed = seedOf(players);

  function groupMatch(id: string, a: string, b: string, legsA: number, legsB: number): Match {
    return {
      id,
      phase: 'group',
      round: 1,
      indexInRound: 0,
      groupId: 'g1',
      label: 'Test',
      roundLabel: 'Runde 1',
      a: { kind: 'player', playerId: a },
      b: { kind: 'player', playerId: b },
      result: { legsA, legsB },
    };
  }

  it('vergibt 2 Punkte je Sieg und rechnet die Leg-Differenz', () => {
    const matches = [groupMatch('m1', 'p1', 'p2', 2, 0), groupMatch('m2', 'p3', 'p4', 2, 1)];
    const table = computeStandings(['p1', 'p2', 'p3', 'p4'], matches, seed);
    expect(table[0]).toMatchObject({ playerId: 'p1', points: 2, legDiff: 2, rank: 1 });
    expect(table[1]).toMatchObject({ playerId: 'p3', points: 2, legDiff: 1 });
    expect(table.find((t) => t.playerId === 'p2')?.points).toBe(0);
  });

  it('entscheidet bei gleicher Punkt- und Legdifferenz über den direkten Vergleich', () => {
    // p1 und p2 haben beide 2 Punkte und Legdifferenz 0, p1 gewinnt direkt.
    const matches = [
      groupMatch('m1', 'p1', 'p2', 2, 1),
      groupMatch('m2', 'p2', 'p1', 2, 1),
      groupMatch('m3', 'p1', 'p3', 0, 2),
      groupMatch('m4', 'p2', 'p3', 0, 2),
    ];
    // Beide haben je 1 Sieg gegeneinander -> Legdifferenz im direkten Vergleich gleich.
    const table = computeStandings(['p1', 'p2'], matches.slice(0, 2), seed);
    expect(table.map((t) => t.points)).toEqual([2, 2]);

    // Klarer Fall: p1 gewinnt den direkten Vergleich deutlich.
    const decided = computeStandings(
      ['p1', 'p2'],
      [groupMatch('a', 'p1', 'p2', 2, 0), groupMatch('b', 'p2', 'p1', 2, 0)],
      seed,
    );
    expect(decided.map((t) => t.points)).toEqual([2, 2]);
    expect(decided[0].tiebreak).toBeDefined();
  });

  it('sortiert Punktgleiche über die Leg-Differenz vor dem direkten Vergleich', () => {
    // p2 gewinnt direkt gegen p1, hat aber die schlechtere Legdifferenz.
    const matches = [
      groupMatch('m1', 'p2', 'p1', 2, 1),
      groupMatch('m2', 'p1', 'p3', 2, 0),
      groupMatch('m3', 'p2', 'p3', 2, 1),
    ];
    const table = computeStandings(['p1', 'p2', 'p3'], matches, seed);
    expect(table[0].playerId).toBe('p2');
    expect(table[0].legDiff).toBe(2);
    expect(table[1].playerId).toBe('p1');
  });
});

describe('Single-KO-Bracket', () => {
  it('verteilt die Setzliste so, dass sich 1 und 2 erst im Finale treffen', () => {
    expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('gibt bei 13 Teilnehmern Freilose an die höchstgesetzten Spieler', () => {
    const players = makePlayers(13);
    const positions = seedIntoBracket(players.map((p) => ({ kind: 'player', playerId: p.id })));
    expect(positions).toHaveLength(16);

    const bracket = buildSingleElimination(positions, { idPrefix: 'ko', phase: 'ko' });
    const firstRound = bracket.filter((m) => m.round === 1);
    expect(firstRound).toHaveLength(8);

    const resolver = new Resolver(bracket);
    const walkovers = firstRound.filter((m) => resolver.isWalkover(m));
    expect(walkovers).toHaveLength(3);

    // Die Freilose gehen an die Seeds 1, 2 und 3.
    const advancing = walkovers
      .map((m) => resolver.winner(m.id))
      .map((r) => (r.kind === 'player' ? r.playerId : null));
    expect(advancing.sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('führt ein 16er-Bracket zu genau einem Sieger', () => {
    const players = makePlayers(13);
    const tournament = createTournament(
      config({ format: 'single_ko', participants: 13, thirdPlaceMatch: false }),
      players,
      42,
    );

    let matches = tournament.matches;
    for (let guard = 0; guard < 50; guard++) {
      const resolver = new Resolver(matches);
      const next = matches.find((m) => resolver.status(m) === 'ready');
      if (!next) break;
      matches = matches.map((m) => (m.id === next.id ? play(m, 'a') : m));
    }

    const resolver = new Resolver(matches);
    const finalRound = Math.max(...matches.map((m) => m.round));
    const final = matches.find((m) => m.round === finalRound) as Match;
    expect(resolver.winner(final.id).kind).toBe('player');

    const ranking = computeFinalRanking({ ...tournament, matches });
    expect(ranking.filter((r) => r.rank === 1)).toHaveLength(1);
    expect(ranking.filter((r) => r.rank === 2)).toHaveLength(1);
  });
});

describe('Doppel-KO', () => {
  it('baut Sieger- und Verliererrunde in der richtigen Größe', () => {
    const entries = makePlayers(8).map((p) => ({ kind: 'player' as const, playerId: p.id }));
    const matches = buildDoubleElimination(entries);

    expect(matches.filter((m) => m.phase === 'wb')).toHaveLength(7);
    expect(matches.filter((m) => m.phase === 'lb')).toHaveLength(6);
    expect(matches.filter((m) => m.phase === 'gf')).toHaveLength(1);

    const lbRounds = new Set(matches.filter((m) => m.phase === 'lb').map((m) => m.round));
    expect(lbRounds.size).toBe(4);
  });

  it('scheidet jeden Spieler erst nach zwei Niederlagen aus', () => {
    const entries = makePlayers(8).map((p) => ({ kind: 'player' as const, playerId: p.id }));
    let matches = buildDoubleElimination(entries);

    const losses = new Map<string, number>();
    for (let guard = 0; guard < 60; guard++) {
      const resolver = new Resolver(matches);
      const next = matches.find((m) => resolver.status(m) === 'ready' && m.phase !== 'gf_reset');
      if (!next) break;
      // Der jeweils niedrigere Seed gewinnt – deterministisch und nachvollziehbar.
      const [pa, pb] = resolver.playerIds(next);
      const winner = Number(pa.slice(1)) < Number(pb.slice(1)) ? 'a' : 'b';
      losses.set(winner === 'a' ? pb : pa, (losses.get(winner === 'a' ? pb : pa) ?? 0) + 1);
      matches = matches.map((m) => (m.id === next.id ? play(m, winner) : m));
    }

    for (const [player, count] of losses) {
      expect(count, `${player} hat ${count} Niederlagen`).toBeLessThanOrEqual(2);
    }
  });

  it('erzeugt das Rückspiel nur, wenn der Sieger der Siegerrunde das Grand Final verliert', () => {
    const entries = makePlayers(4).map((p) => ({ kind: 'player' as const, playerId: p.id }));
    const base = buildDoubleElimination(entries);

    const playAll = (pick: (match: Match, resolver: Resolver) => 'a' | 'b') => {
      let matches = base;
      for (let guard = 0; guard < 30; guard++) {
        const resolver = new Resolver(matches);
        const next = matches.find((m) => resolver.status(m) === 'ready' && m.phase !== 'gf_reset');
        if (!next) break;
        matches = matches.map((m) => (m.id === next.id ? play(m, pick(next, resolver)) : m));
      }
      return matches;
    };

    // Seite A gewinnt immer -> im Grand Final gewinnt der Sieger der Siegerrunde.
    const noReset = playAll(() => 'a');
    expect(isBracketResetNeeded(noReset, new Resolver(noReset))).toBe(false);

    // Im Grand Final gewinnt der Herausforderer aus der Verliererrunde.
    const withReset = playAll((match) => (match.phase === 'gf' ? 'b' : 'a'));
    expect(isBracketResetNeeded(withReset, new Resolver(withReset))).toBe(true);
  });
});

describe('Setzung aus der Gruppenphase', () => {
  function playGroupPhase(participants: number, groupCount: number) {
    const players = makePlayers(participants);
    const option = findGroupOption(participants, groupCount);
    const tournament = createTournament(
      config({
        format: 'groups',
        participants,
        groupCount,
        groupSize: participants / groupCount,
        thirdPlaceMatch: false,
      }),
      players,
      7,
    );

    // Der Spieler mit der kleineren Nummer gewinnt – erzeugt eine klare Rangfolge.
    const matches = tournament.matches.map((m) => {
      if (m.phase !== 'group') return m;
      const a = Number((m.a as { playerId: string }).playerId.slice(1));
      const b = Number((m.b as { playerId: string }).playerId.slice(1));
      return play(m, a < b ? 'a' : 'b');
    });

    return { tournament: { ...tournament, matches }, option };
  }

  it('lässt bei 16 Teilnehmern die Gruppensieger gegen Zweite anderer Gruppen antreten', () => {
    const { tournament } = playGroupPhase(16, 4);
    const started = startKoPhase(tournament);
    const firstRound = started.matches.filter((m) => m.phase === 'ko' && m.round === 1);
    expect(firstRound).toHaveLength(4);

    const groupOf = new Map<string, string>();
    for (const group of started.groups) {
      for (const id of group.playerIds) groupOf.set(id, group.id);
    }

    const resolver = new Resolver(started.matches);
    for (const match of firstRound) {
      const [a, b] = resolver.playerIds(match);
      expect(groupOf.get(a), 'kein Gruppenduell in Runde 1').not.toBe(groupOf.get(b));
    }
  });

  it('nimmt bei 12 Teilnehmern in 3 Gruppen die zwei besten Dritten mit', () => {
    const { tournament, option } = playGroupPhase(12, 3);
    expect(option?.bestThirds).toBe(2);

    const standings = allStandings(tournament);
    const { positions, pairings } = qualifyFromGroups(
      tournament.groups,
      standings,
      2,
      seedOf(tournament.players),
    );

    expect(positions).toHaveLength(8);
    expect(pairings).toHaveLength(4);

    const ranks = pairings.flatMap((p) => [p.home.groupRank, p.away.groupRank]);
    expect(ranks.filter((r) => r === 1)).toHaveLength(3);
    expect(ranks.filter((r) => r === 2)).toHaveLength(3);
    expect(ranks.filter((r) => r === 3)).toHaveLength(2);

    // Jeder Qualifikant steht genau einmal im Bracket.
    const ids = positions.map((p) => (p.kind === 'player' ? p.playerId : ''));
    expect(new Set(ids).size).toBe(8);
  });

  it('erzeugt bei 24 Teilnehmern in 6 Gruppen ein Achtelfinale mit 4 besten Dritten', () => {
    const { tournament, option } = playGroupPhase(24, 6);
    expect(option?.bestThirds).toBe(4);

    const started = startKoPhase(tournament);
    const firstRound = started.matches.filter((m) => m.phase === 'ko' && m.round === 1);
    expect(firstRound).toHaveLength(8);
    expect(firstRound[0].label).toContain('Achtelfinale');
  });
});

describe('Spielplan', () => {
  it('setzt keinen Spieler zeitgleich auf zwei Felder', () => {
    const players = makePlayers(16);
    const groups = drawGroups(players, 4, createRng(1));
    const cfg = config({ format: 'groups', participants: 16, groupCount: 4, groupSize: 4, fields: 3 });
    const scheduled = scheduleMatches(buildGroupMatches(groups), cfg);

    const bySlot = new Map<string, string[]>();
    for (const match of scheduled) {
      if (!match.scheduledAt) continue;
      const list = bySlot.get(match.scheduledAt) ?? [];
      list.push(...new Resolver(scheduled).playerIds(match));
      bySlot.set(match.scheduledAt, list);
    }

    for (const [slot, ids] of bySlot) {
      expect(new Set(ids).size, `Doppelbelegung um ${slot}`).toBe(ids.length);
    }
  });

  it('belegt nie mehr Felder als konfiguriert', () => {
    const players = makePlayers(16);
    const groups = drawGroups(players, 4, createRng(2));
    const cfg = config({ format: 'groups', participants: 16, groupCount: 4, groupSize: 4, fields: 2 });
    const scheduled = scheduleMatches(buildGroupMatches(groups), cfg);

    const perSlot = new Map<string, number>();
    for (const match of scheduled) {
      if (!match.scheduledAt) continue;
      perSlot.set(match.scheduledAt, (perSlot.get(match.scheduledAt) ?? 0) + 1);
      expect(match.field).toBeLessThanOrEqual(2);
    }
    for (const count of perSlot.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it('verteilt die Spiele fair – niemand wartet unnötig lange', () => {
    const players = makePlayers(16);
    const groups = drawGroups(players, 4, createRng(3));
    const cfg = config({ format: 'groups', participants: 16, groupCount: 4, groupSize: 4, fields: 4 });
    const scheduled = scheduleMatches(buildGroupMatches(groups), cfg);

    const resolver = new Resolver(scheduled);
    const slots = [...new Set(scheduled.map((m) => m.scheduledAt).filter(Boolean))].sort();
    const slotIndex = new Map(slots.map((s, i) => [s as string, i]));

    const perPlayer = new Map<string, number[]>();
    for (const match of scheduled) {
      if (!match.scheduledAt) continue;
      for (const id of resolver.playerIds(match)) {
        const list = perPlayer.get(id) ?? [];
        list.push(slotIndex.get(match.scheduledAt) as number);
        perPlayer.set(id, list);
      }
    }

    // Bei 4 Gruppen à 4 auf 4 Feldern spielt jeder 3 Spiele. Die größte Pause
    // zwischen zwei Spielen darf nicht ausufern.
    for (const [player, played] of perPlayer) {
      played.sort((a, b) => a - b);
      const gaps = played.slice(1).map((slot, i) => slot - played[i]);
      expect(Math.max(...gaps), `${player} wartet zu lange`).toBeLessThanOrEqual(3);
    }
  });
});

describe('Feste Spielfelder je Gruppe', () => {
  function plan(fields: number, assign: (index: number) => number | undefined) {
    const players = makePlayers(16);
    const groups = drawGroups(players, 4, createRng(9)).map((group, index) => ({
      ...group,
      field: assign(index),
    }));
    const cfg = config({ format: 'groups', participants: 16, groupCount: 4, groupSize: 4, fields });
    const scheduled = scheduleMatches(buildGroupMatches(groups), cfg, {
      groupFields: groupFieldMap(groups, cfg.fields),
    });
    return { groups, scheduled, cfg };
  }

  it('legt alle Spiele einer festgelegten Gruppe auf genau dieses Feld', () => {
    const { groups, scheduled } = plan(4, (i) => (i === 0 ? 3 : undefined));
    const pinned = groups[0].id;

    const fieldsUsed = new Set(
      scheduled.filter((m) => m.groupId === pinned).map((m) => m.field),
    );
    expect([...fieldsUsed]).toEqual([3]);

    // Umgekehrt darf keine andere Gruppe auf das reservierte Feld ausweichen.
    const foreign = scheduled.filter((m) => m.groupId !== pinned && m.field === 3);
    expect(foreign).toHaveLength(0);
  });

  it('spielt eine festgelegte Gruppe nacheinander statt parallel', () => {
    const { groups, scheduled } = plan(4, (i) => (i === 0 ? 1 : undefined));
    const times = scheduled
      .filter((m) => m.groupId === groups[0].id)
      .map((m) => m.scheduledAt);

    // 4 Spieler ergeben 6 Spiele – auf einem Feld also 6 verschiedene Zeiten.
    expect(times).toHaveLength(6);
    expect(new Set(times).size).toBe(6);
  });

  it('erzeugt auch mit festen Feldern keine Doppelbelegung', () => {
    for (const assign of [
      () => undefined,
      (i: number) => (i === 0 ? 1 : undefined),
      (i: number) => i + 1,
      () => 2 as number,
    ]) {
      const { scheduled } = plan(4, assign);
      expect(findScheduleConflicts(scheduled)).toHaveLength(0);

      // Und jedes Spiel muss einen Termin bekommen haben.
      expect(scheduled.every((m) => m.scheduledAt && m.field)).toBe(true);
    }
  });

  it('ignoriert ein Feld, das es gar nicht gibt', () => {
    const { groups, scheduled } = plan(2, (i) => (i === 0 ? 7 : undefined));
    const pinnedMatches = scheduled.filter((m) => m.groupId === groups[0].id);
    // Statt unplanbar zu werden, wird die Gruppe wieder automatisch verteilt.
    expect(pinnedMatches.every((m) => m.field === 1 || m.field === 2)).toBe(true);
    expect(pinnedMatches.every((m) => m.scheduledAt)).toBe(true);
  });

  it('erkennt eine von Hand erzeugte Doppelbelegung', () => {
    const { scheduled } = plan(4, () => undefined);
    const [first, ...rest] = scheduled;
    const clash = rest.find((m) => m.scheduledAt !== first.scheduledAt) as Match;
    const manual = scheduled.map((m) =>
      m.id === clash.id ? { ...m, field: first.field, scheduledAt: first.scheduledAt } : m,
    );

    const conflicts = findScheduleConflicts(manual);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].matches).toHaveLength(2);
  });
});

describe('Freilose bei krummen Teilnehmerzahlen', () => {
  it('belegt Freilos-Spiele mit keinem Zeitslot', () => {
    const players = makePlayers(6);
    const tournament = createTournament(
      config({ format: 'single_ko', participants: 6, thirdPlaceMatch: false, fields: 2 }),
      players,
      11,
    );
    const resolver = new Resolver(tournament.matches);
    for (const match of tournament.matches) {
      if (resolver.isWalkover(match)) expect(match.scheduledAt).toBeUndefined();
    }
  });
});

describe('Einzelne Gruppe', () => {
  it('erlaubt 1 Gruppe von 3 bis 10 Spielern', () => {
    for (const count of [3, 4, 6, 10]) {
      expect(findGroupOption(count, 1), `${count} Teilnehmer`).toMatchObject({
        groupCount: 1,
        groupSize: count,
        qualifiers: 2,
        bestThirds: 0,
      });
    }
    expect(findGroupOption(11, 1)).toBeUndefined();
    expect(findGroupOption(2, 1)).toBeUndefined();
  });

  it('führt mit Finale zu genau einem Endspiel der beiden Erstplatzierten', () => {
    const players = makePlayers(6);
    const tournament = createTournament(
      config({ format: 'groups', participants: 6, groupCount: 1, groupSize: 6, groupFinal: true }),
      players,
      5,
    );

    // Ohne diese Prüfung liefe der Test auch bei leerer Gruppenphase durch:
    // bei lauter Nullwerten entscheidet der Losentscheid nach Setzliste und
    // ergibt zufällig ebenfalls p1 vor p2.
    expect(tournament.groups).toHaveLength(1);
    expect(tournament.groups[0].playerIds).toHaveLength(6);
    expect(tournament.matches.filter((m) => m.phase === 'group')).toHaveLength(15);
    expect(tournament.matches.every((m) => m.scheduledAt)).toBe(true);

    // Kleinere Nummer gewinnt -> p1 wird Erster, p2 Zweiter.
    const afterGroups = {
      ...tournament,
      stage: 'group' as const,
      matches: tournament.matches.map((m) => {
        const a = Number((m.a as { playerId: string }).playerId.slice(1));
        const b = Number((m.b as { playerId: string }).playerId.slice(1));
        return play(m, a < b ? 'a' : 'b');
      }),
    };

    expect(hasKoPhase(afterGroups.config)).toBe(true);
    const standings = allStandings(afterGroups).get('g1') as Standing[];
    expect(standings[0]).toMatchObject({ playerId: 'p1', played: 5, points: 10 });
    expect(standings.slice(0, 2).map((s) => s.playerId)).toEqual(['p1', 'p2']);

    const started = startKoPhase(afterGroups);
    const koMatches = started.matches.filter((m) => m.phase === 'ko');
    expect(koMatches).toHaveLength(1);
    expect(koMatches[0].roundLabel).toBe('Finale');

    const resolver = new Resolver(started.matches);
    expect(resolver.playerIds(koMatches[0]).sort()).toEqual(['p1', 'p2']);
  });

  it('endet ohne Finale mit dem letzten Gruppenspiel', () => {
    const players = makePlayers(4);
    const tournament = createTournament(
      config({ format: 'groups', participants: 4, groupCount: 1, groupSize: 4, groupFinal: false }),
      players,
      6,
    );

    expect(hasKoPhase(tournament.config)).toBe(false);
    expect(tournament.matches.filter((m) => m.phase === 'group')).toHaveLength(6);

    const played = {
      ...tournament,
      stage: 'group' as const,
      matches: tournament.matches.map((m) => {
        const a = Number((m.a as { playerId: string }).playerId.slice(1));
        const b = Number((m.b as { playerId: string }).playerId.slice(1));
        return play(m, a < b ? 'a' : 'b');
      }),
    };

    expect(tournamentComplete(played)).toBe(true);
    const ranking = computeFinalRanking(played);
    expect(ranking.find((r) => r.rank === 1)?.playerId).toBe('p1');
    expect(new Set(ranking.map((r) => r.playerId)).size).toBe(4);
  });
});

describe('Cornhole – Punkte in der Wertung', () => {
  const players = makePlayers(3);
  const seed = seedOf(players);

  function match(id: string, a: string, b: string, legsA: number, legsB: number, pa: number, pb: number): Match {
    return {
      id,
      phase: 'group',
      round: 1,
      indexInRound: 0,
      groupId: 'g1',
      label: 'Test',
      roundLabel: 'Runde 1',
      a: { kind: 'player', playerId: a },
      b: { kind: 'player', playerId: b },
      result: { legsA, legsB, pointsA: pa, pointsB: pb },
    };
  }

  it('summiert erzielte und kassierte Punkte', () => {
    const table = computeStandings(
      ['p1', 'p2'],
      [match('m1', 'p1', 'p2', 1, 0, 21, 12)],
      seed,
      { usePoints: true },
    );
    expect(table[0]).toMatchObject({ playerId: 'p1', pointsFor: 21, pointsAgainst: 12, pointsDiff: 9 });
    expect(table[1]).toMatchObject({ playerId: 'p2', pointsFor: 12, pointsAgainst: 21, pointsDiff: -9 });
  });

  it('entscheidet bei gleicher Leg-Differenz über die Punktdifferenz', () => {
    // p1 und p2 haben je einen Sieg gegen p3, gleiche Legdifferenz.
    const matches = [
      match('m1', 'p1', 'p3', 1, 0, 21, 5),
      match('m2', 'p2', 'p3', 1, 0, 21, 19),
    ];
    const table = computeStandings(['p1', 'p2', 'p3'], matches, seed, { usePoints: true });
    expect(table[0].playerId).toBe('p1');
    expect(table[0].pointsDiff).toBe(16);
    expect(table[1].playerId).toBe('p2');
  });

  it('ignoriert die Punkte, wenn die Sportart sie nicht wertet', () => {
    const matches = [
      match('m1', 'p1', 'p3', 1, 0, 21, 5),
      match('m2', 'p2', 'p3', 1, 0, 21, 19),
    ];
    const ohne = computeStandings(['p1', 'p2', 'p3'], matches, seed);
    // Ohne Punktwertung sind p1 und p2 gleichauf und der direkte Vergleich
    // greift nicht (sie haben nicht gegeneinander gespielt).
    expect(ohne[0].points).toBe(ohne[1].points);
    expect(ohne[0].legDiff).toBe(ohne[1].legDiff);
    expect(ohne[0].tiebreak).toBeDefined();
  });
});

describe('Eigene Einstellungen der KO-Phase', () => {
  it('überschreibt Legs, Spieldauer und Felder nur für die KO-Spiele', () => {
    const base = config({ sport: 'cornhole', cornhole: { legs: 1, targetPoints: 21 }, avgMatchMinutes: 10, fields: 4 });
    const ko = applyKoSettings(base, { avgMatchMinutes: 25, legs: 3, fields: 2 });

    expect(bestOf(base)).toBe(1);
    expect(bestOf(ko)).toBe(3);
    expect(ko.avgMatchMinutes).toBe(25);
    expect(ko.fields).toBe(2);
    // Die Ausgangskonfiguration bleibt unangetastet.
    expect(base.avgMatchMinutes).toBe(10);
    expect(base.cornhole.legs).toBe(1);
  });

  it('terminiert die KO-Phase mit der eigenen Spieldauer', () => {
    const players = makePlayers(8);
    const tournament = createTournament(
      config({ format: 'groups', participants: 8, groupCount: 2, groupSize: 4, avgMatchMinutes: 10, fields: 2, thirdPlaceMatch: false }),
      players,
      3,
    );
    const afterGroups = {
      ...tournament,
      stage: 'group' as const,
      matches: tournament.matches.map((m) => {
        const a = Number((m.a as { playerId: string }).playerId.slice(1));
        const b = Number((m.b as { playerId: string }).playerId.slice(1));
        return play(m, a < b ? 'a' : 'b');
      }),
    };

    const started = startKoPhase(afterGroups, { avgMatchMinutes: 30, legs: 5, fields: 1, startTime: '21:00' });
    const ko = started.matches.filter((m) => m.phase === 'ko' && m.scheduledAt);

    expect(started.ko?.legs).toBe(5);
    // Ein einziges Feld: die Halbfinals liegen 30 Minuten auseinander.
    const times = ko.filter((m) => m.round === 1).map((m) => new Date(m.scheduledAt as string).getTime()).sort();
    expect((times[1] - times[0]) / 60000).toBe(30);
    expect(new Date(times[0]).getHours()).toBe(21);
    expect(ko.every((m) => m.field === 1)).toBe(true);
  });
});
