import type { Match, MatchStatus, Player, Tournament } from './types';
import { Resolver, indexMatches } from './resolve';
import { describeSlot, formatResult, type SideInfo } from './labels';

export interface TeamMatch {
  matchId: string;
  /** Bezeichnung des Spiels, z.B. "Gruppe A · Runde 2" oder "Viertelfinale 1". */
  label: string;
  scheduledAt?: string;
  field?: number;
  opponent: SideInfo;
  status: MatchStatus;
  /** Ergebnis aus Sicht dieses Teams, z.B. "2:1 (21:17)". */
  result?: string;
  outcome?: 'win' | 'loss' | 'draw';
  /** Freilos: das Team ist ohne Spiel weiter. */
  walkover: boolean;
}

export interface TeamPlan {
  player: Player;
  /** Gruppe des Teams, sofern im Gruppenmodus gespielt wird. */
  groupName?: string;
  matches: TeamMatch[];
}

/**
 * Alle Spiele eines Teams in zeitlicher Reihenfolge – die Grundlage für den
 * Aushang, den jedes Team mitbekommt.
 *
 * Aufgeführt wird nur, was bereits feststeht: In der KO-Phase ist der Gegner
 * einer späteren Runde noch offen, das Spiel gehört also noch keinem Team.
 * Freilose bleiben bewusst in der Liste, damit niemand ein vermeintlich
 * fehlendes Spiel sucht.
 */
export function teamPlan(tournament: Tournament, playerId: string): TeamMatch[] {
  const resolver = new Resolver(tournament.matches);
  const byId = indexMatches(tournament.matches);
  const rows: TeamMatch[] = [];

  for (const match of tournament.matches) {
    const side = sideOf(match, resolver, playerId);
    if (!side) continue;

    const opponent = describeSlot(side === 'a' ? match.b : match.a, resolver, tournament.players, byId);
    const walkover = opponent.kind === 'bye';

    rows.push({
      matchId: match.id,
      label: match.label,
      scheduledAt: walkover ? undefined : match.scheduledAt,
      field: walkover ? undefined : match.field,
      opponent,
      status: resolver.status(match),
      result: match.result ? resultFor(match, side) : undefined,
      outcome: outcomeFor(match, side),
      walkover,
    });
  }

  return rows.sort(byTime);
}

/** Spielpläne aller Teams, alphabetisch – für den Druck aller Aushänge. */
export function allTeamPlans(tournament: Tournament): TeamPlan[] {
  const groupOf = new Map<string, string>();
  for (const group of tournament.groups) {
    for (const id of group.playerIds) groupOf.set(id, group.name);
  }

  return tournament.players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    .map((player) => ({
      player,
      groupName: groupOf.get(player.id),
      matches: teamPlan(tournament, player.id),
    }));
}

/** Das nächste noch offene Spiel – für den Hinweis oben auf dem Aushang. */
export function nextOpenMatch<T extends { status: MatchStatus }>(
  matches: readonly T[],
): T | undefined {
  return matches.find((m) => m.status !== 'done');
}

export interface FieldMatch {
  matchId: string;
  label: string;
  scheduledAt?: string;
  /** Beide Seiten – in der KO-Phase auch als Platzhalter ("Sieger Halbfinale 1"). */
  home: SideInfo;
  away: SideInfo;
  status: MatchStatus;
  /** Ergebnis in der Reihenfolge der beiden Seiten, z.B. "2:1 (42:35)". */
  result?: string;
}

export interface FieldPlan {
  field: number;
  matches: FieldMatch[];
}

/**
 * Spielplan je Spielfeld – der Aushang fürs Board bzw. für die Bahn.
 *
 * Anders als beim Teamplan bleiben noch offene KO-Paarungen in der Liste: am
 * Feld zählt, wann es belegt ist, auch wenn die Namen erst durch das Vorspiel
 * feststehen. Freilose stehen nicht darin, sie werden nie gespielt.
 */
export function allFieldPlans(tournament: Tournament): FieldPlan[] {
  const resolver = new Resolver(tournament.matches);
  const byId = indexMatches(tournament.matches);
  const plans = new Map<number, FieldMatch[]>();

  for (const match of tournament.matches) {
    if (match.field === undefined || resolver.isWalkover(match)) continue;

    const rows = plans.get(match.field) ?? [];
    rows.push({
      matchId: match.id,
      label: match.label,
      scheduledAt: match.scheduledAt,
      home: describeSlot(match.a, resolver, tournament.players, byId),
      away: describeSlot(match.b, resolver, tournament.players, byId),
      status: resolver.status(match),
      result: match.result ? formatResult(match) : undefined,
    });
    plans.set(match.field, rows);
  }

  return [...plans.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([field, matches]) => ({ field, matches: matches.sort(byTime) }));
}

function sideOf(match: Match, resolver: Resolver, playerId: string): 'a' | 'b' | undefined {
  const a = resolver.slot(match.a);
  if (a.kind === 'player' && a.playerId === playerId) return 'a';
  const b = resolver.slot(match.b);
  if (b.kind === 'player' && b.playerId === playerId) return 'b';
  return undefined;
}

/** Das gespeicherte Ergebnis steht aus Sicht von Seite A – für B gedreht. */
function resultFor(match: Match, side: 'a' | 'b'): string {
  if (side === 'a' || !match.result) return formatResult(match);
  const { legsA, legsB, pointsA, pointsB } = match.result;
  return formatResult({
    ...match,
    result: { legsA: legsB, legsB: legsA, pointsA: pointsB, pointsB: pointsA },
  });
}

function outcomeFor(match: Match, side: 'a' | 'b'): 'win' | 'loss' | 'draw' | undefined {
  if (!match.result) return undefined;
  const { legsA, legsB } = match.result;
  if (legsA === legsB) return 'draw';
  const won = legsA > legsB ? side === 'a' : side === 'b';
  return won ? 'win' : 'loss';
}

/** Ohne Zeit terminierte Spiele (Freilose) stehen am Ende. */
function byTime(a: { scheduledAt?: string }, b: { scheduledAt?: string }): number {
  if (!a.scheduledAt && !b.scheduledAt) return 0;
  if (!a.scheduledAt) return 1;
  if (!b.scheduledAt) return -1;
  return a.scheduledAt.localeCompare(b.scheduledAt);
}
