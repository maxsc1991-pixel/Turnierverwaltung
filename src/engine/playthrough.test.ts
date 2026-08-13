import { describe, expect, it } from 'vitest';
import type { Format, Match, Player, Tournament } from './types';
import { defaultConfig } from './types';
import { Resolver } from './resolve';
import { relevantMatches } from './doubleKo';
import { createTournament, startKoPhase, tournamentComplete, computeFinalRanking } from './tournament';
import { findGroupOption } from './validation';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Spieler ${i + 1}`,
    seed: i + 1,
  }));
}

/**
 * Spielt alle spielbereiten Partien aus, bis nichts mehr offen ist – genau wie
 * ein Turnierleiter, der Ergebnis für Ergebnis einträgt. Der Spieler mit der
 * kleineren Nummer gewinnt, damit der Ablauf reproduzierbar bleibt.
 */
function playEverything(tournament: Tournament): Tournament {
  let current = tournament;

  for (let guard = 0; guard < 500; guard++) {
    const resolver = new Resolver(current.matches);
    const visible = relevantMatches(current.matches, resolver);
    const next = visible.find((m) => resolver.status(m) === 'ready');
    if (!next) break;

    const [a, b] = resolver.playerIds(next);
    const aWins = Number(a.slice(1)) < Number(b.slice(1));
    const result = aWins ? { legsA: 2, legsB: 0 } : { legsA: 0, legsB: 2 };
    current = {
      ...current,
      matches: current.matches.map((m) => (m.id === next.id ? { ...m, result } : m)),
    };
  }

  return current;
}

function config(format: Format, participants: number, extra: Record<string, unknown> = {}) {
  return { ...defaultConfig(), format, participants, ...extra };
}

describe('Turnier vollständig durchspielen', () => {
  for (const count of [2, 3, 4, 5, 6, 7, 8, 11, 13, 16, 21]) {
    it(`Single KO mit ${count} Teilnehmern endet mit genau einem Sieger`, () => {
      const tournament = createTournament(
        config('single_ko', count, { thirdPlaceMatch: count >= 4 }),
        makePlayers(count),
        count * 13,
      );
      const played = playEverything({ ...tournament, stage: 'ko' });

      expect(tournamentComplete(played), 'Turnier muss abschließbar sein').toBe(true);

      const ranking = computeFinalRanking(played);
      expect(ranking.filter((r) => r.rank === 1)).toHaveLength(1);
      expect(new Set(ranking.map((r) => r.playerId)).size).toBe(count);
    });
  }

  for (const count of [2, 3, 4, 5, 6, 7, 8, 11, 16, 18]) {
    it(`Doppel-KO mit ${count} Teilnehmern endet mit genau einem Sieger`, () => {
      const tournament = createTournament(
        config('double_ko', count, { thirdPlaceMatch: false }),
        makePlayers(count),
        count * 7,
      );
      const played = playEverything({ ...tournament, stage: 'ko' });

      const resolver = new Resolver(played.matches);
      const open = relevantMatches(played.matches, resolver).filter(
        (m) => resolver.status(m) === 'ready',
      );
      expect(open, 'kein Spiel darf offen bleiben').toHaveLength(0);
      expect(tournamentComplete(played), 'Turnier muss abschließbar sein').toBe(true);

      const ranking = computeFinalRanking(played);
      expect(ranking.filter((r) => r.rank === 1)).toHaveLength(1);
    });
  }

  for (const [participants, groupCount] of [
    [8, 2],
    [12, 3],
    [16, 4],
    [20, 4],
    [24, 6],
  ] as Array<[number, number]>) {
    it(`Gruppenphase mit ${participants} Teilnehmern in ${groupCount} Gruppen führt bis zum Finale`, () => {
      const option = findGroupOption(participants, groupCount);
      expect(option).toBeDefined();

      const tournament = createTournament(
        config('groups', participants, {
          groupCount,
          groupSize: participants / groupCount,
          thirdPlaceMatch: true,
        }),
        makePlayers(participants),
        participants * 3,
      );

      const afterGroups = playEverything({ ...tournament, stage: 'group' });
      expect(afterGroups.matches.filter((m) => m.phase === 'group').every((m) => m.result)).toBe(true);

      const withKo = startKoPhase(afterGroups);
      const koFirstRound = withKo.matches.filter((m) => m.phase === 'ko' && m.round === 1);
      expect(koFirstRound).toHaveLength((option as { qualifiers: number }).qualifiers / 2);

      const played = playEverything(withKo);
      expect(tournamentComplete(played), 'Turnier muss abschließbar sein').toBe(true);

      // Das Spiel um Platz 3 muss ebenfalls ausgetragen worden sein.
      const third = played.matches.find((m: Match) => m.phase === 'third');
      expect(third?.result).toBeDefined();
    });
  }
});
