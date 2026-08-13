import type { Group, Match, Player } from './types';
import { shuffle } from './rng';

const GROUP_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function groupName(index: number): string {
  if (index < GROUP_LETTERS.length) return `Gruppe ${GROUP_LETTERS[index]}`;
  return `Gruppe ${index + 1}`;
}

/**
 * Verteilt die Spieler im Schlangensystem (A→B→C→C→B→A) auf die Gruppen.
 * Vorher wird gemischt, damit die Auslosung zufällig ist; die Schlange sorgt
 * dafür, dass gesetzte Spieler nicht in derselben Gruppe landen.
 */
export function drawGroups(
  players: readonly Player[],
  groupCount: number,
  rng: () => number,
): Group[] {
  const pool = shuffle(players, rng);
  const groups: Group[] = Array.from({ length: groupCount }, (_, i) => ({
    id: `g${i + 1}`,
    name: groupName(i),
    playerIds: [],
  }));

  pool.forEach((player, i) => {
    const row = Math.floor(i / groupCount);
    const col = i % groupCount;
    const target = row % 2 === 0 ? col : groupCount - 1 - col;
    groups[target].playerIds.push(player.id);
  });

  return groups;
}

/**
 * Round Robin nach dem Kreisverfahren (Berger-Tabellen): jede Paarung genau
 * einmal, und pro Runde spielt jeder Spieler höchstens ein Spiel. Die
 * Rundenreihenfolge sorgt bereits von sich aus für gleichmäßige Pausen.
 */
export function roundRobinRounds(playerIds: readonly string[]): Array<Array<[string, string]>> {
  const ids = playerIds.slice();
  const BYE = '__bye__';
  if (ids.length % 2 === 1) ids.push(BYE);

  const n = ids.length;
  const rounds: Array<Array<[string, string]>> = [];
  if (n < 2) return rounds;

  // Position 0 bleibt fix, der Rest rotiert.
  const rotating = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const round: Array<[string, string]> = [];
    const order = [ids[0], ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      if (a === BYE || b === BYE) continue;
      // Heim/Auswärts abwechseln, damit der Anwurf fair verteilt ist.
      round.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(round);
    rotating.unshift(rotating.pop() as string);
  }
  return rounds;
}

/** Erzeugt alle Gruppenspiele; die Runden aller Gruppen werden verschränkt. */
export function buildGroupMatches(groups: readonly Group[]): Match[] {
  const perGroup = groups.map((group) => roundRobinRounds(group.playerIds));
  const maxRounds = Math.max(0, ...perGroup.map((r) => r.length));
  const matches: Match[] = [];

  for (let round = 0; round < maxRounds; round++) {
    let indexInRound = 0;
    groups.forEach((group, gi) => {
      const pairings = perGroup[gi][round] ?? [];
      pairings.forEach(([a, b]) => {
        matches.push({
          id: `m-${group.id}-r${round + 1}-${indexInRound}`,
          phase: 'group',
          round: round + 1,
          indexInRound: indexInRound++,
          groupId: group.id,
          label: `${group.name} · Runde ${round + 1}`,
          roundLabel: `Runde ${round + 1}`,
          a: { kind: 'player', playerId: a },
          b: { kind: 'player', playerId: b },
        });
      });
    });
  }

  return matches;
}
