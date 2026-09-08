import type { Group, Slot, Standing } from './types';
import { rankAcrossGroups, type StandingsOptions } from './standings';
import { bracketSeedOrder } from './bracket';

export interface Qualifier {
  playerId: string;
  groupId: string;
  groupName: string;
  /** Platz innerhalb der Gruppe (1 = Sieger). */
  groupRank: number;
  /** Rang innerhalb der eigenen Kategorie über alle Gruppen hinweg. */
  crossRank: number;
}

interface Pair {
  home: Qualifier;
  away: Qualifier;
  /** Kleiner = stärkere Paarung, bestimmt die Platzierung im Bracket. */
  strength: number;
}

/** Eine Zeile der Rangliste aller Gruppendritten – mit und ohne Qualifikation. */
export interface ThirdPlaceRow {
  playerId: string;
  groupName: string;
  /** Rang unter allen Gruppendritten, 1 = bester Dritter. */
  crossRank: number;
  qualified: boolean;
  standing: Standing;
}

export interface QualificationResult {
  /** Bracket-Positionen, direkt an `buildSingleElimination` übergebbar. */
  positions: Slot[];
  qualifiers: Qualifier[];
  pairings: Array<{ home: Qualifier; away: Qualifier }>;
  /**
   * Alle Gruppendritten in der Reihenfolge, in der über sie entschieden wurde.
   * Stammt aus derselben Sortierung wie die Setzung und kann ihr daher nicht
   * widersprechen – gedacht zum Nachvollziehen der Auswahl.
   */
  thirdsRanking: ThirdPlaceRow[];
}

function toQualifier(
  standing: Standing,
  group: Group,
  groupRank: number,
  crossRank: number,
): Qualifier {
  return {
    playerId: standing.playerId,
    groupId: group.id,
    groupName: group.name,
    groupRank,
    crossRank,
  };
}

/** Sammelt alle Spieler eines Gruppenplatzes und sortiert sie gruppenübergreifend. */
function collect(
  rank: number,
  groups: readonly Group[],
  standingsByGroup: Map<string, Standing[]>,
  seedOf: (playerId: string) => number,
  options: StandingsOptions,
): Qualifier[] {
  const rows: Array<{ standing: Standing; group: Group }> = [];
  for (const group of groups) {
    const standings = standingsByGroup.get(group.id) ?? [];
    const standing = standings[rank - 1];
    if (standing) rows.push({ standing, group });
  }

  const ordered = rankAcrossGroups(
    rows.map((r) => r.standing),
    seedOf,
    options,
  );

  return ordered.map((standing, i) => {
    const row = rows.find((r) => r.standing.playerId === standing.playerId) as { group: Group };
    return toQualifier(standing, row.group, rank, i + 1);
  });
}

/**
 * Tauscht die Auswärtsseite zweier Paarungen, wenn eine Paarung ein
 * Gruppenduell wäre. In Runde 1 sollen sich Gruppengegner nicht erneut treffen.
 */
function avoidSameGroup(pairs: Pair[]): Pair[] {
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].home.groupId !== pairs[i].away.groupId) continue;
    const partner = pairs.findIndex(
      (p, j) =>
        j !== i &&
        p.home.groupId !== pairs[i].away.groupId &&
        pairs[i].home.groupId !== p.away.groupId,
    );
    if (partner >= 0) {
      const tmp = pairs[i].away;
      pairs[i].away = pairs[partner].away;
      pairs[partner].away = tmp;
    }
  }
  return pairs;
}

/**
 * Verteilt die Gruppenplatzierten auf das KO-Bracket.
 *
 * Ohne nachrückende Dritte gilt: der Sieger einer Gruppe spielt gegen den
 * Zweiten einer anderen Gruppe (Kreuzmuster A1–B2, B1–A2, C1–D2 …).
 *
 * Mit nachrückenden Dritten (12/3, 24/6, 48/12) treffen die besten
 * Gruppensieger auf die qualifizierten Dritten; die übrigen Sieger spielen
 * gegen die schwächsten Zweiten, und die verbleibenden Zweiten werden
 * untereinander aufgeteilt.
 */
export function qualifyFromGroups(
  groups: readonly Group[],
  standingsByGroup: Map<string, Standing[]>,
  bestThirds: number,
  seedOf: (playerId: string) => number,
  options: StandingsOptions = {},
): QualificationResult {
  const winners = collect(1, groups, standingsByGroup, seedOf, options);
  const runnersUp = collect(2, groups, standingsByGroup, seedOf, options);
  const allThirds = collect(3, groups, standingsByGroup, seedOf, options);
  const thirds = allThirds.slice(0, bestThirds);

  const thirdsRanking: ThirdPlaceRow[] = allThirds.map((q, i) => ({
    playerId: q.playerId,
    groupName: q.groupName,
    crossRank: i + 1,
    qualified: i < bestThirds,
    standing: (standingsByGroup.get(q.groupId) ?? []).find(
      (s) => s.playerId === q.playerId,
    ) as Standing,
  }));

  const pairs: Pair[] = [];

  if (groups.length === 1) {
    // Einzelgruppe: die beiden Erstplatzierten bestreiten das Finale.
    if (winners[0] && runnersUp[0]) {
      pairs.push({ home: winners[0], away: runnersUp[0], strength: 1 });
    }
  } else if (bestThirds === 0) {
    // Kreuzmuster: Gruppe g gegen den Zweiten der Nachbargruppe (g XOR 1).
    const runnerByGroup = new Map(runnersUp.map((q) => [q.groupId, q]));
    groups.forEach((group, index) => {
      const winner = winners.find((w) => w.groupId === group.id);
      const partner = groups[index ^ 1];
      const away = partner ? runnerByGroup.get(partner.id) : undefined;
      if (winner && away) pairs.push({ home: winner, away, strength: winner.crossRank });
    });
  } else {
    const t = thirds.length;

    // Beste Gruppensieger gegen die qualifizierten Dritten.
    for (let i = 0; i < t; i++) {
      pairs.push({ home: winners[i], away: thirds[t - 1 - i], strength: winners[i].crossRank });
    }

    // Übrige Sieger gegen die schwächsten Zweiten.
    const remainingWinners = winners.slice(t);
    remainingWinners.forEach((winner, i) => {
      pairs.push({
        home: winner,
        away: runnersUp[runnersUp.length - 1 - i],
        strength: winner.crossRank + 0.25,
      });
    });

    // Die verbleibenden (besten) Zweiten unter sich.
    const leftover = runnersUp.slice(0, runnersUp.length - remainingWinners.length);
    for (let i = 0; i < leftover.length / 2; i++) {
      pairs.push({
        home: leftover[i],
        away: leftover[leftover.length - 1 - i],
        strength: leftover[i].crossRank + 0.5,
      });
    }
  }

  avoidSameGroup(pairs);
  pairs.sort((x, y) => x.strength - y.strength);

  // Die stärkste Paarung bekommt Bracket-Position 1, die zweitstärkste landet
  // in der anderen Hälfte – exakt wie bei einer normalen Setzliste.
  const order = bracketSeedOrder(pairs.length);
  const arranged = order.map((rank) => pairs[rank - 1]);

  const positions: Slot[] = [];
  for (const pair of arranged) {
    positions.push({ kind: 'player', playerId: pair.home.playerId });
    positions.push({ kind: 'player', playerId: pair.away.playerId });
  }

  return {
    positions,
    qualifiers: [...winners, ...runnersUp, ...thirds],
    pairings: arranged.map((p) => ({ home: p.home, away: p.away })),
    thirdsRanking,
  };
}
