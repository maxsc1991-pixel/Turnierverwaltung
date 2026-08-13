import { useEffect, useMemo, useState } from 'react';
import type { Match, MatchResult, Player, TournamentConfig } from '../engine/types';
import { bestOf, legsToWin, requiresPoints } from '../engine/types';
import { Resolver, indexMatches } from '../engine/resolve';
import { describeSlot } from '../engine/labels';
import {
  draftFromResult,
  parseScoreShorthand,
  quickScores,
  validateResult,
  type ResultDraft,
} from '../engine/result';

interface Props {
  match: Match;
  matches: readonly Match[];
  players: readonly Player[];
  config: TournamentConfig;
  /** In der Gruppenphase ist bei geradem Best of ein Unentschieden erlaubt. */
  allowDraw: boolean;
  onSave: (result: MatchResult) => void;
  onClear?: () => void;
  onClose: () => void;
}

export function ResultDialog({
  match,
  matches,
  players,
  config,
  allowDraw,
  onSave,
  onClear,
  onClose,
}: Props) {
  const resolver = useMemo(() => new Resolver(matches), [matches]);
  const byId = useMemo(() => indexMatches(matches), [matches]);
  const sideA = describeSlot(match.a, resolver, players, byId);
  const sideB = describeSlot(match.b, resolver, players, byId);

  const [draft, setDraft] = useState<ResultDraft>(() => draftFromResult(match.result));
  const [shorthand, setShorthand] = useState('');
  const [touched, setTouched] = useState(false);

  const { errors, result } = validateResult(config, draft, { allowDraw });
  const needsPoints = requiresPoints(config);

  useEffect(() => {
    const parsed = parseScoreShorthand(shorthand);
    if (!parsed) return;
    setDraft((current) => ({
      legsA: String(parsed.legsA ?? current.legsA),
      legsB: String(parsed.legsB ?? current.legsB),
      pointsA: parsed.pointsA !== undefined ? String(parsed.pointsA) : current.pointsA,
      pointsB: parsed.pointsB !== undefined ? String(parsed.pointsB) : current.pointsB,
    }));
  }, [shorthand]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    setTouched(true);
    if (result) onSave(result);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Ergebnis eintragen">
        <div className="modal__head">
          <div>
            <h2>Ergebnis eintragen</h2>
            <p className="faint">
              {match.label}
              {match.field ? ` · Feld ${match.field}` : ''} · Best of {bestOf(config)} (
              {legsToWin(config)} Legs zum Sieg)
            </p>
          </div>
          <button type="button" className="btn btn--icon" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        <div className="modal__body">
          <div className="result-form">
            <div className="field">
              <span className="field-label">Legs</span>
              <div className="score-input">
                <div>
                  <div className="faint" style={{ marginBottom: 4 }}>
                    {sideA.name}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={bestOf(config)}
                    inputMode="numeric"
                    value={draft.legsA}
                    aria-label={`Legs ${sideA.name}`}
                    onChange={(e) => setDraft({ ...draft, legsA: e.target.value })}
                  />
                </div>
                <span className="score-input__sep">:</span>
                <div>
                  <div className="faint" style={{ marginBottom: 4 }}>
                    {sideB.name}
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={bestOf(config)}
                    inputMode="numeric"
                    value={draft.legsB}
                    aria-label={`Legs ${sideB.name}`}
                    onChange={(e) => setDraft({ ...draft, legsB: e.target.value })}
                  />
                </div>
              </div>
              <div className="quick-scores" style={{ marginTop: 'var(--space-2)' }}>
                {quickScores(config, allowDraw).map(([a, b]) => (
                  <button
                    key={`${a}-${b}`}
                    type="button"
                    className="btn btn--sm"
                    onClick={() => setDraft({ ...draft, legsA: String(a), legsB: String(b) })}
                  >
                    {a}:{b}
                  </button>
                ))}
              </div>
            </div>

            {needsPoints && (
              <div className="field">
                <span className="field-label">
                  Punkte {config.sport === 'cornhole' ? `(bis ${config.cornhole.targetPoints})` : ''}
                </span>
                <div className="score-input">
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft.pointsA}
                    aria-label={`Punkte ${sideA.name}`}
                    onChange={(e) => setDraft({ ...draft, pointsA: e.target.value })}
                  />
                  <span className="score-input__sep">:</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={draft.pointsB}
                    aria-label={`Punkte ${sideB.name}`}
                    onChange={(e) => setDraft({ ...draft, pointsB: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="shorthand">Schnelleingabe</label>
              <input
                id="shorthand"
                type="text"
                value={shorthand}
                placeholder={needsPoints ? '1:0 (21:17)' : '2:1'}
                onChange={(e) => setShorthand(e.target.value)}
              />
              <span className="field__hint">
                Übernimmt Legs und – falls angegeben – die Punkte in die Felder oben.
              </span>
            </div>

            {touched &&
              errors.map((error) => (
                <div className="notice notice--error" key={error}>
                  {error}
                </div>
              ))}
          </div>
        </div>

        <div className="modal__foot">
          {match.result && onClear && (
            <button
              type="button"
              className="btn"
              style={{ marginRight: 'auto' }}
              onClick={() => {
                if (
                  confirm(
                    'Ergebnis zurücknehmen? Alle Spiele, die darauf aufbauen, verlieren ebenfalls ihr Ergebnis.',
                  )
                ) {
                  onClear();
                }
              }}
            >
              Ergebnis löschen
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn btn--success" onClick={submit} disabled={!result}>
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
