import type { Match, Phase, Slot } from './types';
import { nextPowerOfTwo, roundName } from './validation';

/**
 * Klassische Setzliste: [1, 8, 4, 5, 2, 7, 3, 6] für 8 Plätze. Der Topgesetzte
 * und der Zweitgesetzte können sich frühestens im Finale treffen.
 */
export function bracketSeedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((seed) => [seed, next + 1 - seed]);
  }
  return order;
}

/**
 * Bringt die Teilnehmer aus der Setzreihenfolge in die Bracket-Positionen und
 * füllt mit Freilosen auf die nächste Zweierpotenz auf. Die Freilose fallen
 * dadurch automatisch den höchstgesetzten Spielern zu.
 */
export function seedIntoBracket(entriesInSeedOrder: readonly Slot[]): Slot[] {
  const size = nextPowerOfTwo(Math.max(2, entriesInSeedOrder.length));
  return bracketSeedOrder(size).map((seed) =>
    seed <= entriesInSeedOrder.length ? entriesInSeedOrder[seed - 1] : { kind: 'bye' as const },
  );
}

export interface BracketOptions {
  idPrefix: string;
  phase: Phase;
  /** Überschreibt die automatischen Rundennamen (z.B. für das Loser-Bracket). */
  labelForRound?: (round: number, matchesInRound: number) => string;
}

/**
 * Baut ein vollständiges Single-Elimination-Bracket. `positions` muss bereits
 * in Bracket-Reihenfolge vorliegen (siehe `seedIntoBracket`) und eine
 * Zweierpotenz an Einträgen enthalten.
 */
export function buildSingleElimination(positions: readonly Slot[], options: BracketOptions): Match[] {
  const { idPrefix, phase, labelForRound } = options;
  const matches: Match[] = [];
  let previousRoundIds: string[] = [];
  let round = 1;

  for (let remaining = positions.length; remaining > 1; remaining /= 2) {
    const matchesInRound = remaining / 2;
    const label = labelForRound?.(round, matchesInRound) ?? roundName(matchesInRound);
    const roundIds: string[] = [];

    for (let i = 0; i < matchesInRound; i++) {
      const id = `${idPrefix}-r${round}-${i}`;
      const [a, b]: [Slot, Slot] =
        round === 1
          ? [positions[i * 2], positions[i * 2 + 1]]
          : [
              { kind: 'winnerOf', matchId: previousRoundIds[i * 2] },
              { kind: 'winnerOf', matchId: previousRoundIds[i * 2 + 1] },
            ];

      matches.push({
        id,
        phase,
        round,
        indexInRound: i,
        label: matchesInRound === 1 ? label : `${label} ${i + 1}`,
        roundLabel: label,
        a,
        b,
      });
      roundIds.push(id);
    }

    previousRoundIds = roundIds;
    round++;
  }

  return matches;
}

/** Die Verlierer der beiden Halbfinals spielen um Platz 3. */
export function buildThirdPlaceMatch(bracketMatches: readonly Match[], idPrefix: string): Match | null {
  const finalRound = Math.max(...bracketMatches.map((m) => m.round));
  const semifinals = bracketMatches.filter((m) => m.round === finalRound - 1);
  if (semifinals.length !== 2) return null;

  return {
    id: `${idPrefix}-third`,
    phase: 'third',
    round: finalRound,
    indexInRound: 1,
    label: 'Spiel um Platz 3',
    roundLabel: 'Spiel um Platz 3',
    a: { kind: 'loserOf', matchId: semifinals[0].id },
    b: { kind: 'loserOf', matchId: semifinals[1].id },
  };
}

export function finalMatchId(matches: readonly Match[], phase: Phase): string | undefined {
  const inPhase = matches.filter((m) => m.phase === phase);
  if (!inPhase.length) return undefined;
  const lastRound = Math.max(...inPhase.map((m) => m.round));
  return inPhase.find((m) => m.round === lastRound)?.id;
}
