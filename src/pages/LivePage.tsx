import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { BracketView } from '../components/BracketView';
import { MatchCard } from '../components/MatchCard';
import { ResultDialog } from '../components/ResultDialog';
import { StandingsTable } from '../components/StandingsTable';
import { Resolver, indexMatches } from '../engine/resolve';
import { describeSlot } from '../engine/labels';
import { formatTime } from '../engine/schedule';
import { SPORT_LABEL, bestOf, drawPossible, type Match } from '../engine/types';
import { findGroupOption } from '../engine/validation';
import { relevantMatches } from '../engine/doubleKo';
import { allStandings, groupPhaseComplete, tournamentComplete } from '../engine/tournament';

export function LivePage() {
  const navigate = useNavigate();
  const tournament = useTournamentStore((s) => s.active);
  const setResult = useTournamentStore((s) => s.setResult);
  const clearResult = useTournamentStore((s) => s.clearResult);
  const startKo = useTournamentStore((s) => s.startKo);
  const finish = useTournamentStore((s) => s.finish);

  const [editing, setEditing] = useState<string | null>(null);
  const [pane, setPane] = useState<'left' | 'right'>('right');
  const [showPlayed, setShowPlayed] = useState(false);

  const resolver = useMemo(() => new Resolver(tournament?.matches ?? []), [tournament?.matches]);
  const byId = useMemo(() => indexMatches(tournament?.matches ?? []), [tournament?.matches]);
  const standings = useMemo(() => (tournament ? allStandings(tournament) : new Map()), [tournament]);

  if (!tournament || tournament.stage === 'plan') {
    return (
      <div className="card">
        <div className="card__body stack">
          <div className="empty">
            {tournament ? 'Der Turnierplan ist noch nicht bestätigt.' : 'Es läuft kein Turnier.'}
          </div>
          <div className="btn-row btn-row--end">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => navigate(tournament ? '/plan' : '/')}
            >
              {tournament ? 'Zum Turnierplan' : 'Zur Konfiguration'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { config, players, matches, groups } = tournament;
  const inGroupPhase = tournament.stage === 'group';
  const option = findGroupOption(config.participants, config.groupCount);

  // Freilose werden nie gespielt, und das Final-Rückspiel taucht nur auf, wenn
  // der Sieger der Siegerrunde das Grand Final tatsächlich verloren hat.
  const relevant = relevantMatches(matches, resolver).filter((m) => !resolver.isWalkover(m));

  const played = relevant.filter((m) => m.result);
  const ready = relevant
    .filter((m) => resolver.status(m) === 'ready')
    .sort(
      (a, b) =>
        (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '') || (a.field ?? 0) - (b.field ?? 0),
    );

  const current = ready.slice(0, config.fields);
  const upcoming = ready.slice(config.fields);
  const pendingCount = relevant.length - played.length;

  const groupsDone = groupPhaseComplete(tournament);
  const finished = tournamentComplete(tournament);
  const editingMatch = editing ? matches.find((m) => m.id === editing) : undefined;

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{config.name || 'Turnier läuft'}</h1>
          <p className="page-head__meta">
            {SPORT_LABEL[config.sport]} · {inGroupPhase ? 'Gruppenphase' : 'KO-Phase'} · Best of{' '}
            {bestOf(config)} · {played.length} von {relevant.length} Spielen gespielt
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => navigate('/plan')}>
            Turnierplan
          </button>
          {inGroupPhase && groupsDone && (
            <button type="button" className="btn btn--primary" onClick={startKo}>
              KO-Phase starten
            </button>
          )}
          {!inGroupPhase && finished && tournament.stage !== 'finished' && (
            <button
              type="button"
              className="btn btn--success"
              onClick={() => {
                finish();
                navigate('/historie');
              }}
            >
              Turnier abschließen
            </button>
          )}
        </div>
      </div>

      {inGroupPhase && groupsDone && (
        <div className="notice notice--success">
          Die Gruppenphase ist abgeschlossen.{' '}
          {option?.bestThirds
            ? `Es qualifizieren sich die ersten beiden jeder Gruppe sowie die ${option.bestThirds} besten Dritten.`
            : 'Es qualifizieren sich die ersten beiden jeder Gruppe.'}{' '}
          Über „KO-Phase starten“ wird die Setzung erzeugt.
        </div>
      )}

      {tournament.stage === 'finished' && <FinalRanking tournament={tournament} />}

      <div className="live-tabs">
        <button
          type="button"
          className={pane === 'left' ? 'is-active' : ''}
          onClick={() => setPane('left')}
        >
          {inGroupPhase ? 'Gruppen' : 'Turnierbaum'}
        </button>
        <button
          type="button"
          className={pane === 'right' ? 'is-active' : ''}
          onClick={() => setPane('right')}
        >
          Spiele {pendingCount > 0 ? `(${pendingCount})` : ''}
        </button>
      </div>

      <div className="live-layout">
        <div className={`live-layout__pane${pane === 'left' ? ' is-active' : ''}`}>
          {inGroupPhase ? (
            <div className="stack">
              {groups.map((group) => (
                <div className="card" key={group.id} style={{ marginTop: 0 }}>
                  <div className="group-card__head">
                    <span>{group.name}</span>
                    <span className="row" style={{ gap: 'var(--space-2)', flexWrap: 'nowrap' }}>
                      {group.field && <span className="badge badge--red">Feld {group.field}</span>}
                      <span className="badge badge--dark">
                        {matches.filter((m) => m.groupId === group.id && m.result).length} /{' '}
                        {matches.filter((m) => m.groupId === group.id).length} Spiele
                      </span>
                    </span>
                  </div>
                  <div className="card__body card__body--flush">
                    <StandingsTable
                      standings={standings.get(group.id) ?? []}
                      players={players}
                      qualifyingPlaces={2}
                      thirdPlaceCandidate={(option?.bestThirds ?? 0) > 0}
                    />
                  </div>
                </div>
              ))}
              {(option?.bestThirds ?? 0) > 0 && (
                <p className="faint">
                  Grün = direkt qualifiziert. Grau = Gruppendritter, von denen die{' '}
                  {option?.bestThirds} besten nachrücken.
                </p>
              )}
            </div>
          ) : (
            <div className="card" style={{ marginTop: 0 }}>
              <div className="card__head">
                <div className="card__title">Turnierbaum</div>
              </div>
              <div className="card__body card__body--flush">
                <BracketView tournament={tournament} />
              </div>
            </div>
          )}
        </div>

        <div className={`live-layout__pane${pane === 'right' ? ' is-active' : ''}`}>
          <div className="stack">
            <div className="card" style={{ marginTop: 0 }}>
              <div className="card__head">
                <div className="card__title">
                  Läuft jetzt
                  <span className="badge badge--red">{current.length}</span>
                </div>
              </div>
              <div className="card__body">
                {current.length === 0 ? (
                  <div className="empty">
                    {pendingCount === 0
                      ? 'Alle Spiele dieser Phase sind gespielt.'
                      : 'Kein Spiel bereit – es fehlen noch Ergebnisse aus vorherigen Runden.'}
                  </div>
                ) : (
                  <div className="field-grid">
                    {current.map((match) => (
                      <MatchCard
                        key={match.id}
                        match={match}
                        resolver={resolver}
                        players={players}
                        byId={byId}
                        live
                        onEnterResult={() => setEditing(match.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ marginTop: 0 }}>
              <div className="card__head">
                <div className="card__title">
                  Als Nächstes
                  <span className="badge">{upcoming.length}</span>
                </div>
              </div>
              <div className="card__body">
                {upcoming.length === 0 ? (
                  <div className="empty">Keine weiteren Paarungen vorgemerkt.</div>
                ) : (
                  <div className="upcoming-list">
                    {upcoming.slice(0, 16).map((match) => (
                      <UpcomingRow
                        key={match.id}
                        match={match}
                        resolver={resolver}
                        players={players}
                        byId={byId}
                        onEnterResult={() => setEditing(match.id)}
                      />
                    ))}
                    {upcoming.length > 16 && (
                      <p className="faint">… und {upcoming.length - 16} weitere Spiele</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ marginTop: 0 }}>
              <div className="card__head">
                <div className="card__title">
                  Bereits gespielt
                  <span className="badge badge--green">{played.length}</span>
                </div>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => setShowPlayed((v) => !v)}
                  disabled={played.length === 0}
                >
                  {showPlayed ? 'Ausblenden' : 'Anzeigen'}
                </button>
              </div>
              {showPlayed && played.length > 0 && (
                <div className="card__body">
                  <div className="upcoming-list">
                    {played
                      .slice()
                      .reverse()
                      .map((match) => (
                        <UpcomingRow
                          key={match.id}
                          match={match}
                          resolver={resolver}
                          players={players}
                          byId={byId}
                          onEnterResult={() => setEditing(match.id)}
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {editingMatch && (
        <ResultDialog
          match={editingMatch}
          matches={matches}
          players={players}
          config={config}
          allowDraw={editingMatch.phase === 'group' && drawPossible(config)}
          onSave={(result) => {
            setResult(editingMatch.id, result);
            setEditing(null);
          }}
          onClear={() => {
            clearResult(editingMatch.id);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function UpcomingRow({
  match,
  resolver,
  players,
  byId,
  onEnterResult,
}: {
  match: Match;
  resolver: Resolver;
  players: Parameters<typeof describeSlot>[2];
  byId: Map<string, Match>;
  onEnterResult: () => void;
}) {
  const a = describeSlot(match.a, resolver, players, byId);
  const b = describeSlot(match.b, resolver, players, byId);
  const winner = resolver.winner(match.id);
  const winnerId = winner.kind === 'player' ? winner.playerId : undefined;

  const name = (side: typeof a) =>
    match.result && side.playerId === winnerId ? <strong>{side.name}</strong> : side.name;

  return (
    <div className="upcoming-row">
      <span className="upcoming-row__time">{formatTime(match.scheduledAt)}</span>
      <span className="upcoming-row__pair">
        <span>
          {name(a)} <span className="muted">–</span> {name(b)}
        </span>
        <span className="upcoming-row__meta">
          {match.label}
          {match.field ? ` · Feld ${match.field}` : ''}
        </span>
      </span>
      <span className="row" style={{ flexWrap: 'nowrap' }}>
        {match.result && (
          <span className="mono">
            {match.result.legsA}:{match.result.legsB}
          </span>
        )}
        <button type="button" className="btn btn--sm" onClick={onEnterResult}>
          {match.result ? 'Ändern' : 'Ergebnis'}
        </button>
      </span>
    </div>
  );
}

function FinalRanking({ tournament }: { tournament: NonNullable<ReturnType<typeof useTournamentStore.getState>['active']> }) {
  const top = (tournament.finalRanking ?? []).filter((r) => r.rank <= 4);
  if (!top.length) return null;

  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">Endstand</div>
        <span className="badge badge--green">Turnier abgeschlossen</span>
      </div>
      <div className="card__body">
        <div className="stat-tiles">
          {top.map((entry) => (
            <div className="stat-tile" key={entry.playerId}>
              <div className="row">
                <span className={`rank-medal rank-medal--${entry.rank}`}>{entry.rank}</span>
                <strong>{tournament.players.find((p) => p.id === entry.playerId)?.name ?? '–'}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
