import type { TournamentConfig } from './types';

export const MIN_PARTICIPANTS = 1;
export const MAX_PARTICIPANTS = 128;
/** Eine einzelne Gruppe ist nur bis zu dieser Teilnehmerzahl sinnvoll. */
export const MIN_SINGLE_GROUP = 3;
export const MAX_SINGLE_GROUP = 10;

export interface ValidationIssue {
  level: 'error' | 'warning';
  field: string;
  message: string;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

export function isPowerOfTwo(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}

export interface GroupOption {
  groupCount: number;
  groupSize: number;
  /** Anzahl der Qualifikanten für die KO-Phase (immer eine Zweierpotenz). */
  qualifiers: number;
  /** Wie viele Gruppendritte zusätzlich weiterkommen. */
  bestThirds: number;
}

/**
 * Alle zulässigen Gruppen-Kombinationen für eine Teilnehmerzahl.
 *
 * Regel: `qualifiers = 2 * groupCount + bestThirds`, wobei `bestThirds` genau
 * die Lücke zur nächsten Zweierpotenz füllt und nicht größer als die
 * Gruppenanzahl sein darf. Diese eine Regel deckt alle geforderten Fälle ab –
 * 8/2, 16/4, 32/8, 64/16 (ohne Dritte) sowie 12/3, 24/6, 48/12 (mit Dritten).
 */
export function groupOptions(participants: number): GroupOption[] {
  const options: GroupOption[] = [];

  // Einzelgruppe: jeder gegen jeden. Danach entweder ein Finale der beiden
  // Erstplatzierten oder – je nach Einstellung – gar keine KO-Runde.
  if (participants >= MIN_SINGLE_GROUP && participants <= MAX_SINGLE_GROUP) {
    options.push({ groupCount: 1, groupSize: participants, qualifiers: 2, bestThirds: 0 });
  }

  if (participants > 64 || participants < 4) return options;

  for (let groupCount = 2; groupCount <= participants / 3; groupCount++) {
    if (participants % groupCount !== 0) continue;
    const groupSize = participants / groupCount;
    // Bei weniger als 3 Spielern pro Gruppe wäre die Gruppenphase sinnlos,
    // weil ohnehin alle weiterkämen.
    if (groupSize < 3) continue;

    const direct = 2 * groupCount;
    const qualifiers = nextPowerOfTwo(direct);
    const bestThirds = qualifiers - direct;

    // Es kann höchstens ein Dritter je Gruppe nachrücken.
    if (bestThirds > groupCount) continue;
    if (qualifiers > participants || qualifiers < 2) continue;

    options.push({ groupCount, groupSize, qualifiers, bestThirds });
  }
  return options;
}

export function findGroupOption(
  participants: number,
  groupCount: number,
): GroupOption | undefined {
  return groupOptions(participants).find((o) => o.groupCount === groupCount);
}

/** Anzahl der KO-Runden, abgeleitet aus der Zahl der Qualifikanten. */
export function koRoundCount(qualifiers: number): number {
  return Math.log2(nextPowerOfTwo(qualifiers));
}

/** "Viertelfinale", "Halbfinale", … – benannt nach der Anzahl der Spiele. */
export function roundName(matchesInRound: number): string {
  switch (matchesInRound) {
    case 1:
      return 'Finale';
    case 2:
      return 'Halbfinale';
    case 4:
      return 'Viertelfinale';
    case 8:
      return 'Achtelfinale';
    case 16:
      return 'Sechzehntelfinale';
    default:
      return `Runde der letzten ${matchesInRound * 2}`;
  }
}

/** Alle Rundennamen einer KO-Phase, von der ersten Runde bis zum Finale. */
export function roundNames(qualifiers: number): string[] {
  const size = nextPowerOfTwo(qualifiers);
  const names: string[] = [];
  for (let matches = size / 2; matches >= 1; matches /= 2) {
    names.push(roundName(matches));
  }
  return names;
}

export function validateConfig(
  config: TournamentConfig,
  playerCount: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { participants, format, groupCount, groupSize } = config;

  if (!Number.isInteger(participants) || participants < MIN_PARTICIPANTS || participants > MAX_PARTICIPANTS) {
    issues.push({
      level: 'error',
      field: 'participants',
      message: `Die Teilnehmerzahl muss zwischen ${MIN_PARTICIPANTS} und ${MAX_PARTICIPANTS} liegen.`,
    });
  } else if (participants < 2) {
    issues.push({
      level: 'error',
      field: 'participants',
      message: 'Für ein Turnier werden mindestens 2 Teilnehmer benötigt.',
    });
  }

  if (config.fields < 1) {
    issues.push({ level: 'error', field: 'fields', message: 'Es wird mindestens ein Spielfeld benötigt.' });
  }
  if (config.avgMatchMinutes < 1) {
    issues.push({
      level: 'error',
      field: 'avgMatchMinutes',
      message: 'Die durchschnittliche Spieldauer muss mindestens 1 Minute betragen.',
    });
  }
  if (!/^\d{1,2}:\d{2}$/.test(config.startTime)) {
    issues.push({ level: 'error', field: 'startTime', message: 'Die Startzeit muss im Format HH:MM angegeben werden.' });
  }

  const legs = config.sport === 'dart' ? config.dart.legs[config.dart.game] : config.cornhole.legs;
  if (legs < 1) {
    issues.push({ level: 'error', field: 'legs', message: 'Die Anzahl der Legs muss mindestens 1 betragen.' });
  }

  if (format === 'groups') {
    if (participants === 128) {
      issues.push({
        level: 'error',
        field: 'participants',
        message: '128 Teilnehmer sind im Gruppenmodus nicht möglich.',
      });
    } else if (groupCount * groupSize !== participants) {
      issues.push({
        level: 'error',
        field: 'groupCount',
        message: `Gruppenanzahl × Gruppenstärke (${groupCount} × ${groupSize} = ${groupCount * groupSize}) muss der Teilnehmerzahl (${participants}) entsprechen.`,
      });
    } else {
      const option = findGroupOption(participants, groupCount);
      if (!option) {
        const alternatives = groupOptions(participants);
        issues.push({
          level: 'error',
          field: 'groupCount',
          message: alternatives.length
            ? `Aus ${groupCount} Gruppen ergibt sich keine gültige KO-Runde. Möglich sind: ${alternatives
                .map((o) => `${o.groupCount} Gruppen à ${o.groupSize}`)
                .join(', ')}.`
            : `Für ${participants} Teilnehmer gibt es keine gültige Gruppeneinteilung.`,
        });
      }
    }
  }

  if (playerCount !== participants) {
    issues.push({
      level: 'warning',
      field: 'players',
      message: `Es sind ${playerCount} Spieler erfasst, konfiguriert sind ${participants} Teilnehmer.`,
    });
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}
