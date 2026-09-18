import type { Match, Scoring, Standing } from './types';

export const POINTS_WIN = 2;
export const POINTS_DRAW = 1;
export const POINTS_LOSS = 0;

/** Leg-Bonus-Wertung: Sieg ohne Leg-Verlust, Sieg, mindestens ein Leg gewonnen. */
export const BONUS_CLEAN_WIN = 3;
export const BONUS_WIN = 2;
export const BONUS_LEG = 1;

/**
 * Punkte eines einzelnen Spiels aus Sicht einer Seite.
 *
 * Die Leg-Bonus-Wertung hängt nur davon ab, **ob** der Verlierer ein Leg geholt
 * hat, nicht wie viele – dadurch skaliert sie über jedes Best of: 2:0 und 3:0
 * geben gleichermaßen 3 Punkte, 2:1 und 3:2 gleichermaßen 2.
 */
export function matchPoints(legsFor: number, legsAgainst: number, scoring: Scoring): number {
  if (scoring === 'legBonus') {
    if (legsFor > legsAgainst) return legsAgainst === 0 ? BONUS_CLEAN_WIN : BONUS_WIN;
    return legsFor > 0 ? BONUS_LEG : POINTS_LOSS;
  }
  if (legsFor > legsAgainst) return POINTS_WIN;
  return legsFor === legsAgainst ? POINTS_DRAW : POINTS_LOSS;
}

interface Tally {
  playerId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  legsFor: number;
  legsAgainst: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface StandingsOptions {
  /**
   * Beim Cornhole zählen die erzielten Punkte mit. Die Rangfolge lautet dann
   * Turnierpunkte → Leg-Differenz → Punktdifferenz → direkter Vergleich.
   */
  usePoints?: boolean;
  /** Wertung der einzelnen Spiele – siehe `matchPoints`. */
  scoring?: Scoring;
}

interface Rules {
  usePoints: boolean;
  scoring: Scoring;
}

function rules(options: StandingsOptions): Rules {
  return { usePoints: options.usePoints ?? false, scoring: options.scoring ?? 'standard' };
}

function emptyTally(playerId: string): Tally {
  return {
    playerId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    points: 0,
    legsFor: 0,
    legsAgainst: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  };
}

const legDiff = (t: Tally) => t.legsFor - t.legsAgainst;
const pointsDiff = (t: Tally) => t.pointsFor - t.pointsAgainst;

function tally(
  playerIds: readonly string[],
  matches: readonly Match[],
  scoring: Scoring,
): Map<string, Tally> {
  const table = new Map(playerIds.map((id) => [id, emptyTally(id)]));

  for (const match of matches) {
    if (!match.result) continue;
    if (match.a.kind !== 'player' || match.b.kind !== 'player') continue;

    const a = table.get(match.a.playerId);
    const b = table.get(match.b.playerId);
    if (!a || !b) continue;

    const { legsA, legsB, pointsA, pointsB } = match.result;

    a.played++;
    b.played++;
    a.legsFor += legsA;
    a.legsAgainst += legsB;
    b.legsFor += legsB;
    b.legsAgainst += legsA;

    if (pointsA !== undefined && pointsB !== undefined) {
      a.pointsFor += pointsA;
      a.pointsAgainst += pointsB;
      b.pointsFor += pointsB;
      b.pointsAgainst += pointsA;
    }

    if (legsA > legsB) {
      a.won++;
      b.lost++;
    } else if (legsA < legsB) {
      b.won++;
      a.lost++;
    } else {
      a.drawn++;
      b.drawn++;
    }

    a.points += matchPoints(legsA, legsB, scoring);
    b.points += matchPoints(legsB, legsA, scoring);
  }

  return table;
}

/** Die Kriterien vor dem direkten Vergleich – sie bilden die Gleichstandsblöcke. */
function primaryKeys(t: Tally, rule: Rules): number[] {
  // In der Leg-Bonus-Wertung steckt die Leg-Ausbeute bereits in den Punkten.
  // Sie erneut als Kriterium zu führen, würde dasselbe zweimal werten – nach
  // den Punkten entscheidet deshalb direkt der direkte Vergleich.
  if (rule.scoring === 'legBonus') return [t.points];
  return rule.usePoints ? [t.points, legDiff(t), pointsDiff(t)] : [t.points, legDiff(t)];
}

function sameBlock(x: Tally, y: Tally, rule: Rules): boolean {
  const a = primaryKeys(x, rule);
  const b = primaryKeys(y, rule);
  return a.every((value, index) => value === b[index]);
}

function compareKeys(x: Tally, y: Tally, rule: Rules): number {
  const a = primaryKeys(x, rule);
  const b = primaryKeys(y, rule);
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

/**
 * Sortiert eine Gruppe nach: Turnierpunkte → Leg-Differenz → (beim Cornhole
 * Punktdifferenz) → direkter Vergleich → gewonnene Legs → Setzlistenposition
 * als deterministischer Losentscheid.
 *
 * In der Leg-Bonus-Wertung entfallen Leg- und Punktdifferenz als Kriterium:
 * Turnierpunkte → direkter Vergleich → gewonnene Legs → Setzlistenposition.
 */
export function computeStandings(
  playerIds: readonly string[],
  matches: readonly Match[],
  seedOf: (playerId: string) => number,
  options: StandingsOptions = {},
): Standing[] {
  const rule = rules(options);
  const table = tally(playerIds, matches, rule.scoring);
  const entries = playerIds.map((id) => table.get(id) ?? emptyTally(id));

  const sorted = entries.slice().sort((x, y) => compareKeys(x, y, rule));

  const result: Standing[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sameBlock(sorted[j], sorted[i], rule)) j++;

    const block = sorted.slice(i, j);
    const ordered: Array<{ tally: Tally; tiebreak?: string }> =
      block.length > 1
        ? breakTie(block, matches, seedOf, rule)
        : block.map((t) => ({ tally: t }));

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
        pointsFor: entry.tally.pointsFor,
        pointsAgainst: entry.tally.pointsAgainst,
        pointsDiff: pointsDiff(entry.tally),
        rank: i + offset + 1,
        tiebreak: entry.tiebreak,
      });
    });

    i = j;
  }

  return result;
}

/**
 * Direkter Vergleich: Mini-Tabelle nur aus den Spielen der Gleichstehenden
 * untereinander. Bleibt es gleich, entscheiden gewonnene Legs, zuletzt die
 * Setzlistenposition.
 */
function breakTie(
  block: readonly Tally[],
  matches: readonly Match[],
  seedOf: (playerId: string) => number,
  rule: Rules,
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
  const mini = tally([...ids], internal, rule.scoring);

  return block
    .slice()
    .sort((x, y) => {
      const direct = compareKeys(
        mini.get(x.playerId) as Tally,
        mini.get(y.playerId) as Tally,
        rule,
      );
      if (direct !== 0) return direct;

      const legs = y.legsFor - x.legsFor;
      if (legs !== 0) return legs;

      return seedOf(x.playerId) - seedOf(y.playerId);
    })
    .map((t) => {
      const own = mini.get(t.playerId) as Tally;
      const decidedDirectly = block.some(
        (other) =>
          other.playerId !== t.playerId &&
          compareKeys(own, mini.get(other.playerId) as Tally, rule) !== 0,
      );
      if (decidedDirectly) return { tally: t, tiebreak: 'Direkter Vergleich' };

      const legsDecide = block.some((other) => other.legsFor !== t.legsFor);
      return { tally: t, tiebreak: legsDecide ? 'Gewonnene Legs' : 'Losentscheid' };
    });
}

/**
 * Rangfolge gleicher Gruppenplätze über alle Gruppen hinweg – nötig, wenn
 * zusätzlich zu den Ersten und Zweiten noch Dritte weiterkommen (12/3, 24/6,
 * 48/12). Alle Gruppen sind gleich groß, daher sind die Werte vergleichbar.
 */
export function rankAcrossGroups(
  candidates: readonly Standing[],
  seedOf: (playerId: string) => number,
  options: StandingsOptions = {},
): Standing[] {
  const rule = rules(options);
  return candidates.slice().sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    // Einen direkten Vergleich gibt es zwischen Gruppen nicht; in der
    // Leg-Bonus-Wertung entscheiden deshalb gleich die gewonnenen Legs.
    if (rule.scoring !== 'legBonus') {
      if (y.legDiff !== x.legDiff) return y.legDiff - x.legDiff;
      if (rule.usePoints && y.pointsDiff !== x.pointsDiff) return y.pointsDiff - x.pointsDiff;
    }
    if (y.legsFor !== x.legsFor) return y.legsFor - x.legsFor;
    return seedOf(x.playerId) - seedOf(y.playerId);
  });
}
