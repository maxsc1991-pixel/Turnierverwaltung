import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MatchResult, Player, Tournament, TournamentConfig } from '../engine/types';
import { defaultConfig } from '../engine/types';
import { newPlayerId, parsePlayerList, reseed } from '../engine/players';
import { buildGroupMatches } from '../engine/groups';
import { groupFieldMap, scheduleMatches } from '../engine/schedule';
import {
  createTournament,
  finishTournament,
  redraw,
  startKoPhase,
} from '../engine/tournament';
import { newSeed } from '../engine/rng';

export const STORAGE_KEY = 'tv.state.v1';

export interface ExportPayload {
  version: 1;
  exportedAt: string;
  active: Tournament | null;
  archive: Tournament[];
}

interface AppState {
  config: TournamentConfig;
  players: Player[];
  active: Tournament | null;
  archive: Tournament[];

  setConfig: (patch: Partial<TournamentConfig>) => void;
  resetConfig: () => void;

  addPlayer: (name: string, club?: string) => void;
  addPlayersFromText: (text: string) => number;
  updatePlayer: (id: string, patch: Partial<Pick<Player, 'name' | 'club'>>) => void;
  removePlayer: (id: string) => void;
  movePlayer: (id: string, direction: -1 | 1) => void;
  clearPlayers: () => void;

  generatePlan: () => void;
  redrawPlan: () => void;
  swapPlayers: (playerA: string, playerB: string) => void;
  setGroupField: (groupId: string, field: number | undefined) => void;
  setMatchField: (matchId: string, field: number) => void;
  setMatchTime: (matchId: string, isoTime: string) => void;
  confirmPlan: () => void;

  setResult: (matchId: string, result: MatchResult) => void;
  clearResult: (matchId: string) => void;
  startKo: () => void;
  finish: () => void;

  discardActive: () => void;
  deleteArchived: (id: string) => void;
  importData: (payload: ExportPayload) => void;
}

function updateActive(
  state: AppState,
  fn: (tournament: Tournament) => Tournament,
): Partial<AppState> {
  if (!state.active) return {};
  return { active: fn(state.active) };
}

export const useTournamentStore = create<AppState>()(
  persist(
    (set, get) => ({
      config: defaultConfig(),
      players: [],
      active: null,
      archive: [],

      setConfig: (patch) => set((s) => ({ config: { ...s.config, ...patch } })),
      resetConfig: () => set({ config: defaultConfig() }),

      addPlayer: (name, club) =>
        set((s) => ({
          players: reseed([
            ...s.players,
            { id: newPlayerId(), name: name.trim(), club: club?.trim() || undefined, seed: 0 },
          ]),
        })),

      addPlayersFromText: (text) => {
        const parsed = parsePlayerList(text);
        if (!parsed.length) return 0;
        set((s) => ({
          players: reseed([
            ...s.players,
            ...parsed.map((p) => ({ id: newPlayerId(), name: p.name, club: p.club, seed: 0 })),
          ]),
        }));
        return parsed.length;
      },

      updatePlayer: (id, patch) =>
        set((s) => ({
          players: s.players.map((p) =>
            p.id === id
              ? { ...p, ...patch, club: patch.club !== undefined ? patch.club || undefined : p.club }
              : p,
          ),
        })),

      removePlayer: (id) => set((s) => ({ players: reseed(s.players.filter((p) => p.id !== id)) })),

      movePlayer: (id, direction) =>
        set((s) => {
          const index = s.players.findIndex((p) => p.id === id);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= s.players.length) return {};
          const next = s.players.slice();
          [next[index], next[target]] = [next[target], next[index]];
          return { players: reseed(next) };
        }),

      clearPlayers: () => set({ players: [] }),

      generatePlan: () => {
        const { config, players } = get();
        set({ active: createTournament(config, players) });
      },

      redrawPlan: () => set((s) => updateActive(s, (t) => redraw(t, newSeed()))),

      /**
       * Tauscht zwei Spieler im Plan. In der Gruppenphase werden die
       * Gruppenspiele danach neu erzeugt und terminiert, im KO-Modus werden
       * lediglich die beiden Bracket-Plätze getauscht.
       */
      swapPlayers: (playerA, playerB) =>
        set((s) =>
          updateActive(s, (t) => {
            if (playerA === playerB) return t;

            if (t.config.format === 'groups') {
              const groups = t.groups.map((group) => ({
                ...group,
                playerIds: group.playerIds.map((id) =>
                  id === playerA ? playerB : id === playerB ? playerA : id,
                ),
              }));
              return {
                ...t,
                groups,
                matches: scheduleMatches(buildGroupMatches(groups), t.config, {
                  groupFields: groupFieldMap(groups, t.config.fields),
                }),
              };
            }

            const matches = t.matches.map((match) => {
              const swap = (slot: typeof match.a) =>
                slot.kind === 'player' && (slot.playerId === playerA || slot.playerId === playerB)
                  ? { kind: 'player' as const, playerId: slot.playerId === playerA ? playerB : playerA }
                  : slot;
              return { ...match, a: swap(match.a), b: swap(match.b) };
            });
            return { ...t, matches: scheduleMatches(matches, t.config) };
          }),
        ),

      /**
       * Legt eine ganze Gruppe auf ein Spielfeld fest (oder gibt sie wieder
       * frei). Der Spielplan wird anschließend neu terminiert, damit die Spiele
       * der Gruppe nacheinander auf diesem Feld liegen statt parallel.
       */
      setGroupField: (groupId, field) =>
        set((s) =>
          updateActive(s, (t) => {
            const groups = t.groups.map((group) =>
              group.id === groupId ? { ...group, field } : group,
            );
            return {
              ...t,
              groups,
              matches: scheduleMatches(t.matches, t.config, {
                groupFields: groupFieldMap(groups, t.config.fields),
              }),
            };
          }),
        ),

      setMatchField: (matchId, field) =>
        set((s) =>
          updateActive(s, (t) => ({
            ...t,
            matches: t.matches.map((m) => (m.id === matchId ? { ...m, field } : m)),
          })),
        ),

      setMatchTime: (matchId, isoTime) =>
        set((s) =>
          updateActive(s, (t) => ({
            ...t,
            matches: t.matches.map((m) => (m.id === matchId ? { ...m, scheduledAt: isoTime } : m)),
          })),
        ),

      confirmPlan: () =>
        set((s) =>
          updateActive(s, (t) => ({
            ...t,
            stage: t.config.format === 'groups' ? 'group' : 'ko',
          })),
        ),

      setResult: (matchId, result) =>
        set((s) =>
          updateActive(s, (t) => ({
            ...t,
            matches: t.matches.map((m) => (m.id === matchId ? { ...m, result } : m)),
          })),
        ),

      /**
       * Ergebnis zurücknehmen. Alles, was auf diesem Spiel aufbaut, verliert
       * damit seine Grundlage und wird ebenfalls geleert.
       */
      clearResult: (matchId) =>
        set((s) =>
          updateActive(s, (t) => {
            const invalid = new Set([matchId]);
            let changed = true;
            while (changed) {
              changed = false;
              for (const match of t.matches) {
                if (invalid.has(match.id)) continue;
                const depends = [match.a, match.b].some(
                  (slot) =>
                    (slot.kind === 'winnerOf' || slot.kind === 'loserOf') && invalid.has(slot.matchId),
                );
                if (depends) {
                  invalid.add(match.id);
                  changed = true;
                }
              }
            }
            return {
              ...t,
              matches: t.matches.map((m) => (invalid.has(m.id) ? { ...m, result: undefined } : m)),
            };
          }),
        ),

      startKo: () => set((s) => updateActive(s, startKoPhase)),

      finish: () =>
        set((s) => {
          if (!s.active) return {};
          const finished = finishTournament(s.active);
          return {
            active: finished,
            archive: [finished, ...s.archive.filter((t) => t.id !== finished.id)],
          };
        }),

      discardActive: () => set({ active: null }),

      deleteArchived: (id) =>
        set((s) => ({
          archive: s.archive.filter((t) => t.id !== id),
          active: s.active?.id === id ? null : s.active,
        })),

      importData: (payload) =>
        set((s) => {
          const incoming = payload.archive ?? [];
          const existing = s.archive.filter((t) => !incoming.some((i) => i.id === t.id));
          return {
            archive: [...incoming, ...existing].sort((a, b) =>
              (b.finishedAt ?? b.createdAt).localeCompare(a.finishedAt ?? a.createdAt),
            ),
            active: payload.active ?? s.active,
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        config: state.config,
        players: state.players,
        active: state.active,
        archive: state.archive,
      }),
    },
  ),
);

export function buildExport(state: { active: Tournament | null; archive: Tournament[] }): ExportPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    active: state.active,
    archive: state.archive,
  };
}

export function parseImport(text: string): ExportPayload {
  const data = JSON.parse(text) as Partial<ExportPayload>;
  if (!data || typeof data !== 'object' || !Array.isArray(data.archive)) {
    throw new Error('Die Datei enthält keinen gültigen Turnier-Export.');
  }
  return { version: 1, exportedAt: data.exportedAt ?? '', active: data.active ?? null, archive: data.archive };
}
