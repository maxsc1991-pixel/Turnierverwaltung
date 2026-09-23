import type { KoRoundSetting } from '../engine/types';
import type { RoundSetting } from '../engine/rounds';

interface Props {
  rounds: readonly RoundSetting[];
  /** Runden, in denen schon gespielt wurde – ihre Leg-Anzahl ist gesetzt. */
  locked?: ReadonlySet<string>;
  onChange: (label: string, patch: KoRoundSetting) => void;
}

/**
 * Leg-Anzahl und Spieldauer je KO-Runde. Dieselbe Tabelle steht in der
 * Konfiguration, auf der KO-Seite und während des Turniers – die Seiten
 * unterscheiden sich nur darin, welche Runden gesperrt sind.
 */
export function KoRoundTable({ rounds, locked, onChange }: Props) {
  if (!rounds.length) {
    return <div className="empty">Dieses Turnier hat keine KO-Runde.</div>;
  }

  const anyCustom = rounds.some((r) => r.custom);

  return (
    <div className="table-scroll">
      <table className="standings ko-rounds">
        <thead>
          <tr>
            <th>Runde</th>
            <th className="num">Legs</th>
            <th className="num">Minuten</th>
            <th aria-label="Zurücksetzen" />
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => {
            const gesperrt = locked?.has(round.label) ?? false;
            return (
              <tr key={round.label} className={gesperrt ? 'is-locked' : undefined}>
                <td>
                  <span className="standings__name">{round.label}</span>
                  {gesperrt && <span className="standings__club">wird bereits gespielt</span>}
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={1}
                    max={15}
                    className="ko-rounds__input"
                    value={round.legs}
                    disabled={gesperrt}
                    aria-label={`Legs ${round.label}`}
                    onChange={(e) =>
                      onChange(round.label, { legs: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </td>
                <td className="num">
                  <input
                    type="number"
                    min={1}
                    max={240}
                    className="ko-rounds__input"
                    value={round.minutes}
                    aria-label={`Minuten ${round.label}`}
                    onChange={(e) =>
                      onChange(round.label, { minutes: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                </td>
                <td>
                  {round.custom ? (
                    <button
                      type="button"
                      className="btn btn--sm"
                      disabled={gesperrt}
                      onClick={() => onChange(round.label, { legs: undefined, minutes: undefined })}
                    >
                      Vorgabe
                    </button>
                  ) : (
                    <span className="faint">Vorgabe</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="faint" style={{ padding: 'var(--space-2)' }}>
        {anyCustom
          ? 'Die Minuten sind zur Leg-Anzahl vorbelegt und lassen sich überschreiben – sie bestimmen, wie lang der Zeitslot dieser Runde im Spielplan ist.'
          : 'Ohne Eintrag spielt jede Runde die Vorgabe der KO-Phase. Die Minuten passen sich der Leg-Anzahl an und bestimmen den Zeitplan.'}
      </p>
    </div>
  );
}
