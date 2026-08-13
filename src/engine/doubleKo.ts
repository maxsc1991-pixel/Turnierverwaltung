import type { Match, Slot } from './types';
import { buildSingleElimination, seedIntoBracket } from './bracket';
import { roundName } from './validation';
import { Resolver } from './resolve';

const WB = 'wb';
const LB = 'lb';

function wbId(round: number, index: number): string {
  return `${WB}-r${round}-${index}`;
}

function lbId(round: number, index: number): string {
  return `${LB}-r${round}-${index}`;
}

/**
 * Doppel-KO nach dem Standardschema.
 *
 * Siegerrunde: klassisches Bracket über `k = log2(n)` Runden.
 * Verliererrunde: `2k - 2` Runden, abwechselnd
 *   - "Minor" (ungerade): die Überlebenden der Verliererrunde spielen gegeneinander,
 *   - "Major" (gerade): die frischen Verlierer der Siegerrunde treffen dazu.
 * Grand Final: Sieger der Siegerrunde gegen Sieger der Verliererrunde. Verliert
 * der Sieger der Siegerrunde dort sein erstes Spiel im Turnier, entscheidet ein
 * Rückspiel (Bracket Reset).
 */
export function buildDoubleElimination(entriesInSeedOrder: readonly Slot[]): Match[] {
  const positions = seedIntoBracket(entriesInSeedOrder);
  const size = positions.length;
  const k = Math.log2(size);

  const winnerBracket = buildSingleElimination(positions, {
    idPrefix: WB,
    phase: 'wb',
    labelForRound: (_round, matchesInRound) => `Siegerrunde · ${roundName(matchesInRound)}`,
  });

  const matches: Match[] = [...winnerBracket];
  const lbRoundCount = Math.max(0, 2 * k - 2);

  for (let round = 1; round <= lbRoundCount; round++) {
    const j = Math.ceil(round / 2);
    const count = size / 2 ** (j + 1);
    const isMajor = round % 2 === 0;
    const isLast = round === lbRoundCount;
    const label = isLast ? 'Verliererrunde · Finale' : `Verliererrunde · Runde ${round}`;

    for (let i = 0; i < count; i++) {
      let a: Slot;
      let b: Slot;

      if (isMajor) {
        // Die Verlierer der Siegerrunde treffen auf die Überlebenden der
        // Verliererrunde. Die Reihenfolge wird jede zweite Runde gespiegelt,
        // damit sich zwei Spieler nicht sofort erneut begegnen.
        const wbRound = j + 1;
        const wbIndex = j % 2 === 1 ? count - 1 - i : i;
        a = { kind: 'winnerOf', matchId: lbId(round - 1, i) };
        b = { kind: 'loserOf', matchId: wbId(wbRound, wbIndex) };
      } else if (round === 1) {
        // Erste Verliererrunde: die Verlierer der ersten Siegerrunde paarweise.
        a = { kind: 'loserOf', matchId: wbId(1, i * 2) };
        b = { kind: 'loserOf', matchId: wbId(1, i * 2 + 1) };
      } else {
        a = { kind: 'winnerOf', matchId: lbId(round - 1, i * 2) };
        b = { kind: 'winnerOf', matchId: lbId(round - 1, i * 2 + 1) };
      }

      matches.push({
        id: lbId(round, i),
        phase: 'lb',
        round,
        indexInRound: i,
        label: count === 1 ? label : `${label} · Spiel ${i + 1}`,
        roundLabel: label,
        a,
        b,
      });
    }
  }

  const wbFinalId = wbId(k, 0);
  // Bei nur zwei Teilnehmern gibt es keine Verliererrunde – der Verlierer des
  // einzigen Spiels ist automatisch der Finalist aus der Verliererrunde.
  const lbChampion: Slot =
    lbRoundCount > 0
      ? { kind: 'winnerOf', matchId: lbId(lbRoundCount, 0) }
      : { kind: 'loserOf', matchId: wbFinalId };

  matches.push({
    id: 'gf',
    phase: 'gf',
    round: 1,
    indexInRound: 0,
    label: 'Grand Final',
    roundLabel: 'Grand Final',
    a: { kind: 'winnerOf', matchId: wbFinalId },
    b: lbChampion,
  });

  matches.push({
    id: 'gf-reset',
    phase: 'gf_reset',
    round: 2,
    indexInRound: 0,
    label: 'Final-Rückspiel (Bracket Reset)',
    roundLabel: 'Bracket Reset',
    a: { kind: 'loserOf', matchId: 'gf' },
    b: { kind: 'winnerOf', matchId: 'gf' },
  });

  return matches;
}

export function winnerBracketFinalId(matches: readonly Match[]): string | undefined {
  const wb = matches.filter((m) => m.phase === 'wb');
  if (!wb.length) return undefined;
  const last = Math.max(...wb.map((m) => m.round));
  return wb.find((m) => m.round === last)?.id;
}

/**
 * Das Rückspiel wird nur gebraucht, wenn der Sieger der Siegerrunde das Grand
 * Final verliert – dann haben beide genau eine Niederlage.
 */
export function isBracketResetNeeded(matches: readonly Match[], resolver: Resolver): boolean {
  const grandFinal = matches.find((m) => m.phase === 'gf');
  const wbFinalId = winnerBracketFinalId(matches);
  if (!grandFinal?.result || !wbFinalId) return false;

  const gfWinner = resolver.winner(grandFinal.id);
  const wbWinner = resolver.winner(wbFinalId);
  return (
    gfWinner.kind === 'player' && wbWinner.kind === 'player' && gfWinner.playerId !== wbWinner.playerId
  );
}

/** Blendet das Rückspiel aus, solange (oder falls) es nicht gebraucht wird. */
export function relevantMatches(matches: readonly Match[], resolver: Resolver): Match[] {
  const needsReset = isBracketResetNeeded(matches, resolver);
  return matches.filter((m) => m.phase !== 'gf_reset' || needsReset);
}
