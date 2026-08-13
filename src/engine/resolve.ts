import type { Match, MatchStatus, Slot } from './types';

export type Resolved =
  | { kind: 'player'; playerId: string }
  | { kind: 'bye' }
  | { kind: 'unknown' };

export const UNKNOWN: Resolved = { kind: 'unknown' };
export const BYE: Resolved = { kind: 'bye' };

export function indexMatches(matches: readonly Match[]): Map<string, Match> {
  return new Map(matches.map((m) => [m.id, m]));
}

/**
 * Löst Slots und Sieger/Verlierer rekursiv auf. Der Cache verhindert, dass
 * tiefe Brackets exponentiell oft neu berechnet werden, und ist nur für einen
 * konsistenten Zustand gültig – nach jeder Änderung neu anlegen.
 */
export class Resolver {
  private readonly byId: Map<string, Match>;
  private readonly winners = new Map<string, Resolved>();
  private readonly losers = new Map<string, Resolved>();

  constructor(matches: readonly Match[]) {
    this.byId = indexMatches(matches);
  }

  slot(slot: Slot): Resolved {
    switch (slot.kind) {
      case 'player':
        return { kind: 'player', playerId: slot.playerId };
      case 'bye':
        return BYE;
      case 'winnerOf':
        return this.winner(slot.matchId);
      case 'loserOf':
        return this.loser(slot.matchId);
      case 'groupRank':
        // Gruppenplatzierungen werden beim Start der KO-Phase in feste Spieler
        // aufgelöst; vorher sind sie bewusst offen.
        return UNKNOWN;
    }
  }

  winner(matchId: string): Resolved {
    const cached = this.winners.get(matchId);
    if (cached) return cached;
    const value = this.compute(matchId).winner;
    this.winners.set(matchId, value);
    return value;
  }

  loser(matchId: string): Resolved {
    const cached = this.losers.get(matchId);
    if (cached) return cached;
    const value = this.compute(matchId).loser;
    this.losers.set(matchId, value);
    return value;
  }

  private compute(matchId: string): { winner: Resolved; loser: Resolved } {
    const match = this.byId.get(matchId);
    if (!match) return { winner: UNKNOWN, loser: UNKNOWN };

    const a = this.slot(match.a);
    const b = this.slot(match.b);

    // Freilos: der reale Spieler rückt ohne Spiel nach.
    if (a.kind === 'bye' && b.kind === 'bye') return { winner: BYE, loser: BYE };
    if (a.kind === 'bye') return b.kind === 'player' ? { winner: b, loser: BYE } : { winner: UNKNOWN, loser: UNKNOWN };
    if (b.kind === 'bye') return a.kind === 'player' ? { winner: a, loser: BYE } : { winner: UNKNOWN, loser: UNKNOWN };

    if (a.kind === 'unknown' || b.kind === 'unknown') return { winner: UNKNOWN, loser: UNKNOWN };
    if (!match.result) return { winner: UNKNOWN, loser: UNKNOWN };

    const { legsA, legsB } = match.result;
    if (legsA === legsB) return { winner: UNKNOWN, loser: UNKNOWN };
    return legsA > legsB ? { winner: a, loser: b } : { winner: b, loser: a };
  }

  /**
   * `done`  – Ergebnis liegt vor oder das Spiel entfällt durch ein Freilos
   * `ready` – beide Seiten stehen fest, kann gespielt werden
   * `pending` – wartet noch auf Vorspiele
   */
  status(match: Match): MatchStatus {
    if (match.result) return 'done';
    const a = this.slot(match.a);
    const b = this.slot(match.b);
    if (a.kind === 'bye' || b.kind === 'bye') return 'done';
    if (a.kind === 'unknown' || b.kind === 'unknown') return 'pending';
    return 'ready';
  }

  /** Freilos-Spiele werden nie gespielt und dürfen keinen Platz belegen. */
  isWalkover(match: Match): boolean {
    return this.slot(match.a).kind === 'bye' || this.slot(match.b).kind === 'bye';
  }

  playerIds(match: Match): string[] {
    const out: string[] = [];
    for (const side of [match.a, match.b]) {
      const r = this.slot(side);
      if (r.kind === 'player') out.push(r.playerId);
    }
    return out;
  }
}
