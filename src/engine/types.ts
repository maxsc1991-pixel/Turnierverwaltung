export type Sport = 'dart' | 'cornhole';

export type Format = 'single_ko' | 'double_ko' | 'groups';

/**
 * `wb`/`lb`/`gf`/`gf_reset` are the doppel-KO phases, `ko` is a plain single
 * elimination bracket (also used for the KO stage after a group phase).
 */
export type Phase = 'group' | 'ko' | 'wb' | 'lb' | 'gf' | 'gf_reset' | 'third';

export type DartGame = '301' | '501' | 'cricket';

export interface Player {
  id: string;
  name: string;
  club?: string;
  /** Setzlistenposition, 1-basiert. Bestimmt Freilose und die Auslosung. */
  seed: number;
}

/**
 * Ein Slot ist entweder ein konkreter Spieler oder ein Platzhalter, der sich
 * beim Fortschreiten des Turniers auflöst. Dadurch ist der Turnierfortschritt
 * reiner Datenfluss: Ergebnis eintragen -> abhängige Slots lösen sich auf.
 */
export type Slot =
  | { kind: 'player'; playerId: string }
  | { kind: 'winnerOf'; matchId: string }
  | { kind: 'loserOf'; matchId: string }
  | { kind: 'groupRank'; groupId: string; rank: number }
  | { kind: 'bye' };

export interface MatchResult {
  legsA: number;
  legsB: number;
  /** Nur bei Cornhole und bei Best of 1 erfasst (z.B. 1:0 (21:17)). */
  pointsA?: number;
  pointsB?: number;
}

export interface Match {
  id: string;
  phase: Phase;
  /** 1-basierte Runde innerhalb der Phase. */
  round: number;
  indexInRound: number;
  groupId?: string;
  /** Bezeichnung des einzelnen Spiels, z.B. "Viertelfinale 2". */
  label: string;
  /** Bezeichnung der ganzen Runde, z.B. "Viertelfinale" – Spaltentitel im Bracket. */
  roundLabel: string;
  a: Slot;
  b: Slot;
  /** 1-basierte Spielfeldnummer. */
  field?: number;
  /** ISO-Zeitstempel der geplanten Startzeit. */
  scheduledAt?: string;
  result?: MatchResult;
}

export interface Group {
  id: string;
  name: string;
  playerIds: string[];
  /**
   * Festes Spielfeld für die ganze Gruppe. Ist es gesetzt, laufen alle Spiele
   * dieser Gruppe nacheinander auf diesem Feld. Ohne Angabe verteilt der
   * Spielplan die Partien automatisch.
   */
  field?: number;
}

export interface DartSettings {
  game: DartGame;
  /** Best of N je Spielart – getrennt gespeichert, aktiv ist nur `game`. */
  legs: Record<DartGame, number>;
}

export interface CornholeSettings {
  legs: number;
  targetPoints: number;
}

/**
 * Abweichende Einstellungen für die KO-Phase. Werden auf der KO-Konfigurations-
 * seite erfasst, wenn die Gruppenphase abgeschlossen ist.
 */
export interface KoSettings {
  avgMatchMinutes: number;
  /** Best of N für die KO-Spiele. */
  legs: number;
  fields: number;
  /** "19:30" – leer bedeutet: direkt im Anschluss an die Gruppenphase. */
  startTime?: string;
}

export interface TournamentConfig {
  name: string;
  sport: Sport;
  format: Format;
  /** "18:00" */
  startTime: string;
  /** Durchschnittliche Spieldauer in Minuten. */
  avgMatchMinutes: number;
  /** Anzahl parallel bespielbarer Boards / Bahnen. */
  fields: number;
  participants: number;
  groupCount: number;
  groupSize: number;
  thirdPlaceMatch: boolean;
  /**
   * Nur bei genau einer Gruppe relevant: Spielen die beiden Erstplatzierten
   * anschließend ein Finale, oder entscheidet allein die Tabelle?
   */
  groupFinal: boolean;
  dart: DartSettings;
  cornhole: CornholeSettings;
}

export type Stage = 'draft' | 'plan' | 'group' | 'ko' | 'finished';

export interface FinalRank {
  playerId: string;
  rank: number;
}

export interface Tournament {
  id: string;
  createdAt: string;
  finishedAt?: string;
  config: TournamentConfig;
  players: Player[];
  /** Seed der Auslosung – macht jede Auslosung reproduzierbar. */
  seed: number;
  groups: Group[];
  matches: Match[];
  stage: Stage;
  finalRanking?: FinalRank[];
  /** Einstellungen der KO-Phase, sobald sie gestartet wurde. */
  ko?: KoSettings;
}

export interface Standing {
  playerId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  legsFor: number;
  legsAgainst: number;
  legDiff: number;
  /** Erzielte Punkte – beim Cornhole Teil der Wertung. */
  pointsFor: number;
  pointsAgainst: number;
  pointsDiff: number;
  rank: number;
  /** Gesetzt, wenn die Platzierung erst durch ein späteres Kriterium fiel. */
  tiebreak?: string;
}

export type MatchStatus = 'pending' | 'ready' | 'done';

export function defaultConfig(): TournamentConfig {
  return {
    name: '',
    sport: 'dart',
    format: 'groups',
    startTime: '18:00',
    avgMatchMinutes: 15,
    fields: 2,
    participants: 16,
    groupCount: 4,
    groupSize: 4,
    thirdPlaceMatch: true,
    groupFinal: true,
    dart: { game: '501', legs: { '301': 3, '501': 3, cricket: 3 } },
    cornhole: { legs: 3, targetPoints: 21 },
  };
}

/** Best of N für die aktuell konfigurierte Sportart. */
export function bestOf(config: TournamentConfig): number {
  return config.sport === 'dart' ? config.dart.legs[config.dart.game] : config.cornhole.legs;
}

/** Legs, die zum Sieg nötig sind (Best of 3 -> 2). */
export function legsToWin(config: TournamentConfig): number {
  return Math.floor(bestOf(config) / 2) + 1;
}

/** Unentschieden ist nur bei geradem Best of möglich (Best of 2 -> 1:1). */
export function drawPossible(config: TournamentConfig): boolean {
  return bestOf(config) % 2 === 0;
}

/**
 * Punkte müssen zusätzlich zu den Legs erfasst werden: bei Cornhole immer,
 * bei Dart nur wenn das Spiel über ein einzelnes Leg entschieden wird.
 */
export function requiresPoints(config: TournamentConfig): boolean {
  return config.sport === 'cornhole' || bestOf(config) === 1;
}

/** Folgt auf die Gruppenphase überhaupt eine KO-Runde? */
export function hasKoPhase(config: TournamentConfig): boolean {
  if (config.format !== 'groups') return true;
  return config.groupCount > 1 || config.groupFinal;
}

/**
 * Die für eine Phase geltende Konfiguration. In der KO-Phase überschreiben die
 * dort erfassten Werte Spieldauer, Felder und Leg-Anzahl – alles Weitere bleibt
 * unverändert, sodass jede bestehende Auswertung unverändert weiterarbeitet.
 */
export function applyKoSettings(config: TournamentConfig, ko: KoSettings | undefined): TournamentConfig {
  if (!ko) return config;
  const base: TournamentConfig = {
    ...config,
    avgMatchMinutes: ko.avgMatchMinutes,
    fields: ko.fields,
    startTime: ko.startTime || config.startTime,
  };
  if (config.sport === 'dart') {
    return { ...base, dart: { ...config.dart, legs: { ...config.dart.legs, [config.dart.game]: ko.legs } } };
  }
  return { ...base, cornhole: { ...config.cornhole, legs: ko.legs } };
}

export const DART_GAME_LABEL: Record<DartGame, string> = {
  '301': '301 Double Out',
  '501': '501 Double Out',
  cricket: 'Cricket',
};

export const SPORT_LABEL: Record<Sport, string> = {
  dart: 'Dart',
  cornhole: 'Cornhole',
};

export const FORMAT_LABEL: Record<Format, string> = {
  single_ko: 'Single KO',
  double_ko: 'Doppel-KO',
  groups: 'Gruppenphase + KO',
};
