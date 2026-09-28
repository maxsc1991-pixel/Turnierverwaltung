import { describe, expect, it } from 'vitest';
import type { Match, Player, Tournament, TournamentConfig } from './types';
import { defaultConfig } from './types';
import { Resolver } from './resolve';
import { createTournament } from './tournament';
import { buildGroupMatches, drawGroups } from './groups';
import { createRng } from './rng';
import { groupFieldMap, runningPerField, scheduleMatches } from './schedule';

function players(n: number): Player[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Team ${i + 1}`, seed: i + 1 }));
}

function config(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    ...defaultConfig(),
    format: 'groups',
    participants: 12,
    groupCount: 3,
    groupSize: 4,
    fields: 3,
    avgMatchMinutes: 15,
    ...overrides,
  };
}

/** Turnier, in dem jede Gruppe ihr eigenes Spielfeld hat. */
function mitFestenFeldern(cfg = config(), n = 12): Tournament {
  const groups = drawGroups(players(n), cfg.groupCount, createRng(7)).map((g, i) => ({
    ...g,
    field: i + 1,
  }));
  const matches = scheduleMatches(buildGroupMatches(groups), cfg, {
    groupFields: groupFieldMap(groups, cfg.fields),
  });
  return { ...createTournament(cfg, players(n), 7), groups, matches, stage: 'group' };
}

function laufend(t: Tournament): Match[] {
  const resolver = new Resolver(t.matches);
  const ready = t.matches.filter((m) => !m.result && resolver.status(m) === 'ready');
  return runningPerField(ready, t.config.fields, {
    groupFields: groupFieldMap(t.groups, t.config.fields),
    playerIds: (m) => resolver.playerIds(m),
  });
}

/** Trägt das früheste offene Spiel eines Feldes ein. */
function spieleAufFeld(t: Tournament, field: number): Tournament {
  const next = t.matches
    .filter((m) => m.field === field && !m.result)
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))[0];
  if (!next) return t;
  return {
    ...t,
    matches: t.matches.map((m) => (m.id === next.id ? { ...m, result: { legsA: 2, legsB: 0 } } : m)),
  };
}

describe('Belegung der Spielfelder', () => {
  it('zeigt zu Beginn je Feld eine Partie', () => {
    const felder = laufend(mitFestenFeldern()).map((m) => m.field);
    expect(felder).toEqual([1, 2, 3]);
  });

  it('belegt kein Feld doppelt, wenn ein Feld vorauseilt', () => {
    // Der eigentliche Fehler: nach den frühesten Uhrzeiten auszuwählen setzt
    // zwei Partien derselben Gruppe an und lässt deren Feld leer stehen.
    let t = mitFestenFeldern();
    for (let vorsprung = 1; vorsprung <= 4; vorsprung++) {
      t = spieleAufFeld(t, 1);
      const felder = laufend(t).map((m) => m.field);
      expect(new Set(felder).size, `Vorsprung ${vorsprung}: ${felder.join(', ')}`).toBe(
        felder.length,
      );
      expect(felder, `Vorsprung ${vorsprung}: Feld 1 fehlt`).toContain(1);
    }
  });

  it('lässt kein fremdes Spiel auf das Feld einer Gruppe', () => {
    let t = mitFestenFeldern();
    // Gruppe A ist komplett durch – ihr Feld bleibt trotzdem ihres.
    for (let i = 0; i < 6; i++) t = spieleAufFeld(t, 1);

    const laufende = laufend(t);
    const aufFeldEins = laufende.find((m) => m.field === 1);
    expect(aufFeldEins, 'Feld 1 bleibt leer, statt eine fremde Gruppe aufzunehmen').toBeUndefined();

    for (const match of laufende) {
      const gruppe = t.groups.find((g) => g.id === match.groupId);
      expect(gruppe?.field, `${match.label} steht auf einem fremden Feld`).toBe(match.field);
    }
  });

  it('füllt freie Felder, solange keine Gruppe sie beansprucht', () => {
    // Ohne feste Zuweisung gibt es nichts zu schützen: jedes freie Feld darf
    // die nächste Partie bekommen, damit keine Boards stillstehen.
    const cfg = config({ participants: 8, groupCount: 2, groupSize: 4, fields: 4 });
    const t: Tournament = { ...createTournament(cfg, players(8), 3), stage: 'group' };
    const resolver = new Resolver(t.matches);
    const ready = t.matches.filter((m) => !m.result && resolver.status(m) === 'ready');

    const laufende = runningPerField(ready, cfg.fields, {
      playerIds: (m) => resolver.playerIds(m),
    });
    expect(laufende.length, '8 Spieler, 4 Felder – alle vier können spielen').toBe(4);
    expect(new Set(laufende.map((m) => m.field)).size).toBe(4);
  });

  it('setzt niemanden gleichzeitig auf zwei Felder', () => {
    const cfg = config({ participants: 6, groupCount: 1, groupSize: 6, fields: 3 });
    const t: Tournament = { ...createTournament(cfg, players(6), 11), stage: 'group' };
    const resolver = new Resolver(t.matches);
    const ready = t.matches.filter((m) => !m.result && resolver.status(m) === 'ready');

    const laufende = runningPerField(ready, cfg.fields, {
      playerIds: (m) => resolver.playerIds(m),
    });
    const ids = laufende.flatMap((m) => resolver.playerIds(m));
    expect(new Set(ids).size, 'kein Spieler an zwei Boards').toBe(ids.length);
  });
});
