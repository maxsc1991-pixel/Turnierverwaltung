import type { Match, Player, Slot } from './types';
import type { Resolver } from './resolve';

export interface SideInfo {
  kind: 'player' | 'bye' | 'open';
  name: string;
  club?: string;
  playerId?: string;
}

/**
 * Beschreibt eine Spielseite für die Anzeige. Noch offene Plätze bekommen einen
 * sprechenden Platzhalter wie "Sieger Halbfinale 1", damit im Bracket sichtbar
 * ist, worauf gewartet wird.
 */
export function describeSlot(
  slot: Slot,
  resolver: Resolver,
  players: readonly Player[],
  byId: Map<string, Match>,
): SideInfo {
  const resolved = resolver.slot(slot);

  if (resolved.kind === 'player') {
    const player = players.find((p) => p.id === resolved.playerId);
    return {
      kind: 'player',
      name: player?.name ?? 'Unbekannt',
      club: player?.club,
      playerId: resolved.playerId,
    };
  }

  if (resolved.kind === 'bye') return { kind: 'bye', name: 'Freilos' };

  switch (slot.kind) {
    case 'winnerOf':
      return { kind: 'open', name: `Sieger ${byId.get(slot.matchId)?.label ?? 'Vorspiel'}` };
    case 'loserOf':
      return { kind: 'open', name: `Verlierer ${byId.get(slot.matchId)?.label ?? 'Vorspiel'}` };
    case 'groupRank':
      return { kind: 'open', name: `${ordinal(slot.rank)} Gruppe` };
    default:
      return { kind: 'open', name: 'offen' };
  }
}

function ordinal(rank: number): string {
  return rank === 1 ? 'Sieger' : `${rank}.`;
}

/** "2:1 (21:17)" – die Kurzform aus der Ergebniseingabe. */
export function formatResult(match: Match): string {
  if (!match.result) return '';
  const { legsA, legsB, pointsA, pointsB } = match.result;
  const legs = `${legsA}:${legsB}`;
  return pointsA !== undefined && pointsB !== undefined ? `${legs} (${pointsA}:${pointsB})` : legs;
}
