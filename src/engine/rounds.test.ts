import { describe, expect, it } from 'vitest';
import type { KoSettings, Match, Player, Tournament, TournamentConfig } from './types';
import { bestOf, defaultConfig } from './types';
import {
  configForMatch,
  koRoundLabels,
  minutesForPlannedMatch,
  roundSetting,
  roundSettings,
  startedRounds,
  withRoundSetting,
} from './rounds';
import { createTournament, rescheduleKoPhase, startKoPhase } from './tournament';
import { estimatedEnd } from './schedule';
import { Resolver } from './resolve';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Team ${i + 1}`,
    seed: i + 1,
  }));
}

function config(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return { ...defaultConfig(), avgMatchMinutes: 15, ...overrides };
}

const KO: KoSettings = { avgMatchMinutes: 20, legs: 5, fields: 2 };

describe('Leg-Anzahl je KO-Runde', () => {
  describe('Welche Runden es gibt', () => {
    it('listet die Runden eines reinen KO-Turniers', () => {
      expect(koRoundLabels(config({ format: 'single_ko', participants: 16 }))).toEqual([
        'Achtelfinale',
        'Viertelfinale',
        'Halbfinale',
        'Finale',
        'Spiel um Platz 3',
      ]);
    });

    it('lässt das Spiel um Platz 3 weg, wenn es nicht ausgetragen wird', () => {
      const labels = koRoundLabels(
        config({ format: 'single_ko', participants: 8, thirdPlaceMatch: false }),
      );
      expect(labels).toEqual(['Viertelfinale', 'Halbfinale', 'Finale']);
    });

    it('richtet sich im Gruppenmodus nach den Qualifizierten, nicht nach den Teilnehmern', () => {
      // 48 Teilnehmer in 12 Gruppen ergeben 32 Qualifizierte.
      const labels = koRoundLabels(
        config({ format: 'groups', participants: 48, groupCount: 12, groupSize: 4 }),
      );
      expect(labels).toEqual([
        'Sechzehntelfinale',
        'Achtelfinale',
        'Viertelfinale',
        'Halbfinale',
        'Finale',
        'Spiel um Platz 3',
      ]);
    });

    it('nennt im Doppel-KO auch Verliererrunde, Grand Final und Rückspiel', () => {
      const labels = koRoundLabels(config({ format: 'double_ko', participants: 8 }));
      expect(labels[0]).toBe('Siegerrunde · Viertelfinale');
      expect(labels).toContain('Grand Final');
      expect(labels).toContain('Bracket Reset');
      expect(labels.some((l) => l.startsWith('Verliererrunde'))).toBe(true);
    });

    it('liefert nichts, wenn es gar keine KO-Runde gibt', () => {
      const einzelgruppe = config({
        format: 'groups',
        participants: 6,
        groupCount: 1,
        groupSize: 6,
        groupFinal: false,
      });
      expect(koRoundLabels(einzelgruppe)).toEqual([]);
    });
  });

  describe('Vererbung der Werte', () => {
    it('erbt ohne eigene Angabe die Vorgabe der KO-Phase', () => {
      const setting = roundSetting(config(), KO, 'Halbfinale');
      expect(setting).toEqual({ label: 'Halbfinale', legs: 5, minutes: 20, custom: false });
    });

    it('erbt ohne KO-Vorgabe die Turnierkonfiguration', () => {
      const cfg = config({ format: 'single_ko', participants: 8 });
      expect(roundSetting(cfg, undefined, 'Finale')).toEqual({
        label: 'Finale',
        legs: bestOf(cfg),
        minutes: cfg.avgMatchMinutes,
        custom: false,
      });
    });

    it('schlägt zur geänderten Leg-Anzahl eine passende Spieldauer vor', () => {
      // Vorgabe Best of 5 in 20 Minuten – also gut 6,7 Minuten je Gewinnleg.
      // Ein Best of 7 braucht vier statt drei Gewinnlegs: rund 27 Minuten.
      const cfg = config({ koRounds: { Finale: { legs: 7 } } });
      expect(roundSetting(cfg, KO, 'Finale')).toEqual({
        label: 'Finale',
        legs: 7,
        minutes: 27,
        custom: true,
      });

      // Und nach unten genauso: ein einzelnes Leg ist ein Drittel.
      expect(roundSetting(config({ koRounds: { Finale: { legs: 1 } } }), KO, 'Finale')).toMatchObject(
        { legs: 1, minutes: 7 },
      );
    });

    it('lässt eine eingetragene Spieldauer immer gelten', () => {
      const nurZeit = config({ koRounds: { Finale: { minutes: 45 } } });
      expect(roundSetting(nurZeit, KO, 'Finale')).toMatchObject({ legs: 5, minutes: 45 });

      // Auch gegen den Vorschlag: Best of 7, aber wir wissen, es geht schneller.
      const beides = config({ koRounds: { Finale: { legs: 7, minutes: 20 } } });
      expect(roundSetting(beides, KO, 'Finale')).toMatchObject({ legs: 7, minutes: 20 });
    });

    it('entfernt den Eintrag, sobald nichts mehr abweicht', () => {
      const eins = withRoundSetting(undefined, 'Finale', { legs: 7 });
      expect(eins).toEqual({ Finale: { legs: 7 } });

      const zwei = withRoundSetting(eins, 'Finale', { minutes: 30 });
      expect(zwei).toEqual({ Finale: { legs: 7, minutes: 30 } });

      const zurueck = withRoundSetting(zwei, 'Finale', { legs: undefined, minutes: undefined });
      expect(zurueck, 'ein leerer Eintrag darf nicht zurückbleiben').toBeUndefined();
    });
  });

  describe('Wirkung auf die Spiele', () => {
    /** Turnier im Gruppenmodus mit gespielter Gruppenphase und gestarteter KO-Runde. */
    function bisZurKo(overrides: Partial<TournamentConfig> = {}, ko: KoSettings = KO): Tournament {
      const cfg = config({
        format: 'groups',
        participants: 8,
        groupCount: 2,
        groupSize: 4,
        ...overrides,
      });
      const start = { ...createTournament(cfg, makePlayers(8), 5), stage: 'group' as const };
      const resolver = new Resolver(start.matches);
      const gespielt: Tournament = {
        ...start,
        matches: start.matches.map((m) => {
          const [a, b] = resolver.playerIds(m);
          const aGewinnt = Number(a.slice(1)) < Number(b.slice(1));
          return { ...m, result: aGewinnt ? { legsA: 2, legsB: 0 } : { legsA: 0, legsB: 2 } };
        }),
      };
      return startKoPhase(gespielt, ko);
    }

    it('gibt jedem Spiel die Leg-Anzahl seiner Runde', () => {
      const tournament = bisZurKo({
        koRounds: { Halbfinale: { legs: 3 }, Finale: { legs: 7 } },
      });

      const legsOf = (label: string) => {
        const match = tournament.matches.find((m) => m.roundLabel === label) as Match;
        return bestOf(configForMatch(tournament, match));
      };
      expect(legsOf('Halbfinale')).toBe(3);
      expect(legsOf('Finale')).toBe(7);
      // Ohne eigene Angabe gilt die Vorgabe der KO-Phase.
      expect(legsOf('Spiel um Platz 3')).toBe(5);
    });

    it('lässt Gruppenspiele unberührt', () => {
      const tournament = bisZurKo({ koRounds: { Finale: { legs: 7, minutes: 60 } } });
      const gruppenspiel = tournament.matches.find((m) => m.phase === 'group') as Match;
      expect(bestOf(configForMatch(tournament, gruppenspiel))).toBe(bestOf(tournament.config));
      expect(minutesForPlannedMatch(tournament.config, tournament.ko, gruppenspiel)).toBe(
        tournament.config.avgMatchMinutes,
      );
    });

    it('verkürzt mit weniger Minuten auch das voraussichtliche Ende', () => {
      const lang = bisZurKo();
      const kurz = rescheduleKoPhase({
        ...lang,
        config: { ...lang.config, koRounds: { Halbfinale: { minutes: 5 }, Finale: { minutes: 5 } } },
      });

      const endeVon = (t: Tournament) =>
        estimatedEnd(t.matches, t.config, (m) =>
          minutesForPlannedMatch(t.config, t.ko, m),
        ) as Date;
      expect(endeVon(kurz).getTime()).toBeLessThan(endeVon(lang).getTime());
    });

    it('lässt Felder und Paarungen beim Kürzen unangetastet', () => {
      // Sobald das erste Ergebnis steht, kennt der Planer in den Folgerunden
      // echte Spieler statt Platzhalter und würde neu verteilen. Eine Runde zu
      // kürzen darf aber keine Paarung auf ein anderes Board schieben – am
      // Board hängt der Aushang.
      const gestartet = bisZurKo();
      const halbfinale = gestartet.matches.find((m) => m.roundLabel === 'Halbfinale') as Match;
      const mitErgebnis: Tournament = {
        ...gestartet,
        matches: gestartet.matches.map((m) =>
          m.id === halbfinale.id ? { ...m, result: { legsA: 3, legsB: 0 } } : m,
        ),
      };

      const gekuerzt = rescheduleKoPhase({
        ...mitErgebnis,
        config: { ...mitErgebnis.config, koRounds: { Finale: { minutes: 5 } } },
      });

      for (const vorher of mitErgebnis.matches) {
        const nachher = gekuerzt.matches.find((m) => m.id === vorher.id) as Match;
        expect(nachher.field, `${vorher.label}: Feld darf sich nicht ändern`).toBe(vorher.field);
      }
      // Das gespielte Halbfinale behält auch seine Uhrzeit.
      const danach = gekuerzt.matches.find((m) => m.id === halbfinale.id) as Match;
      expect(danach.scheduledAt).toBe(halbfinale.scheduledAt);
    });

    it('lässt die Runden davor stehen, wenn eine spätere Runde gekürzt wird', () => {
      // Das Zeitraster wird nach vorne aufgebaut: eine Änderung wirkt nur auf
      // das, was danach kommt. Sonst würde ein Eingriff mitten im Turnier
      // Anwurfzeiten verschieben, die längst ausgehängt sind.
      const vorher = bisZurKo();
      const nachher = rescheduleKoPhase({
        ...vorher,
        config: { ...vorher.config, koRounds: { Halbfinale: { minutes: 90 } } },
      });

      const zeitVon = (t: Tournament, label: string) =>
        t.matches.find((m) => m.roundLabel === label)?.scheduledAt as string;

      expect(zeitVon(nachher, 'Halbfinale'), 'die geänderte Runde beginnt unverändert').toBe(
        zeitVon(vorher, 'Halbfinale'),
      );
      // Das Finale rückt um die zusätzliche Halbfinaldauer nach hinten.
      const verschiebung =
        (new Date(zeitVon(nachher, 'Finale')).getTime() -
          new Date(zeitVon(vorher, 'Finale')).getTime()) /
        60_000;
      expect(verschiebung).toBe(90 - KO.avgMatchMinutes);
    });

    it('terminiert Spiele mit unterschiedlicher Dauer hintereinander statt im festen Takt', () => {
      const tournament = bisZurKo({ koRounds: { Halbfinale: { minutes: 10 } } }, { ...KO, fields: 4 });
      const zeiten = (label: string) =>
        [
          ...new Set(
            tournament.matches.filter((m) => m.roundLabel === label).map((m) => m.scheduledAt),
          ),
        ].sort() as string[];

      const halb = zeiten('Halbfinale');
      const finale = zeiten('Finale');
      const abstand =
        (new Date(finale[0]).getTime() - new Date(halb[0]).getTime()) / 60_000;
      expect(abstand, 'nach dem Halbfinale vergehen genau dessen 10 Minuten').toBe(10);
    });

    it('meldet Runden, in denen schon gespielt wurde', () => {
      const tournament = bisZurKo();
      expect(startedRounds(tournament).size, 'zu Beginn ist keine KO-Runde gespielt').toBe(0);

      const halbfinale = tournament.matches.find((m) => m.roundLabel === 'Halbfinale') as Match;
      const mitErgebnis: Tournament = {
        ...tournament,
        matches: tournament.matches.map((m) =>
          m.id === halbfinale.id ? { ...m, result: { legsA: 3, legsB: 0 } } : m,
        ),
      };
      expect([...startedRounds(mitErgebnis)]).toEqual(['Halbfinale']);
    });
  });

  it('stellt die Tabelle für die Oberfläche zusammen', () => {
    const cfg = config({
      format: 'single_ko',
      participants: 8,
      thirdPlaceMatch: false,
      koRounds: { Finale: { legs: 7 } },
    });
    expect(roundSettings(cfg)).toEqual([
      { label: 'Viertelfinale', legs: 3, minutes: 15, custom: false },
      { label: 'Halbfinale', legs: 3, minutes: 15, custom: false },
      // Best of 3 in 15 Minuten sind 7,5 Minuten je Gewinnleg – ein Best of 7
      // braucht vier statt zwei davon und wird entsprechend mit 30 geplant.
      { label: 'Finale', legs: 7, minutes: 30, custom: true },
    ]);
  });
});
