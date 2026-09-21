import { describe, expect, it } from 'vitest';
import type { Match, Player, Tournament, TournamentConfig } from './types';
import { allowsNoShow, defaultConfig, isWithdrawn } from './types';
import { Resolver } from './resolve';
import { allStandings, createTournament, startKoPhase } from './tournament';
import { groupsWithWithdrawal, reinstatePlayer, settleNoShows, withdrawPlayer } from './withdraw';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Team ${i + 1}`,
    seed: i + 1,
  }));
}

function config(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    ...defaultConfig(),
    format: 'groups',
    participants: 8,
    groupCount: 2,
    groupSize: 4,
    ...overrides,
  };
}

/** Turnier in der Gruppenphase, alles noch offen. */
function started(overrides: Partial<TournamentConfig> = {}): Tournament {
  const cfg = config(overrides);
  return { ...createTournament(cfg, makePlayers(cfg.participants), 99), stage: 'group' };
}

/** Spielt die Gruppenphase aus; die kleinere Teamnummer gewinnt 2:0. */
function playGroups(tournament: Tournament): Tournament {
  const resolver = new Resolver(tournament.matches);
  return {
    ...tournament,
    matches: tournament.matches.map((match) => {
      if (match.phase !== 'group' || match.result) return match;
      const [a, b] = resolver.playerIds(match);
      const aGewinnt = Number(a.slice(1)) < Number(b.slice(1));
      return { ...match, result: aGewinnt ? { legsA: 2, legsB: 0 } : { legsA: 0, legsB: 2 } };
    }),
  };
}

const pid = (slot: Match['a']) => (slot.kind === 'player' ? slot.playerId : '');
const involves = (match: Match, playerId: string) =>
  pid(match.a) === playerId || pid(match.b) === playerId;

describe('Nicht angetretene Teams', () => {
  it('ist in der Konfiguration abschaltbar und ohne Angabe erlaubt', () => {
    expect(allowsNoShow(config())).toBe(true);
    expect(allowsNoShow(config({ noShowWalkover: false }))).toBe(false);
    const { noShowWalkover: _weg, ...alt } = config();
    expect(allowsNoShow(alt as TournamentConfig)).toBe(true);
  });

  it('wertet die offenen Spiele kampflos über die volle Leg-Zahl', () => {
    const tournament = withdrawPlayer(started(), 'p1');
    expect(isWithdrawn(tournament, 'p1')).toBe(true);

    const own = tournament.matches.filter((m) => involves(m, 'p1'));
    expect(own.length, 'Dreiergruppe: drei Gegner').toBe(3);

    for (const match of own) {
      expect(match.result, match.label).toBeDefined();
      expect(match.noShow, match.label).toBe(pid(match.a) === 'p1' ? 'a' : 'b');
      const { legsA, legsB } = match.result as { legsA: number; legsB: number };
      // Best of 3 -> 2 Legs zum Sieg, und zwar für die andere Seite.
      expect([legsA, legsB]).toEqual(pid(match.a) === 'p1' ? [0, 2] : [2, 0]);
    }
  });

  it('lässt Spiele anderer Paarungen unberührt', () => {
    const tournament = withdrawPlayer(started(), 'p1');
    const fremd = tournament.matches.filter((m) => !involves(m, 'p1'));
    expect(fremd.length).toBeGreaterThan(0);
    expect(fremd.every((m) => !m.result && !m.noShow)).toBe(true);
  });

  it('behält bereits gespielte Ergebnisse', () => {
    // Team 1 spielt erst eine Partie regulär und reist dann ab.
    const base = started();
    const gespielt = base.matches.find((m) => involves(m, 'p1')) as Match;
    const mitErgebnis: Tournament = {
      ...base,
      matches: base.matches.map((m) =>
        m.id === gespielt.id ? { ...m, result: { legsA: 2, legsB: 1 } } : m,
      ),
    };

    const tournament = withdrawPlayer(mitErgebnis, 'p1');
    const danach = tournament.matches.find((m) => m.id === gespielt.id) as Match;
    expect(danach.result).toEqual({ legsA: 2, legsB: 1 });
    expect(danach.noShow, 'ein gespieltes Ergebnis ist kein kampfloser Sieg').toBeUndefined();
  });

  it('zählt den kampflosen Sieg ganz normal in der Tabelle', () => {
    const tournament = withdrawPlayer(started(), 'p1');
    const gruppe = tournament.groups.find((g) => g.playerIds.includes('p1')) as { id: string };
    const rows = allStandings(tournament).get(gruppe.id) ?? [];

    const weg = rows.find((r) => r.playerId === 'p1');
    expect(weg?.played, 'die Spiele zählen mit').toBe(3);
    expect(weg?.points).toBe(0);
    expect(weg?.legsFor).toBe(0);
    expect(weg?.legsAgainst).toBe(6);

    // Alle drei Gegner bekommen dasselbe geschenkt – die Reihenfolge innerhalb
    // der Gruppe bleibt dadurch unverändert.
    const gegner = rows.filter((r) => r.playerId !== 'p1');
    expect(gegner).toHaveLength(3);
    expect(new Set(gegner.map((r) => r.points))).toEqual(new Set([2]));
  });

  it('gibt bei zwei fehlenden Teams niemandem einen Sieg', () => {
    const gruppe = started().groups[0];
    const [erster, zweiter] = gruppe.playerIds;
    const tournament = withdrawPlayer(withdrawPlayer(started(), erster), zweiter);

    const duell = tournament.matches.find(
      (m) => involves(m, erster) && involves(m, zweiter),
    ) as Match;
    expect(duell.result).toEqual({ legsA: 0, legsB: 0 });
  });

  it('wirkt auch in der KO-Phase – wer sich qualifiziert und dann abreist', () => {
    // Der praktische Fall: das Team spielt die Gruppe zu Ende, zieht ein und
    // fährt vor der KO-Runde nach Hause.
    const koPhase = startKoPhase(playGroups(started()));
    const vorher = new Resolver(koPhase.matches);
    const eigenes = koPhase.matches.filter(
      (m) => m.phase !== 'group' && vorher.playerIds(m).includes('p1'),
    );
    expect(eigenes.length, 'Team 1 gewinnt seine Gruppe und steht im Bracket').toBeGreaterThan(0);

    const tournament = withdrawPlayer(koPhase, 'p1');
    for (const match of eigenes) {
      const danach = tournament.matches.find((m) => m.id === match.id) as Match;
      expect(danach.noShow, danach.label).toBeDefined();
      expect(danach.result, danach.label).toBeDefined();
    }
  });

  it('kommt auf dasselbe Ergebnis, egal in welcher Reihenfolge markiert wird', () => {
    const gruppe = started().groups[0];
    const [x, y] = gruppe.playerIds;
    const vorwaerts = withdrawPlayer(withdrawPlayer(started(), x), y);
    const rueckwaerts = withdrawPlayer(withdrawPlayer(started(), y), x);

    const ergebnisse = (t: Tournament) =>
      t.matches.map((m) => `${m.id}|${m.noShow ?? '-'}|${m.result?.legsA ?? ''}:${m.result?.legsB ?? ''}`);
    expect(ergebnisse(vorwaerts)).toEqual(ergebnisse(rueckwaerts));
  });

  it('nimmt die Markierung samt kampfloser Ergebnisse zurück', () => {
    const base = started();
    const gespielt = base.matches.find((m) => involves(m, 'p1')) as Match;
    const mitErgebnis: Tournament = {
      ...base,
      matches: base.matches.map((m) =>
        m.id === gespielt.id ? { ...m, result: { legsA: 2, legsB: 1 } } : m,
      ),
    };

    const zurueck = reinstatePlayer(withdrawPlayer(mitErgebnis, 'p1'), 'p1');
    expect(isWithdrawn(zurueck, 'p1')).toBe(false);
    expect(zurueck.matches.some((m) => m.noShow)).toBe(false);
    // Das regulär gespielte Ergebnis überlebt.
    expect(zurueck.matches.find((m) => m.id === gespielt.id)?.result).toEqual({
      legsA: 2,
      legsB: 1,
    });
    // Die übrigen Partien sind wieder offen.
    expect(zurueck.matches.filter((m) => involves(m, 'p1') && m.result)).toHaveLength(1);
  });

  it('nennt die Gruppen, deren Punkte dadurch nicht mehr vergleichbar sind', () => {
    const tournament = withdrawPlayer(started({ participants: 12, groupCount: 3 }), 'p1');
    const betroffen = groupsWithWithdrawal(tournament);
    expect(betroffen).toHaveLength(1);
    expect(tournament.groups.map((g) => g.name)).toContain(betroffen[0]);
    expect(groupsWithWithdrawal(started())).toEqual([]);
  });

  it('ändert nichts, solange niemand zurückgezogen ist', () => {
    const tournament = started();
    expect(settleNoShows(tournament)).toBe(tournament);
    expect(reinstatePlayer(tournament, 'p1')).toBe(tournament);
  });
});
