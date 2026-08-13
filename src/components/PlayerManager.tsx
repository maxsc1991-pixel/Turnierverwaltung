import { useState, type FormEvent } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import { findDuplicateNames, parsePlayerList } from '../engine/players';

export function PlayerManager() {
  const players = useTournamentStore((s) => s.players);
  const addPlayer = useTournamentStore((s) => s.addPlayer);
  const addPlayersFromText = useTournamentStore((s) => s.addPlayersFromText);
  const updatePlayer = useTournamentStore((s) => s.updatePlayer);
  const removePlayer = useTournamentStore((s) => s.removePlayer);
  const movePlayer = useTournamentStore((s) => s.movePlayer);
  const clearPlayers = useTournamentStore((s) => s.clearPlayers);

  const [name, setName] = useState('');
  const [club, setClub] = useState('');
  const [bulk, setBulk] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const duplicates = findDuplicateNames(players);
  const bulkPreview = parsePlayerList(bulk);

  const submitSingle = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    addPlayer(name, club);
    setName('');
    setClub('');
    setFeedback(null);
  };

  const submitBulk = () => {
    const count = addPlayersFromText(bulk);
    setBulk('');
    setFeedback(count > 0 ? `${count} Spieler übernommen.` : 'Keine Spieler erkannt.');
  };

  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">
          Spieler
          <span className="badge">{players.length}</span>
        </div>
        {players.length > 0 && (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              if (confirm('Alle erfassten Spieler entfernen?')) clearPlayers();
            }}
          >
            Alle entfernen
          </button>
        )}
      </div>

      <div className="card__body stack">
        <form className="grid grid--2" onSubmit={submitSingle} style={{ alignItems: 'end' }}>
          <div className="field">
            <label htmlFor="player-name">Spielername *</label>
            <input
              id="player-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Max Mustermann"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="player-club">Verein (optional)</label>
            <input
              id="player-club"
              type="text"
              value={club}
              onChange={(e) => setClub(e.target.value)}
              placeholder="z.B. DC Lok Pfalzel"
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={!name.trim()}>
            Spieler hinzufügen
          </button>
        </form>

        <div className="field">
          <label htmlFor="player-bulk">Mehrere Spieler auf einmal</label>
          <textarea
            id="player-bulk"
            value={bulk}
            onChange={(e) => {
              setBulk(e.target.value);
              setFeedback(null);
            }}
            placeholder={'Max Mustermann (Lok Pfalzel); Anna Schmitt, Tim Weber - DC Trier'}
          />
          <span className="field__hint">
            Getrennt durch Komma, Semikolon oder Zeilenumbruch. Der Verein darf in Klammern oder nach
            einem Bindestrich stehen.
          </span>
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <button type="button" className="btn" onClick={submitBulk} disabled={!bulkPreview.length}>
              {bulkPreview.length > 0
                ? `${bulkPreview.length} Spieler übernehmen`
                : 'Spieler übernehmen'}
            </button>
            {feedback && <span className="faint">{feedback}</span>}
          </div>
        </div>

        {duplicates.length > 0 && (
          <div className="notice notice--warning">
            Doppelte Namen: {duplicates.join(', ')}. Namen sollten eindeutig sein, damit die ewige
            Tabelle richtig zählt.
          </div>
        )}

        {players.length === 0 ? (
          <div className="empty">Noch keine Spieler erfasst.</div>
        ) : (
          <div className="player-list">
            {players.map((player, index) => (
              <div className="player-row" key={player.id}>
                <span className="player-row__seed">{player.seed}</span>
                <input
                  type="text"
                  value={player.name}
                  aria-label={`Name von Spieler ${player.seed}`}
                  onChange={(e) => updatePlayer(player.id, { name: e.target.value })}
                />
                <input
                  type="text"
                  value={player.club ?? ''}
                  placeholder="Verein"
                  aria-label={`Verein von ${player.name}`}
                  onChange={(e) => updatePlayer(player.id, { club: e.target.value })}
                />
                <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                  <button
                    type="button"
                    className="btn btn--icon"
                    title="Nach oben"
                    disabled={index === 0}
                    onClick={() => movePlayer(player.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn--icon"
                    title="Nach unten"
                    disabled={index === players.length - 1}
                    onClick={() => movePlayer(player.id, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn--icon"
                    title="Entfernen"
                    onClick={() => removePlayer(player.id)}
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="faint">
          Die Reihenfolge bestimmt die Setzliste: Spieler 1 ist topgesetzt und erhält bei krummen
          Teilnehmerzahlen das erste Freilos.
        </p>
      </div>
    </div>
  );
}
