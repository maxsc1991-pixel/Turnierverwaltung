import type { Player } from './types';

let counter = 0;

export function newPlayerId(): string {
  counter += 1;
  return `p-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export interface ParsedPlayer {
  name: string;
  club?: string;
}

/**
 * Zerlegt eine Sammel-Eingabe in einzelne Spieler. Getrennt wird nach Komma,
 * Semikolon und Zeilenumbruch. Der Verein darf in Klammern oder nach einem
 * Trennzeichen angehängt werden:
 *
 *   "Max Mustermann (Lok Pfalzel), Anna Schmitt; Tim Weber - DC Trier"
 */
export function parsePlayerList(input: string): ParsedPlayer[] {
  return input
    .split(/[,;\n\r]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const bracket = chunk.match(/^(.+?)\s*[([]\s*(.+?)\s*[)\]]$/);
      if (bracket) return { name: bracket[1].trim(), club: bracket[2].trim() || undefined };

      const dash = chunk.match(/^(.+?)\s+[-–|]\s+(.+)$/);
      if (dash) return { name: dash[1].trim(), club: dash[2].trim() || undefined };

      return { name: chunk };
    })
    .filter((p) => p.name.length > 0);
}

/** Vergibt die Setzlistenpositionen neu (1-basiert, in Listenreihenfolge). */
export function reseed(players: readonly Player[]): Player[] {
  return players.map((player, index) => ({ ...player, seed: index + 1 }));
}

export function playerName(players: readonly Player[], playerId: string | undefined): string {
  if (!playerId) return '–';
  return players.find((p) => p.id === playerId)?.name ?? '–';
}

export function findDuplicateNames(players: readonly Player[]): string[] {
  const seen = new Map<string, number>();
  for (const player of players) {
    const key = player.name.trim().toLocaleLowerCase('de-DE');
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([key]) => key);
}
