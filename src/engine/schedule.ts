import type { Group, Match, Phase, TournamentConfig } from './types';
import { Resolver } from './resolve';

const PHASE_ORDER: Record<Phase, number> = {
  group: 0,
  wb: 1,
  lb: 2,
  ko: 3,
  third: 4,
  gf: 5,
  gf_reset: 6,
};

/** "18:00" am heutigen Tag – das Turnier läuft an einem Abend. */
export function startDate(startTime: string, base = new Date()): Date {
  const [hours, minutes] = startTime.split(':').map((v) => Number.parseInt(v, 10));
  const date = new Date(base);
  date.setHours(Number.isFinite(hours) ? hours : 18, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date;
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return '–';
  const date = new Date(iso);
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function dependencies(match: Match): string[] {
  const ids: string[] = [];
  for (const slot of [match.a, match.b]) {
    if (slot.kind === 'winnerOf' || slot.kind === 'loserOf') ids.push(slot.matchId);
  }
  return ids;
}

/**
 * Ordnet jeder Gruppe ihr festes Spielfeld zu. Werte außerhalb der vorhandenen
 * Felder werden verworfen, damit ein veraltetes Feld kein Spiel unplanbar macht.
 */
export function groupFieldMap(
  groups: readonly Group[],
  fieldCount: number,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const group of groups) {
    if (group.field !== undefined && group.field >= 1 && group.field <= fieldCount) {
      map.set(group.id, group.field);
    }
  }
  return map;
}

/**
 * Verteilt die Spiele auf Spielfelder und Zeitslots.
 *
 * Verfahren: für jeden Zeitslot werden die Felder nacheinander mit dem
 * spielbereiten Spiel belegt, dessen Spieler am längsten pausiert haben. Damit
 * entstehen weder Doppelbelegungen noch lange Wartezeiten für einzelne Spieler.
 * Spiele, die noch auf Vorspiele warten, werden erst danach eingeplant.
 *
 * Ist einer Gruppe ein festes Feld zugewiesen, laufen ihre Spiele ausschließlich
 * dort – und damit zwangsläufig nacheinander. Die übrigen Partien weichen auf
 * die nicht vergebenen Felder aus.
 *
 * Bei Hin- und Rückrunde laufen die Runden einer Gruppe der Reihe nach – eine
 * Runde beginnt erst, wenn jedes Spiel der Runde davor terminiert ist. Daraus
 * folgt beides: die Rückrunde beginnt erst nach der kompletten Hinrunde, und
 * zwischen Hin- und Rückspiel einer Paarung liegen alle übrigen Runden.
 */
export function scheduleMatches(
  matches: readonly Match[],
  config: TournamentConfig,
  options: { beginAt?: Date; groupFields?: Map<string, number> } = {},
): Match[] {
  const resolver = new Resolver(matches);
  const byId = new Map(matches.map((m) => [m.id, m]));
  const fields = Math.max(1, config.fields);
  const slotMinutes = Math.max(1, config.avgMatchMinutes);
  const begin = options.beginAt ?? startDate(config.startTime);

  const groupFields = options.groupFields ?? new Map<string, number>();
  const reserved = new Set(groupFields.values());

  /**
   * Ein Spiel einer festgelegten Gruppe gehört auf genau ihr Feld. Alle übrigen
   * Spiele meiden die vergebenen Felder – es sei denn, es sind alle vergeben,
   * dann zählt nur noch, dass überhaupt gespielt werden kann.
   */
  const fits = (match: Match, field: number): boolean => {
    const pinned = match.groupId ? groupFields.get(match.groupId) : undefined;
    if (pinned !== undefined) return pinned === field;
    if (reserved.size === 0 || reserved.size >= fields) return true;
    return !reserved.has(field);
  };

  // Freilos-Spiele werden nie gespielt und belegen daher kein Feld.
  const playable = matches.filter((m) => !resolver.isWalkover(m));
  const scheduledSlot = new Map<string, number>();
  const lastPlayed = new Map<string, number>();
  const pending = new Set(playable.map((m) => m.id));
  const output = new Map<string, { field: number; scheduledAt: string }>();

  const depsReady = (match: Match, slot: number): boolean =>
    dependencies(match).every((id) => {
      const dep = byId.get(id);
      if (!dep) return true;
      if (resolver.isWalkover(dep)) return true;
      const depSlot = scheduledSlot.get(id);
      return depSlot !== undefined && depSlot < slot;
    });

  const restScore = (match: Match, slot: number): { min: number; total: number } => {
    const players = resolver.playerIds(match);
    if (!players.length) return { min: Number.MAX_SAFE_INTEGER, total: Number.MAX_SAFE_INTEGER };
    const rests = players.map((id) => slot - (lastPlayed.get(id) ?? -Infinity));
    return { min: Math.min(...rests), total: rests.reduce((a, b) => a + b, 0) };
  };

  // Die Runden einer Gruppe laufen der Reihe nach: eine Runde wird erst
  // freigegeben, wenn jedes Spiel der Runde davor einen früheren Termin hat.
  // Ohne diese Regel wählt der Planer allein nach Pausenzeit – und zieht damit
  // ausgerechnet das Rückspiel der zuletzt gespielten Paarung vor, weil genau
  // deren beide Spieler am längsten pausiert haben.
  // Nur bei Hin- und Rückrunde: ohne Wiederholung gibt es nichts vorzuziehen,
  // und die Reihenfolge zu erzwingen würde dort nur Felder leer lassen.
  const hasReturnLeg = playable.some((m) => m.leg === 2);
  const roundsByGroup = new Map<string, Map<number, string[]>>();
  for (const match of hasReturnLeg ? playable : []) {
    if (match.phase !== 'group' || !match.groupId) continue;
    const rounds = roundsByGroup.get(match.groupId) ?? new Map<number, string[]>();
    rounds.set(match.round, [...(rounds.get(match.round) ?? []), match.id]);
    roundsByGroup.set(match.groupId, rounds);
  }

  const previousRound = new Map<string, string[]>();
  for (const rounds of roundsByGroup.values()) {
    const numbers = [...rounds.keys()].sort((a, b) => a - b);
    numbers.forEach((number, index) => {
      if (index === 0) return;
      const before = rounds.get(numbers[index - 1]) ?? [];
      for (const id of rounds.get(number) ?? []) previousRound.set(id, before);
    });
  }

  const roundReady = (match: Match, slot: number): boolean =>
    (previousRound.get(match.id) ?? []).every((id) => {
      const before = scheduledSlot.get(id);
      return before !== undefined && before < slot;
    });

  const maxSlots = playable.length + 2;
  for (let slot = 0; slot < maxSlots && pending.size > 0; slot++) {
    const busy = new Set<string>();

    for (let field = 1; field <= fields; field++) {
      let best: Match | undefined;
      let bestScore = { min: -Infinity, total: -Infinity };

      for (const id of pending) {
        const match = byId.get(id) as Match;
        if (!fits(match, field)) continue;
        if (!depsReady(match, slot)) continue;
        if (!roundReady(match, slot)) continue;
        const players = resolver.playerIds(match);
        if (players.some((p) => busy.has(p))) continue;

        const score = restScore(match, slot);
        const better =
          !best ||
          score.min > bestScore.min ||
          (score.min === bestScore.min && score.total > bestScore.total) ||
          (score.min === bestScore.min &&
            score.total === bestScore.total &&
            compareMatches(match, best) < 0);

        if (better) {
          best = match;
          bestScore = score;
        }
      }

      // Kein "break": ist für dieses Feld gerade nichts spielbar, kann auf einem
      // anderen Feld trotzdem eine Partie anstehen – etwa weil dort eine fest
      // zugewiesene Gruppe spielt.
      if (!best) continue;

      pending.delete(best.id);
      scheduledSlot.set(best.id, slot);
      for (const player of resolver.playerIds(best)) {
        busy.add(player);
        lastPlayed.set(player, slot);
      }
      output.set(best.id, {
        field,
        scheduledAt: new Date(begin.getTime() + slot * slotMinutes * 60_000).toISOString(),
      });
    }
  }

  return matches.map((match) => {
    const assigned = output.get(match.id);
    if (!assigned) return { ...match, field: undefined, scheduledAt: undefined };
    return { ...match, field: assigned.field, scheduledAt: assigned.scheduledAt };
  });
}

function compareMatches(x: Match, y: Match): number {
  const phase = PHASE_ORDER[x.phase] - PHASE_ORDER[y.phase];
  if (phase !== 0) return phase;
  if (x.round !== y.round) return x.round - y.round;
  return x.indexInRound - y.indexInRound;
}

export interface ScheduleConflict {
  field: number;
  scheduledAt: string;
  matches: Match[];
}

/**
 * Findet Doppelbelegungen – zwei Spiele zur selben Zeit auf demselben Feld.
 * Der automatische Spielplan erzeugt so etwas nie; von Hand geänderte Felder
 * oder Zeiten schon, und dann soll es sichtbar sein.
 */
export function findScheduleConflicts(matches: readonly Match[]): ScheduleConflict[] {
  const buckets = new Map<string, Match[]>();
  for (const match of matches) {
    if (!match.scheduledAt || !match.field) continue;
    const key = `${match.field}|${match.scheduledAt}`;
    buckets.set(key, [...(buckets.get(key) ?? []), match]);
  }

  return [...buckets.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => {
      const [field, scheduledAt] = key.split('|');
      return { field: Number(field), scheduledAt, matches: list };
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** Geschätztes Turnierende auf Basis des letzten geplanten Spiels. */
export function estimatedEnd(matches: readonly Match[], config: TournamentConfig): Date | null {
  const times = matches
    .map((m) => m.scheduledAt)
    .filter((t): t is string => Boolean(t))
    .map((t) => new Date(t).getTime());
  if (!times.length) return null;
  return new Date(Math.max(...times) + config.avgMatchMinutes * 60_000);
}
