import { buildSingleElimination, buildThirdPlaceMatch, seedIntoBracket } from './bracket';
import { buildDoubleElimination } from './doubleKo';
import {
  applyKoSettings,
  bestOf,
  hasKoPhase,
  withLegs,
  type KoRoundSetting,
  type KoSettings,
  type Match,
  type Slot,
  type Tournament,
  type TournamentConfig,
} from './types';
import { findGroupOption } from './validation';

/**
 * Leg-Anzahl und Spieldauer je KO-Runde.
 *
 * Die KO-Phase spielt nicht zwingend überall dasselbe Format: das
 * Sechzehntelfinale kann Best of 1 sein und das Finale Best of 7. Gespeichert
 * wird das in `config.koRounds`, mit dem `roundLabel` des Spiels als Schlüssel –
 * also genau dem Namen, den der Turnierleiter sieht („Halbfinale",
 * „Siegerrunde · Runde 2"). Eine Rundennummer wäre kein brauchbarer Schlüssel,
 * weil im Doppel-KO Sieger- und Verliererrunde beide bei 1 anfangen.
 *
 * **Aufgelöst wird ausschließlich hier.** Wer `config.koRounds` direkt liest,
 * übersieht die Vererbung: was eine Runde nicht selbst setzt, erbt sie von der
 * Vorgabe der KO-Phase (`Tournament.ko`) und die wiederum von der
 * Turnierkonfiguration. `configForMatch()` ist der einzige richtige Weg von
 * einem Spiel zu seiner geltenden Konfiguration.
 */

export interface RoundSetting {
  /** Bezeichnung der Runde – zugleich der Schlüssel in `config.koRounds`. */
  label: string;
  legs: number;
  minutes: number;
  /** Weicht diese Runde von der Vorgabe ab? */
  custom: boolean;
}

/** Vorgabe der KO-Phase: eigene Werte, sonst die der Turnierkonfiguration. */
function koDefaults(config: TournamentConfig, ko: KoSettings | undefined) {
  const base = applyKoSettings(config, ko);
  return { legs: bestOf(base), minutes: base.avgMatchMinutes };
}

/**
 * Vorschlag für die Spieldauer, wenn eine Runde eine andere Leg-Anzahl spielt
 * als die Vorgabe. Maßstab sind die Legs **bis zum Sieg** – ein Best of 7 ist
 * mit vier Gewinnlegs doppelt so lang wie ein Best of 3 mit zweien, während
 * die reine Leg-Zahl (7 statt 3) deutlich zu hoch gegriffen wäre.
 *
 * Der Wert ist nur die Vorbelegung: wer weiß, dass das Finale bei ihm länger
 * dauert, trägt seine Minuten ein und die gelten.
 */
function suggestedMinutes(fallbackLegs: number, fallbackMinutes: number, legs: number): number {
  if (legs === fallbackLegs) return fallbackMinutes;
  const perLeg = fallbackMinutes / Math.max(1, Math.floor(fallbackLegs / 2) + 1);
  return Math.max(1, Math.round(perLeg * (Math.floor(legs / 2) + 1)));
}

/** Geltende Werte einer Runde. */
export function roundSetting(
  config: TournamentConfig,
  ko: KoSettings | undefined,
  label: string,
): RoundSetting {
  const fallback = koDefaults(config, ko);
  const own = config.koRounds?.[label];
  const legs = own?.legs ?? fallback.legs;
  return {
    label,
    legs,
    minutes: own?.minutes ?? suggestedMinutes(fallback.legs, fallback.minutes, legs),
    custom: own?.legs !== undefined || own?.minutes !== undefined,
  };
}

/**
 * Die geltende Konfiguration eines Spiels. Gruppenspiele behalten die
 * Turnierkonfiguration, KO-Spiele bekommen die Werte ihrer Runde.
 */
export function configForMatch(tournament: Tournament, match: Match): TournamentConfig {
  if (match.phase === 'group') return tournament.config;
  const base = applyKoSettings(tournament.config, tournament.ko);
  const setting = roundSetting(tournament.config, tournament.ko, match.roundLabel);
  return withLegs({ ...base, avgMatchMinutes: setting.minutes }, setting.legs);
}

/** Geplante Dauer eines Spiels in Minuten – Grundlage des Zeitrasters. */
export function minutesForMatch(tournament: Tournament, match: Match): number {
  if (match.phase === 'group') return tournament.config.avgMatchMinutes;
  return roundSetting(tournament.config, tournament.ko, match.roundLabel).minutes;
}

/**
 * Dieselbe Auskunft für einen Spielplan, der noch zu keinem Turnier gehört –
 * etwa beim Erzeugen des Plans, wo `Tournament` noch nicht existiert.
 */
export function minutesForPlannedMatch(
  config: TournamentConfig,
  ko: KoSettings | undefined,
  match: Match,
): number {
  if (match.phase === 'group') return config.avgMatchMinutes;
  return roundSetting(config, ko, match.roundLabel).minutes;
}

const placeholders = (count: number): Slot[] =>
  Array.from({ length: count }, (_, i) => ({ kind: 'player' as const, playerId: `vorschau-${i}` }));

/** Wie viele Spieler in den KO-Baum einziehen. */
function bracketEntries(config: TournamentConfig): number {
  if (config.format !== 'groups') return config.participants;
  const option = findGroupOption(config.participants, config.groupCount);
  return option?.qualifiers ?? 0;
}

/**
 * Alle KO-Runden einer Konfiguration in Spielreihenfolge.
 *
 * Ermittelt wird das, indem derselbe Baum mit Platzhaltern gebaut wird, den das
 * Turnier später bekommt. Die Rundennamen aus einer zweiten Quelle abzuleiten
 * hieße, die Namensgebung an zwei Stellen zu pflegen – und im Doppel-KO wäre
 * sie schlicht nicht nachzubauen.
 */
export function koRoundLabels(config: TournamentConfig): string[] {
  if (config.format === 'groups' && !hasKoPhase(config)) return [];

  const count = bracketEntries(config);
  if (count < 2) return [];

  const matches =
    config.format === 'double_ko'
      ? buildDoubleElimination(placeholders(count))
      : koBracket(config, count);

  const labels: string[] = [];
  for (const match of matches) {
    if (!labels.includes(match.roundLabel)) labels.push(match.roundLabel);
  }
  return labels;
}

function koBracket(config: TournamentConfig, count: number): Match[] {
  // Aus der Gruppenphase ziehen genau `qualifiers` Spieler ein – eine
  // Zweierpotenz, die nicht mehr gesetzt werden muss.
  const positions =
    config.format === 'groups' ? placeholders(count) : seedIntoBracket(placeholders(count));
  const bracket = buildSingleElimination(positions, { idPrefix: 'ko', phase: 'ko' });
  const third = config.thirdPlaceMatch ? buildThirdPlaceMatch(bracket, 'ko') : null;
  return third ? [...bracket, third] : bracket;
}

/** Die Runden samt geltenden Werten – Grundlage der Tabellen in der Oberfläche. */
export function roundSettings(
  config: TournamentConfig,
  ko?: KoSettings,
  labels = koRoundLabels(config),
): RoundSetting[] {
  return labels.map((label) => roundSetting(config, ko, label));
}

/**
 * Kurzfassung für Kopfzeilen: „Best of 3", oder „Best of 1–7", wenn die Runden
 * sich unterscheiden. Eine einzelne Zahl wäre dort schlicht falsch.
 */
export function legsSummary(rounds: readonly RoundSetting[], fallbackLegs: number): string {
  if (!rounds.length) return `Best of ${fallbackLegs}`;
  const legs = rounds.map((r) => r.legs);
  const min = Math.min(...legs);
  const max = Math.max(...legs);
  return min === max ? `Best of ${min}` : `Best of ${min}–${max}`;
}

/**
 * Runden, die schon angefangen haben. Ihre Leg-Anzahl darf nicht mehr geändert
 * werden: ein 2:1 aus einem Best of 3 wäre in einem Best of 1 kein gültiges
 * Ergebnis mehr.
 */
export function startedRounds(tournament: Tournament): Set<string> {
  const started = new Set<string>();
  for (const match of tournament.matches) {
    if (match.phase !== 'group' && match.result) started.add(match.roundLabel);
  }
  return started;
}

/**
 * Setzt die Abweichung einer Runde. Ein Wert `undefined` heißt „erbt die
 * Vorgabe"; bleibt davon nichts übrig, verschwindet der Eintrag ganz – sonst
 * sammeln sich im gespeicherten Turnier Einträge an, die nichts bewirken.
 */
export function withRoundSetting(
  rounds: Record<string, KoRoundSetting> | undefined,
  label: string,
  patch: KoRoundSetting,
): Record<string, KoRoundSetting> | undefined {
  const next = { ...(rounds ?? {}) };
  const merged: KoRoundSetting = { ...next[label], ...patch };
  if (merged.legs === undefined && merged.minutes === undefined) delete next[label];
  else next[label] = merged;
  return Object.keys(next).length ? next : undefined;
}

/** Rundenbezeichnungen eines bestehenden Turniers, in Spielreihenfolge. */
export function koRoundLabelsOf(tournament: Tournament): string[] {
  const labels: string[] = [];
  for (const match of tournament.matches) {
    if (match.phase === 'group') continue;
    if (!labels.includes(match.roundLabel)) labels.push(match.roundLabel);
  }
  return labels;
}
