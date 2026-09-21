import { describe, expect, it } from 'vitest';
import type { MatchResult, TournamentConfig } from './types';
import { bestOf, defaultConfig, legsToWin } from './types';
import {
  EMPTY_DRAFT,
  draftFromResult,
  parseScoreShorthand,
  quickScores,
  validateResult,
  type ResultDraft,
} from './result';

function dartConfig(legs: number): TournamentConfig {
  const base = defaultConfig();
  return {
    ...base,
    sport: 'dart',
    dart: { ...base.dart, legs: { ...base.dart.legs, [base.dart.game]: legs } },
  };
}

function cornholeConfig(legs: number, targetPoints = 21): TournamentConfig {
  return { ...defaultConfig(), sport: 'cornhole', cornhole: { legs, targetPoints } };
}

function draft(legsA: string, legsB: string, pointsA = '', pointsB = ''): ResultDraft {
  return { legsA, legsB, pointsA, pointsB };
}

describe('Kurzform der Ergebniseingabe', () => {
  it('liest reine Leg-Ergebnisse', () => {
    expect(parseScoreShorthand('2:1')).toEqual({
      legsA: 2,
      legsB: 1,
      pointsA: undefined,
      pointsB: undefined,
    });
  });

  it('akzeptiert Bindestrich, Gedankenstrich und Schrägstrich als Trenner', () => {
    for (const text of ['2-1', '2–1', '2/1', '2 : 1']) {
      expect(parseScoreShorthand(text)).toMatchObject({ legsA: 2, legsB: 1 });
    }
  });

  it('nimmt das Punkteergebnis mit, egal ob in Klammern oder dahinter', () => {
    expect(parseScoreShorthand('2-1 (21:17)')).toEqual({
      legsA: 2,
      legsB: 1,
      pointsA: 21,
      pointsB: 17,
    });
    expect(parseScoreShorthand('1:0 21:17')).toEqual({
      legsA: 1,
      legsB: 0,
      pointsA: 21,
      pointsB: 17,
    });
  });

  it('ignoriert umschließende Leerzeichen', () => {
    expect(parseScoreShorthand('  2:0  ')).toMatchObject({ legsA: 2, legsB: 0 });
  });

  it('liefert null, wenn keine Legs erkennbar sind', () => {
    for (const text of ['', '   ', 'abc', ':', '2', '(21:17)']) {
      expect(parseScoreShorthand(text)).toBeNull();
    }
  });
});

describe('Entwurf und Ergebnis', () => {
  it('liefert für ein fehlendes Ergebnis den leeren Entwurf', () => {
    expect(draftFromResult(undefined)).toEqual(EMPTY_DRAFT);
  });

  it('lässt die Punktefelder leer, wenn keine Punkte erfasst sind', () => {
    expect(draftFromResult({ legsA: 2, legsB: 1 })).toEqual(draft('2', '1'));
  });

  it('überträgt ein vollständiges Ergebnis unverändert in den Entwurf', () => {
    const result: MatchResult = { legsA: 1, legsB: 0, pointsA: 21, pointsB: 17 };
    expect(draftFromResult(result)).toEqual(draft('1', '0', '21', '17'));
  });

  it('ergibt nach Prüfung und Rückwandlung wieder denselben Entwurf', () => {
    const config = cornholeConfig(1);
    const input = draft('1', '0', '21', '17');
    const { errors, result } = validateResult(config, input, { allowDraw: false });
    expect(errors).toEqual([]);
    expect(draftFromResult(result)).toEqual(input);
  });
});

describe('Prüfung eines Ergebnisses – Legs', () => {
  const config = dartConfig(3);

  it('nimmt ein reguläres 2:1 bei Best of 3 an', () => {
    expect(validateResult(config, draft('2', '1'), { allowDraw: false })).toEqual({
      errors: [],
      result: { legsA: 2, legsB: 1, pointsA: undefined, pointsB: undefined },
    });
  });

  it('nimmt auch das gespiegelte 1:2 an', () => {
    const { errors, result } = validateResult(config, draft('1', '2'), { allowDraw: false });
    expect(errors).toEqual([]);
    expect(result).toMatchObject({ legsA: 1, legsB: 2 });
  });

  it('verlangt für beide Seiten eine ganze, nicht negative Zahl', () => {
    for (const input of [draft('', ''), draft('2', ''), draft('zwei', '1'), draft('-1', '2')]) {
      const { errors, result } = validateResult(config, input, { allowDraw: false });
      expect(errors).toEqual(['Bitte für beide Spieler die gewonnenen Legs eintragen.']);
      expect(result).toBeUndefined();
    }
  });

  it('lehnt ein abgebrochenes Spiel ab, in dem niemand die nötigen Legs hat', () => {
    const { errors, result } = validateResult(config, draft('1', '0'), { allowDraw: false });
    expect(errors).toContain('Der Sieger muss bei Best of 3 genau 2 Legs gewinnen.');
    expect(result).toBeUndefined();
  });

  it('lehnt mehr Legs ab, als zum Sieg nötig sind', () => {
    const { errors } = validateResult(config, draft('3', '1'), { allowDraw: false });
    expect(errors).toContain('Der Sieger muss bei Best of 3 genau 2 Legs gewinnen.');
  });

  it('lehnt mehr gespielte Legs ab, als Best of zulässt', () => {
    const { errors } = validateResult(dartConfig(5), draft('3', '3'), { allowDraw: true });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('Prüfung eines Ergebnisses – Unentschieden', () => {
  it('weist ein Unentschieden bei ungeradem Best of grundsätzlich ab', () => {
    const { errors } = validateResult(dartConfig(3), draft('1', '1'), { allowDraw: false });
    expect(errors).toContain('Bei Best of 3 kann es kein Unentschieden geben.');
  });

  it('lehnt ein Unentschieden bei ungeradem Best of auch dann ab, wenn es erlaubt wäre', () => {
    // Die Oberfläche setzt `allowDraw` nur bei geradem Best of; die Prüfung
    // fängt den Fall trotzdem ab, weil eine Punkteteilung nie alle Legs füllt.
    const { errors, result } = validateResult(dartConfig(3), draft('1', '1'), { allowDraw: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(result).toBeUndefined();
  });

  it('erlaubt in der Gruppenphase das 1:1 bei Best of 2', () => {
    const { errors, result } = validateResult(dartConfig(2), draft('1', '1'), { allowDraw: true });
    expect(errors).toEqual([]);
    expect(result).toMatchObject({ legsA: 1, legsB: 1 });
  });

  it('verlangt beim Unentschieden alle Legs – ein 0:0 ist kein Ergebnis', () => {
    const { errors } = validateResult(dartConfig(2), draft('0', '0'), { allowDraw: true });
    expect(errors).toContain('Bei einem Unentschieden müssen alle 2 Legs gespielt sein.');
  });

  it('besteht in der KO-Phase auf einem Sieger, obwohl Best of 2 gerade ist', () => {
    const { errors } = validateResult(dartConfig(2), draft('1', '1'), { allowDraw: false });
    expect(errors).toContain(
      'In der KO-Phase muss es einen Sieger geben – ein Unentschieden ist nicht möglich.',
    );
  });
});

describe('Prüfung eines Ergebnisses – Punkte', () => {
  it('verlangt beim Cornhole über ein einzelnes Leg ein Punkteergebnis', () => {
    const { errors } = validateResult(cornholeConfig(1), draft('1', '0'), { allowDraw: false });
    expect(errors).toContain(
      'Bei einem einzelnen Leg muss zusätzlich das Punkteergebnis eingetragen werden.',
    );
  });

  it('lässt die Punkte beim Cornhole über mehrere Legs weg', () => {
    // Über mehrere Legs sind die Punkte Gesamtsummen und damit freiwillig –
    // auch beim Cornhole, wo sie sonst die Tabelle mitentscheiden.
    const { errors, result } = validateResult(cornholeConfig(3), draft('2', '1'), {
      allowDraw: false,
    });
    expect(errors).toEqual([]);
    expect(result).toEqual({ legsA: 2, legsB: 1, pointsA: undefined, pointsB: undefined });
  });

  it('verlangt beim Dart über ein einzelnes Leg ebenfalls Punkte', () => {
    const { errors } = validateResult(dartConfig(1), draft('1', '0'), { allowDraw: false });
    expect(errors).toContain(
      'Bei einem einzelnen Leg muss zusätzlich das Punkteergebnis eingetragen werden.',
    );
  });

  it('nimmt beim Dart über ein Leg das Punkteergebnis an', () => {
    const { errors, result } = validateResult(dartConfig(1), draft('1', '0', '501', '437'), {
      allowDraw: false,
    });
    expect(errors).toEqual([]);
    expect(result).toEqual({ legsA: 1, legsB: 0, pointsA: 501, pointsB: 437 });
  });

  it('besteht beim Cornhole auf dem Zielwert eines Legs', () => {
    const { errors } = validateResult(cornholeConfig(1), draft('1', '0', '15', '12'), {
      allowDraw: false,
    });
    expect(errors).toContain('Ein Leg endet erst bei 21 Punkten.');
  });

  it('übernimmt einen abweichenden Zielwert aus der Konfiguration', () => {
    const { errors } = validateResult(cornholeConfig(1, 15), draft('1', '0', '15', '12'), {
      allowDraw: false,
    });
    expect(errors).toEqual([]);
  });

  it('erkennt bei einem einzelnen Leg widersprüchliche Punkte und Legs', () => {
    const { errors } = validateResult(cornholeConfig(1), draft('1', '0', '17', '21'), {
      allowDraw: false,
    });
    expect(errors).toContain('Punkte und Legs passen nicht zusammen – der Sieger hat weniger Punkte.');
  });

  it('lässt über mehrere Legs zu, dass der Sieger insgesamt weniger Punkte hat', () => {
    const { errors, result } = validateResult(cornholeConfig(3), draft('2', '1', '42', '45'), {
      allowDraw: false,
    });
    expect(errors).toEqual([]);
    expect(result).toEqual({ legsA: 2, legsB: 1, pointsA: 42, pointsB: 45 });
  });

  it('übernimmt beim Dart über mehrere Legs freiwillig eingetragene Punkte', () => {
    const { result } = validateResult(dartConfig(3), draft('2', '1', '180', '140'), {
      allowDraw: false,
    });
    expect(result).toEqual({ legsA: 2, legsB: 1, pointsA: 180, pointsB: 140 });
  });

  it('weist halb ausgefüllte Punkte zurück, statt sie stillschweigend zu verwerfen', () => {
    // Freiwillig heißt: beide Felder oder keines. Einen eingetragenen Wert
    // einfach wegzulassen wäre für den Eingebenden nicht erkennbar.
    const { errors, result } = validateResult(dartConfig(3), draft('2', '1', '180', ''), {
      allowDraw: false,
    });
    expect(errors).toContain(
      'Bitte die Punkte für beide Seiten eintragen oder beide Felder leer lassen.',
    );
    expect(result).toBeUndefined();
  });

  it('nimmt ein Ergebnis über mehrere Legs auch ganz ohne Punkte an', () => {
    const { errors, result } = validateResult(dartConfig(3), draft('2', '1'), {
      allowDraw: false,
    });
    expect(errors).toEqual([]);
    expect(result).toEqual({ legsA: 2, legsB: 1, pointsA: undefined, pointsB: undefined });
  });
});

describe('Schnellauswahl der Leg-Ergebnisse', () => {
  it('bietet bei Best of 3 genau 2:0, 2:1, 1:2 und 0:2', () => {
    expect(quickScores(dartConfig(3), false)).toEqual([
      [2, 0],
      [2, 1],
      [1, 2],
      [0, 2],
    ]);
  });

  it('bietet bei Best of 5 alle sechs möglichen Ausgänge', () => {
    expect(quickScores(dartConfig(5), false)).toEqual([
      [3, 0],
      [3, 1],
      [3, 2],
      [2, 3],
      [1, 3],
      [0, 3],
    ]);
  });

  it('kennt bei Best of 1 nur 1:0 und 0:1', () => {
    expect(quickScores(dartConfig(1), false)).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it('schiebt das Unentschieden zwischen Sieg und Niederlage', () => {
    expect(quickScores(dartConfig(2), true)).toContainEqual([1, 1]);
    expect(quickScores(dartConfig(2), true).findIndex(([a, b]) => a === b)).toBe(2);
  });

  it('bietet bei ungeradem Best of kein Unentschieden an', () => {
    expect(quickScores(dartConfig(3), true).some(([a, b]) => a === b)).toBe(false);
  });

  it('bietet in jeder Auswahl beide Seiten gleich oft an', () => {
    for (const legs of [1, 3, 5, 7]) {
      const scores = quickScores(dartConfig(legs), false);
      expect(scores.length).toBe(2 * legsToWin(dartConfig(legs)));
      expect(scores.filter(([a, b]) => a > b).length).toBe(scores.length / 2);
    }
  });

  it('schlägt nur Ergebnisse vor, die die Prüfung auch annimmt', () => {
    for (const legs of [1, 3, 5, 7]) {
      const config = dartConfig(legs);
      for (const [a, b] of quickScores(config, false)) {
        // Best of 1 verlangt zusätzlich Punkte – hier geht es nur um die Legs.
        const points = bestOf(config) === 1 ? ['501', '437'] : ['', ''];
        const { errors } = validateResult(config, draft(String(a), String(b), points[0], points[1]), {
          allowDraw: false,
        });
        expect(errors, `Best of ${legs}: ${a}:${b}`).toEqual([]);
      }
    }
  });
});
