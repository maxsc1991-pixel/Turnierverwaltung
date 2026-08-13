import type { Match, Standing } from './types';

export const POINTS_WIN = 2;
export const POINTS_DRAW = 1;
export const POINTS_LOSS = 0;

interface Tally {
  playerId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  legsFor: number;
  legsAgainst: number;
}

function emptyTally(playerId: string): Tally {
  return { playerId, played: 0, won: 0, drawn: 0, lost: 0, points: 0, legsFor: 0, legsAgainst: 0 };
}

/** Nur Spiele, bei denen beide Seiten feste Spieler sind und ein Ergebnis vorliegt. */
function playedMatches(matches: readonly Match[]): Array<{ a: string; b: string; legsA: number; legsB: number }> {
  const out: Array<{ a: string; b: string; legsA: number; legsB: number }> = [];
  for (const match of matches) {
    if (!match.result) continue;
    if (match.a.kind !== 'player' || match.b.kind !== 'player') continue;
    out.push({
      a: match.a.playerId,
      b: match.b.playerId,
      legsA: match.result.legsA,
      legsB: match.result.legsB,
    });
  }
  return out;
}

function tally(playerIds: readonly string[], matches: readonly Match[]): Map<string, Tally> {
  const table = new Map(playerIds.map((id) => [id, emptyTally(id)]));

  for (const m of playedMatches(matches)) {
    const a = table.get(m.a);
    const b = table.get(m.b);
    if (!a || !b) continue;

    a.played++;
    b.played++;
    a.legsFor += m.legsA;
    a.legsAgainst += m.legsB;
    b.legsFor += m.legsB;
    b.legsAgainst += m.legsA;

    if (m.legsA > m.legsB) {
      a.won++;
      b.lost++;
      a.points += POINTS_WIN;
      b.points += POINTS_LOSS;
    } else if (m.legsA < m.legsB) {
      b.won++;
      a.lost++;
      b.points += POINTS_WIN;
      a.points += POINTS_LOSS;
    } else {
      a.drawn++;
      b.drawn++;
      a.points += POINTS_DRAW;
      b.points += POINTS_DRAW;
    }
  }

  return table;
}

/**
 * Sortiert eine Gruppe nach: Punkte → Leg-Differenz → direkter Vergleich →
 * gewonnene Legs → Setzlistenposition (deterministischer Losentscheid).
 *
 * `seedOf` liefert die Setzlistenposition und macht die letzte Stufe stabil.
 */
export function computeStandings(
  playerIds: readonly string[],
  matches: readonly Match[],
  seedOf: (playerId: string) => number,
): Standing[] {
  const table = tally(playerIds, matches);
  const entries = playerIds.map((id) => table.get(id) ?? emptyTally(id));

  // Erste Stufe: Punkte, dann Leg-Differenz.
  const sorted = entries.slice().sort((x, y) => {
    const px = y.points - x.points;
    if (px !== 0) return px;
    return legDiff(y) - legDiff(x);
  });

  // Punkt- und differenzgleiche Blöcke intern über den direkten Vergleich lösen.
  const result: Standing[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j].points === sorted[i].points &&
      legDiff(sorted[j]) === legDiff(sorted[i])
    ) {
      j++;
    }

    const block = sorted.slice(i, j);
    const ordered: Array<{ tally: Tally; tiebreak?: string }> =
      block.length > 1 ? breakTie(block, matches, seedOf) : block.map((t) => ({ tally: t }));

    ordered.forEach((entry, offset) => {
      result.push({
        playerId: entry.tally.playerId,
        played: entry.tally.played,
        won: entry.tally.won,
        drawn: entry.tally.drawn,
        lost: entry.tally.lost,
        points: entry.tally.points,
        legsFor: entry.tally.legsFor,
        legsAgainst: entry.tally.legsAgainst,
        legDiff: legDiff(entry.tally),
        rank: i + offset + 1,
        tiebreak: entry.tiebreak,
      });
    });

    i = j;
  }

  return result;
}

function legDiff(t: Tally): number {
  return t.legsFor - t.legsAgainst;
}

/**
 * Direkter Vergleich: Mini-Tabelle nur aus den Spielen der punktgleichen
 * Spieler untereinander. Bleibt es gleich, entscheiden gewonnene Legs, zuletzt
 * die Setzlistenposition.
 */
function breakTie(
  block: readonly Tally[],
  matches: readonly Match[],
  seedOf: (playerId: string) => number,
): Array<{ tally: Tally; tiebreak?: string }> {
  const ids = new Set(block.map((t) => t.playerId));
  const internal = matches.filter(
    (m) =>
      m.result &&
      m.a.kind === 'player' &&
      m.b.kind === 'player' &&
      ids.has(m.a.playerId) &&
      ids.has(m.b.playerId),
  );
  const mini = tally([...ids], internal);

  return block
    .slice()
    .sort((x, y) => {
      const mx = mini.get(x.playerId) as Tally;
      const my = mini.get(y.playerId) as Tally;

      const points = my.points - mx.points;
      if (points !== 0) return points;

      const diff = legDiff(my) - legDiff(mx);
      if (diff !== 0) return diff;

      const legs = y.legsFor - x.legsFor;
      if (legs !== 0) return legs;

      return seedOf(x.playerId) - seedOf(y.playerId);
    })
    .map((t) => {
      const mt = mini.get(t.playerId) as Tally;
      const decided = block.some((other) => {
        if (other.playerId === t.playerId) return false;
        const mo = mini.get(other.playerId) as Tally;
        return mo.points !== mt.points || legDiff(mo) !== legDiff(mt);
      });
      if (decided) return { tally: t, tiebreak: 'Direkter Vergleich' };
      const legsDecide = block.some((other) => other.legsFor !== t.legsFor);
      return { tally: t, tiebreak: legsDecide ? 'Gewonnene Legs' : 'Losentscheid' };
    });
}

/**
 * Rangfolge der Gruppendritten über alle Gruppen hinweg – nötig, wenn
 * zusätzlich zu den Ersten und Zweiten noch Dritte weiterkommen (12/3, 24/6,
 * 48/12). Alle Gruppen sind gleich groß, daher sind die Werte direkt
 * vergleichbar.
 */
export function rankAcrossGroups(
  candidates: readonly Standing[],
  seedOf: (playerId: string) => number,
): Standing[] {
  return candidates.slice().sort((x, y) => {
    const points = y.points - x.points;
    if (points !== 0) return points;
    const diff = y.legDiff - x.legDiff;
    if (diff !== 0) return diff;
    const legs = y.legsFor - x.legsFor;
    if (legs !== 0) return legs;
    return seedOf(x.playerId) - seedOf(y.playerId);
  });
}
