import type { Match, Scoring, Sport, Tournament } from './types';
import { scoringOf } from './types';
import { configForMatch } from './rounds';
import { Resolver } from './resolve';
import { matchPoints } from './standings';

export interface PlayerStats {
  key: string;
  name: string;
  club?: string;
  tournaments: number;
  matches: number;
  won: number;
  drawn: number;
  lost: number;
  legsFor: number;
  legsAgainst: number;
  legDiff: number;
  points: number;
  titles: number;
  podiums: number;
  bestRank: number | null;
}

/**
 * Spieler werden über ihren Namen turnierübergreifend zusammengeführt – die
 * Spieler-IDs gelten nur innerhalb eines Turniers.
 */
export function playerKey(name: string): string {
  return name.trim().toLocaleLowerCase('de-DE');
}

function emptyStats(key: string, name: string, club?: string): PlayerStats {
  return {
    key,
    name,
    club,
    tournaments: 0,
    matches: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    legsFor: 0,
    legsAgainst: 0,
    legDiff: 0,
    points: 0,
    titles: 0,
    podiums: 0,
    bestRank: null,
  };
}

/** Ewige Tabelle über alle abgeschlossenen Turniere, optional je Sportart. */
export function computeAllTimeStats(
  tournaments: readonly Tournament[],
  sport?: Sport,
): PlayerStats[] {
  const table = new Map<string, PlayerStats>();
  const relevant = tournaments.filter((t) => (sport ? t.config.sport === sport : true));

  for (const tournament of relevant) {
    const resolver = new Resolver(tournament.matches);
    const byId = new Map(tournament.players.map((p) => [p.id, p]));

    // Jedes Turnier bringt seine eigene Wertung mit, und sie kann sich je Spiel
    // unterscheiden: die KO-Phase hat womöglich eine andere Leg-Anzahl als die
    // Gruppenphase, und dort sogar je Runde eine eigene. Ein einzelnes Leg wird
    // immer standard gewertet – deshalb je Spiel über seine Rundenkonfiguration.
    const scoringCache = new Map<string, Scoring>();
    const scoringFor = (match: Match): Scoring => {
      const key = match.phase === 'group' ? 'group' : match.roundLabel;
      const known = scoringCache.get(key);
      if (known) return known;
      const scoring = scoringOf(configForMatch(tournament, match));
      scoringCache.set(key, scoring);
      return scoring;
    };

    const entryFor = (playerId: string): PlayerStats | undefined => {
      const player = byId.get(playerId);
      if (!player) return undefined;
      const key = playerKey(player.name);
      let stats = table.get(key);
      if (!stats) {
        stats = emptyStats(key, player.name.trim(), player.club);
        table.set(key, stats);
      }
      if (!stats.club && player.club) stats.club = player.club;
      return stats;
    };

    for (const player of tournament.players) {
      const stats = entryFor(player.id);
      if (stats) stats.tournaments++;
    }

    for (const match of tournament.matches) {
      if (!match.result) continue;
      const [a, b] = [resolver.slot(match.a), resolver.slot(match.b)];
      if (a.kind !== 'player' || b.kind !== 'player') continue;

      const sa = entryFor(a.playerId);
      const sb = entryFor(b.playerId);
      if (!sa || !sb) continue;

      const { legsA, legsB } = match.result;
      sa.matches++;
      sb.matches++;
      sa.legsFor += legsA;
      sa.legsAgainst += legsB;
      sb.legsFor += legsB;
      sb.legsAgainst += legsA;

      if (legsA > legsB) {
        sa.won++;
        sb.lost++;
      } else if (legsB > legsA) {
        sb.won++;
        sa.lost++;
      } else {
        sa.drawn++;
        sb.drawn++;
      }

      const scoring = scoringFor(match);
      sa.points += matchPoints(legsA, legsB, scoring);
      sb.points += matchPoints(legsB, legsA, scoring);
    }

    for (const entry of tournament.finalRanking ?? []) {
      const stats = entryFor(entry.playerId);
      if (!stats) continue;
      if (entry.rank === 1) stats.titles++;
      if (entry.rank <= 3) stats.podiums++;
      stats.bestRank = stats.bestRank === null ? entry.rank : Math.min(stats.bestRank, entry.rank);
    }
  }

  for (const stats of table.values()) {
    stats.legDiff = stats.legsFor - stats.legsAgainst;
  }

  return [...table.values()].sort((x, y) => {
    if (y.titles !== x.titles) return y.titles - x.titles;
    if (y.podiums !== x.podiums) return y.podiums - x.podiums;
    if (y.points !== x.points) return y.points - x.points;
    if (y.legDiff !== x.legDiff) return y.legDiff - x.legDiff;
    return x.name.localeCompare(y.name, 'de-DE');
  });
}
