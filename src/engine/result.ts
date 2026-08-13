import type { MatchResult, TournamentConfig } from './types';
import { bestOf, drawPossible, legsToWin, requiresPoints } from './types';

/** Erkennt Kurzformen wie "2:1", "2-1 (21:17)" oder "1:0 21:17". */
export function parseScoreShorthand(text: string): Partial<MatchResult> | null {
  const cleaned = text.trim();
  if (!cleaned) return null;

  const legs = cleaned.match(/^(\d{1,2})\s*[:\-–/]\s*(\d{1,2})/);
  if (!legs) return null;

  const rest = cleaned.slice(legs[0].length);
  const points = rest.match(/(\d{1,3})\s*[:\-–/]\s*(\d{1,3})/);

  return {
    legsA: Number(legs[1]),
    legsB: Number(legs[2]),
    pointsA: points ? Number(points[1]) : undefined,
    pointsB: points ? Number(points[2]) : undefined,
  };
}

export interface ResultDraft {
  legsA: string;
  legsB: string;
  pointsA: string;
  pointsB: string;
}

export const EMPTY_DRAFT: ResultDraft = { legsA: '', legsB: '', pointsA: '', pointsB: '' };

export function draftFromResult(result: MatchResult | undefined): ResultDraft {
  if (!result) return EMPTY_DRAFT;
  return {
    legsA: String(result.legsA),
    legsB: String(result.legsB),
    pointsA: result.pointsA !== undefined ? String(result.pointsA) : '',
    pointsB: result.pointsB !== undefined ? String(result.pointsB) : '',
  };
}

/**
 * Prüft ein eingegebenes Ergebnis gegen die Turniereinstellungen.
 * `allowDraw` ist nur in der Gruppenphase und nur bei geradem Best of möglich –
 * ein KO-Spiel muss immer einen Sieger haben.
 */
export function validateResult(
  config: TournamentConfig,
  draft: ResultDraft,
  options: { allowDraw: boolean },
): { errors: string[]; result?: MatchResult } {
  const errors: string[] = [];
  const legsA = Number.parseInt(draft.legsA, 10);
  const legsB = Number.parseInt(draft.legsB, 10);

  if (!Number.isInteger(legsA) || !Number.isInteger(legsB) || legsA < 0 || legsB < 0) {
    errors.push('Bitte für beide Spieler die gewonnenen Legs eintragen.');
    return { errors };
  }

  const target = legsToWin(config);
  const total = legsA + legsB;
  const decided = legsA !== legsB;
  const draw = !decided;

  if (draw && !options.allowDraw) {
    errors.push(
      drawPossible(config)
        ? 'In der KO-Phase muss es einen Sieger geben – ein Unentschieden ist nicht möglich.'
        : `Bei Best of ${bestOf(config)} kann es kein Unentschieden geben.`,
    );
  }

  if (draw && options.allowDraw && total !== bestOf(config)) {
    errors.push(`Bei einem Unentschieden müssen alle ${bestOf(config)} Legs gespielt sein.`);
  }

  if (decided) {
    const winnerLegs = Math.max(legsA, legsB);
    const loserLegs = Math.min(legsA, legsB);
    if (winnerLegs !== target) {
      errors.push(`Der Sieger muss bei Best of ${bestOf(config)} genau ${target} Legs gewinnen.`);
    }
    if (loserLegs >= target) {
      errors.push('Der Verlierer kann nicht ebenso viele Legs wie der Sieger gewonnen haben.');
    }
    if (total > bestOf(config)) {
      errors.push(`Es können höchstens ${bestOf(config)} Legs gespielt werden.`);
    }
  }

  let pointsA: number | undefined;
  let pointsB: number | undefined;

  if (requiresPoints(config)) {
    pointsA = Number.parseInt(draft.pointsA, 10);
    pointsB = Number.parseInt(draft.pointsB, 10);

    if (!Number.isInteger(pointsA) || !Number.isInteger(pointsB) || pointsA < 0 || pointsB < 0) {
      errors.push(
        config.sport === 'cornhole'
          ? 'Beim Cornhole muss zusätzlich das Punkteergebnis eingetragen werden.'
          : 'Bei einem einzelnen Leg muss zusätzlich das Punkteergebnis eingetragen werden.',
      );
    } else if (config.sport === 'cornhole') {
      const winnerPoints = Math.max(pointsA, pointsB);
      if (winnerPoints < config.cornhole.targetPoints) {
        errors.push(`Ein Leg endet erst bei ${config.cornhole.targetPoints} Punkten.`);
      }
      if (decided) {
        const legWinnerIsA = legsA > legsB;
        if ((legWinnerIsA && pointsA < pointsB) || (!legWinnerIsA && pointsB < pointsA)) {
          errors.push('Punkte und Legs passen nicht zusammen – der Sieger hat weniger Punkte.');
        }
      }
    }
  } else {
    const hasA = draft.pointsA.trim() !== '';
    const hasB = draft.pointsB.trim() !== '';
    if (hasA && hasB) {
      pointsA = Number.parseInt(draft.pointsA, 10);
      pointsB = Number.parseInt(draft.pointsB, 10);
    }
  }

  if (errors.length) return { errors };
  return { errors: [], result: { legsA, legsB, pointsA, pointsB } };
}

/** Alle regelkonformen Leg-Ergebnisse als Schnellauswahl, z.B. 2:0, 2:1, 0:2, 1:2. */
export function quickScores(config: TournamentConfig, allowDraw: boolean): Array<[number, number]> {
  const target = legsToWin(config);
  const scores: Array<[number, number]> = [];
  for (let loser = 0; loser < target; loser++) scores.push([target, loser]);
  for (let loser = target - 1; loser >= 0; loser--) scores.push([loser, target]);
  if (allowDraw && drawPossible(config)) {
    const half = bestOf(config) / 2;
    scores.splice(target, 0, [half, half]);
  }
  return scores;
}
