import type {
  FinalRank,
  Group,
  Match,
  Player,
  Slot,
  Standing,
  Tournament,
  TournamentConfig,
} from './types';
import { buildSingleElimination, buildThirdPlaceMatch, seedIntoBracket } from './bracket';
import { buildDoubleElimination, isBracketResetNeeded } from './doubleKo';
import { buildGroupMatches, drawGroups } from './groups';
import { qualifyFromGroups } from './qualification';
import { Resolver } from './resolve';
import { createRng, newSeed, shuffle } from './rng';
import { estimatedEnd, scheduleMatches } from './schedule';
import { computeStandings } from './standings';
import { findGroupOption } from './validation';

export function seedOf(players: readonly Player[]): (playerId: string) => number {
  const map = new Map(players.map((p) => [p.id, p.seed]));
  return (playerId) => map.get(playerId) ?? Number.MAX_SAFE_INTEGER;
}

/** Baut Gruppen bzw. Bracket neu auf und verteilt anschließend die Spielzeiten. */
export function generatePlan(
  config: TournamentConfig,
  players: readonly Player[],
  seed: number,
): { groups: Group[]; matches: Match[] } {
  if (config.format === 'groups') {
    const groups = drawGroups(players, config.groupCount, createRng(seed));
    const matches = scheduleMatches(buildGroupMatches(groups), config);
    return { groups, matches };
  }

  const drawn = shuffle(players, createRng(seed));
  const entries: Slot[] = drawn.map((p) => ({ kind: 'player', playerId: p.id }));

  if (config.format === 'double_ko') {
    return { groups: [], matches: scheduleMatches(buildDoubleElimination(entries), config) };
  }

  const bracket = buildSingleElimination(seedIntoBracket(entries), { idPrefix: 'ko', phase: 'ko' });
  const third = config.thirdPlaceMatch ? buildThirdPlaceMatch(bracket, 'ko') : null;
  const matches = third ? [...bracket, third] : bracket;
  return { groups: [], matches: scheduleMatches(matches, config) };
}

export function createTournament(
  config: TournamentConfig,
  players: readonly Player[],
  seed = newSeed(),
): Tournament {
  const { groups, matches } = generatePlan(config, players, seed);
  return {
    id: `t-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    createdAt: new Date().toISOString(),
    config,
    players: players.slice(),
    seed,
    groups,
    matches,
    stage: 'plan',
  };
}

/** Neu auslosen – verwirft den bisherigen Plan und zieht einen neuen Seed. */
export function redraw(tournament: Tournament, seed = newSeed()): Tournament {
  const { groups, matches } = generatePlan(tournament.config, tournament.players, seed);
  return { ...tournament, seed, groups, matches };
}

export function standingsFor(tournament: Tournament, groupId: string): Standing[] {
  const group = tournament.groups.find((g) => g.id === groupId);
  if (!group) return [];
  const matches = tournament.matches.filter((m) => m.groupId === groupId);
  return computeStandings(group.playerIds, matches, seedOf(tournament.players));
}

export function allStandings(tournament: Tournament): Map<string, Standing[]> {
  return new Map(tournament.groups.map((g) => [g.id, standingsFor(tournament, g.id)]));
}

export function groupPhaseComplete(tournament: Tournament): boolean {
  const groupMatches = tournament.matches.filter((m) => m.phase === 'group');
  return groupMatches.length > 0 && groupMatches.every((m) => Boolean(m.result));
}

/**
 * Startet die KO-Phase: die Gruppenplatzierten werden gesetzt, das Bracket
 * gebaut und im Anschluss an die Gruppenphase terminiert.
 */
export function startKoPhase(tournament: Tournament): Tournament {
  const option = findGroupOption(tournament.config.participants, tournament.config.groupCount);
  const bestThirds = option?.bestThirds ?? 0;

  const { positions } = qualifyFromGroups(
    tournament.groups,
    allStandings(tournament),
    bestThirds,
    seedOf(tournament.players),
  );

  const bracket = buildSingleElimination(positions, { idPrefix: 'ko', phase: 'ko' });
  const third = tournament.config.thirdPlaceMatch ? buildThirdPlaceMatch(bracket, 'ko') : null;
  const koMatches = third ? [...bracket, third] : bracket;

  const groupMatches = tournament.matches.filter((m) => m.phase === 'group');
  const beginAt = estimatedEnd(groupMatches, tournament.config) ?? undefined;
  const scheduled = scheduleMatches(koMatches, tournament.config, { beginAt });

  return { ...tournament, stage: 'ko', matches: [...groupMatches, ...scheduled] };
}

/** Das entscheidende letzte Spiel – je nach Modus Finale, Grand Final oder Rückspiel. */
export function decidingMatch(tournament: Tournament): Match | undefined {
  const { matches } = tournament;
  if (tournament.config.format === 'double_ko') {
    const resolver = new Resolver(matches);
    if (isBracketResetNeeded(matches, resolver)) return matches.find((m) => m.phase === 'gf_reset');
    return matches.find((m) => m.phase === 'gf');
  }
  const ko = matches.filter((m) => m.phase === 'ko');
  if (!ko.length) return undefined;
  const last = Math.max(...ko.map((m) => m.round));
  return ko.find((m) => m.round === last);
}

export function tournamentComplete(tournament: Tournament): boolean {
  const deciding = decidingMatch(tournament);
  if (!deciding?.result) return false;
  if (tournament.config.thirdPlaceMatch) {
    const third = tournament.matches.find((m) => m.phase === 'third');
    if (third && !third.result) return false;
  }
  return true;
}

/**
 * Endplatzierung. Rang 1 und 2 kommen aus dem entscheidenden Spiel, Rang 3 aus
 * dem Spiel um Platz 3 bzw. aus der Verliererrunde. Alle übrigen Spieler teilen
 * sich den Rang der Runde, in der sie ausgeschieden sind (Viertelfinale → 5.).
 */
export function computeFinalRanking(tournament: Tournament): FinalRank[] {
  const resolver = new Resolver(tournament.matches);
  const ranks = new Map<string, number>();
  const assign = (playerId: string | undefined, rank: number) => {
    if (playerId && !ranks.has(playerId)) ranks.set(playerId, rank);
  };
  const playerOf = (r: ReturnType<Resolver['winner']>) => (r.kind === 'player' ? r.playerId : undefined);

  const deciding = decidingMatch(tournament);
  if (deciding) {
    assign(playerOf(resolver.winner(deciding.id)), 1);
    assign(playerOf(resolver.loser(deciding.id)), 2);
  }

  const third = tournament.matches.find((m) => m.phase === 'third');
  if (third?.result) {
    assign(playerOf(resolver.winner(third.id)), 3);
    assign(playerOf(resolver.loser(third.id)), 4);
  }

  if (tournament.config.format === 'double_ko') {
    const lb = tournament.matches.filter((m) => m.phase === 'lb');
    const lastLbRound = lb.length ? Math.max(...lb.map((m) => m.round)) : 0;
    // Wer in der Verliererrunde ausscheidet, landet hinter allen, die dort
    // später ausgeschieden sind – der Verlierer des LB-Finales wird Dritter.
    for (let round = lastLbRound; round >= 1; round--) {
      const rank = 3 + lb.filter((m) => m.round > round).length;
      for (const match of lb.filter((m) => m.round === round)) {
        assign(playerOf(resolver.loser(match.id)), rank);
      }
    }
  } else {
    const ko = tournament.matches.filter((m) => m.phase === 'ko');
    const finalRound = ko.length ? Math.max(...ko.map((m) => m.round)) : 0;
    for (let round = finalRound; round >= 1; round--) {
      const inRound = ko.filter((m) => m.round === round);
      const rank = inRound.length + 1;
      for (const match of inRound) assign(playerOf(resolver.loser(match.id)), rank);
    }
  }

  // Wer die KO-Phase verpasst hat, wird nach seinem Gruppenplatz einsortiert:
  // alle Gruppendritten teilen sich einen Rang, alle Vierten den nächsten usw.
  if (tournament.config.format === 'groups') {
    const standings = allStandings(tournament);
    const remaining: Array<{ playerId: string; groupRank: number }> = [];
    for (const rows of standings.values()) {
      for (const row of rows) {
        if (!ranks.has(row.playerId)) remaining.push({ playerId: row.playerId, groupRank: row.rank });
      }
    }

    remaining.sort((a, b) => a.groupRank - b.groupRank);
    let rank = ranks.size + 1;
    let tierStart = rank;
    let tier = remaining[0]?.groupRank;
    for (const entry of remaining) {
      if (entry.groupRank !== tier) {
        tier = entry.groupRank;
        tierStart = rank;
      }
      assign(entry.playerId, tierStart);
      rank++;
    }
  }

  // Sicherheitsnetz: niemand bleibt ohne Platzierung.
  const lastRank = tournament.players.length;
  for (const player of tournament.players) assign(player.id, lastRank);

  return [...ranks.entries()]
    .map(([playerId, rank]) => ({ playerId, rank }))
    .sort((a, b) => a.rank - b.rank);
}

export function finishTournament(tournament: Tournament): Tournament {
  return {
    ...tournament,
    stage: 'finished',
    finishedAt: new Date().toISOString(),
    finalRanking: computeFinalRanking(tournament),
  };
}
