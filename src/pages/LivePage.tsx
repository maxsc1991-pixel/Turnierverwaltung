import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { BracketView } from '../components/BracketView';
import { MatchCard } from '../components/MatchCard';
import { ResultDialog } from '../components/ResultDialog';
import { PlacementTable } from '../components/PlacementTable';
import { StandingsTable } from '../components/StandingsTable';
import { Resolver, indexMatches } from '../engine/resolve';
import { describeSlot } from '../engine/labels';
import { formatTime } from '../engine/schedule';
import {
  SCORING_LABEL,
  SPORT_LABEL,
  allowsNoShow,
  applyKoSettings,
  bestOf,
  drawPossible,
  hasKoPhase,
  scoringOf,
  type Match,
  type Player,
  type Tournament,
} from '../engine/types';
import { findGroupOption } from '../engine/validation';
import { relevantMatches } from '../engine/doubleKo';
import { KoRoundTable } from '../components/KoRoundTable';
import {
  configForMatch,
  koRoundLabelsOf,
  legsSummary,
  roundSettings,
  startedRounds,
} from '../engine/rounds';
import {
  allStandings,
  groupOrigins,
  groupPhaseComplete,
  tournamentComplete,
  type GroupOrigin,
} from '../engine/tournament';

export function LivePage() {
  const navigate = useNavigate();
  const tournament = useTournamentStore((s) => s.active);
  const setResult = useTournamentStore((s) => s.setResult);
  const clearResult = useTournamentStore((s) => s.clearResult);
  const finish = useTournamentStore((s) => s.finish);
  const setKoRound = useTournamentStore((s) => s.setKoRound);
  const withdrawPlayer = useTournamentStore((s) => s.withdrawPlayer);
  const reinstatePlayer = useTournamentStore((s) => s.reinstatePlayer);

  const [editing, setEditing] = useState<string | null>(null);
  const [pane, setPane] = useState<'left' | 'right'>('right');
  const [showPlayed, setShowPlayed] = useState(false);

  const resolver = useMemo(() => new Resolver(tournament?.matches ?? []), [tournament?.matches]);
  const byId = useMemo(() => indexMatches(tournament?.matches ?? []), [tournament?.matches]);
  const standings = useMemo(() => (tournament ? allStandings(tournament) : new Map()), [tournament]);
  const origins = useMemo(() => (tournament ? groupOrigins(tournament) : new Map()), [tournament]);

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

  // Die KO-Phase kann eigene Spieldauer und Leg-Anzahl haben.
  const koConfig = applyKoSettings(config, tournament.ko);
  // Jede KO-Runde kann eine eigene Leg-Anzahl haben – die Zuordnung Spiel →
  // geltende Konfiguration gehört deshalb in die Engine, nicht hierher.
  const configFor = (match: Match) => configForMatch(tournament, match);
  const stageConfig = inGroupPhase ? config : koConfig;

  const groupsDone = groupPhaseComplete(tournament);
  const needsKo = hasKoPhase(config);
  const finished = tournamentComplete(tournament);
  const editingMatch = editing ? matches.find((m) => m.id === editing) : undefined;
  // Runden, in denen schon ein Ergebnis steht, dürfen ihre Leg-Anzahl nicht
  // mehr ändern – ein 2:1 wäre in einem Best of 1 kein gültiges Ergebnis.
  const koRounds = roundSettings(config, tournament.ko, koRoundLabelsOf(tournament));
  const locked = startedRounds(tournament);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{config.name || 'Turnier läuft'}</h1>
          <p className="page-head__meta">
            {SPORT_LABEL[config.sport]} · {inGroupPhase ? 'Gruppenphase' : 'KO-Phase'} ·{' '}
            {inGroupPhase ? `Best of ${bestOf(stageConfig)}` : legsSummary(koRounds, bestOf(stageConfig))}
            {scoringOf(stageConfig) === 'legBonus' && ` · Wertung ${SCORING_LABEL.legBonus}`} ·{' '}
            {played.length} von {relevant.length} Spielen gespielt
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => navigate('/plan')}>
            Turnierplan
          </button>
          {inGroupPhase && groupsDone && needsKo && (
            <button type="button" className="btn btn--primary" onClick={() => navigate('/ko-start')}>
              KO-Phase vorbereiten
            </button>
          )}
          {finished && tournament.stage !== 'finished' && (!inGroupPhase || !needsKo) && (
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

      {inGroupPhase && groupsDone && needsKo && (
        <div className="notice notice--success">
          Die Gruppenphase ist abgeschlossen.{' '}
          {option?.bestThirds
            ? `Es qualifizieren sich die ersten beiden jeder Gruppe sowie die ${option.bestThirds} besten Dritten.`
            : config.groupCount === 1
              ? 'Die beiden Erstplatzierten bestreiten das Finale.'
              : 'Es qualifizieren sich die ersten beiden jeder Gruppe.'}{' '}
          Über „KO-Phase vorbereiten“ werden Spieldauer, Legs und die Setzung festgelegt.
        </div>
      )}

      {inGroupPhase && groupsDone && !needsKo && (
        <div className="notice notice--success">
          Alle Gruppenspiele sind gespielt – die Endtabelle entscheidet. Über „Turnier abschließen“
          wandert das Ergebnis ins Archiv.
        </div>
      )}

      {tournament.stage === 'finished' && <FinalRanking tournament={tournament} />}

      {!inGroupPhase && tournament.stage !== 'finished' && koRounds.length > 0 && (
        <div className="card">
          <div className="card__head">
            <div className="card__title">Legs je KO-Runde</div>
            <span className="faint">
              Kürzt eine Runde und zieht alles danach im Zeitplan nach vorne.
            </span>
          </div>
          <div className="card__body card__body--flush">
            <KoRoundTable rounds={koRounds} locked={locked} onChange={setKoRound} />
          </div>
        </div>
      )}

      {allowsNoShow(config) && tournament.stage !== 'finished' && (
        <NoShowCard
          tournament={tournament}
          onWithdraw={withdrawPlayer}
          onReinstate={reinstatePlayer}
        />
      )}

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
                      qualifyingPlaces={needsKo ? 2 : 0}
                      thirdPlaceCandidate={(option?.bestThirds ?? 0) > 0}
                      showPoints={config.sport === 'cornhole'}
                      withdrawn={tournament.withdrawn}
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
                        origins={inGroupPhase ? undefined : origins}
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
                        origins={inGroupPhase ? undefined : origins}
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
          config={configFor(editingMatch)}
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
  origins,
  onEnterResult,
}: {
  match: Match;
  resolver: Resolver;
  players: Parameters<typeof describeSlot>[2];
  byId: Map<string, Match>;
  origins?: Map<string, GroupOrigin>;
  onEnterResult: () => void;
}) {
  const a = describeSlot(match.a, resolver, players, byId);
  const b = describeSlot(match.b, resolver, players, byId);
  const winner = resolver.winner(match.id);
  const winnerId = winner.kind === 'player' ? winner.playerId : undefined;

  const origin = (side: typeof a) => {
    const info = side.playerId ? origins?.get(side.playerId) : undefined;
    return info ? (
      <span className="origin-tag" title={`${info.groupName} · Platz ${info.rank}`}>
        {info.short}
      </span>
    ) : null;
  };

  const name = (side: typeof a) => (
    <>
      {match.result && side.playerId === winnerId ? <strong>{side.name}</strong> : side.name}
      {origin(side)}
    </>
  );

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

function FinalRanking({
  tournament,
}: {
  tournament: NonNullable<ReturnType<typeof useTournamentStore.getState>['active']>;
}) {
  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">Endstand</div>
        <span className="badge badge--green">Turnier abgeschlossen</span>
      </div>
      <div className="card__body card__body--flush">
        <PlacementTable tournament={tournament} />
      </div>
    </div>
  );
}

/**
 * Nicht angetretene Teams. Bewusst zurückhaltend platziert und zugeklappt: das
 * ist ein Eingriff, kein Alltagshandgriff – und er lässt sich zurücknehmen.
 */
function NoShowCard({
  tournament,
  onWithdraw,
  onReinstate,
}: {
  tournament: Tournament;
  onWithdraw: (playerId: string) => void;
  onReinstate: (playerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');

  const withdrawn = tournament.withdrawn ?? [];
  const nameOf = (id: string) => tournament.players.find((p) => p.id === id)?.name ?? id;
  const available: Player[] = tournament.players.filter((p) => !withdrawn.includes(p.id));
  const selected = choice || available[0]?.id || '';

  return (
    <div className="card">
      <div className="card__head">
        <div className="card__title">
          Nicht angetreten
          {withdrawn.length > 0 && <span className="badge badge--red">{withdrawn.length}</span>}
        </div>
        <button type="button" className="btn btn--sm" onClick={() => setOpen(!open)}>
          {open ? 'Ausblenden' : 'Team melden'}
        </button>
      </div>

      {(open || withdrawn.length > 0) && (
        <div className="card__body stack">
          {withdrawn.length > 0 && (
            <div className="stack">
              {withdrawn.map((id) => (
                <div className="row row--between" key={id}>
                  <span>
                    <strong>{nameOf(id)}</strong>
                    <span className="faint"> · offene Spiele kampflos gewertet</span>
                  </span>
                  <button type="button" className="btn btn--sm" onClick={() => onReinstate(id)}>
                    Doch angetreten
                  </button>
                </div>
              ))}
            </div>
          )}

          {open && available.length > 0 && (
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="noshow-player">Team</label>
                <select
                  id="noshow-player"
                  value={selected}
                  onChange={(e) => setChoice(e.target.value)}
                >
                  {available.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                      {player.club ? ` · ${player.club}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn--primary"
                disabled={!selected}
                onClick={() => {
                  if (
                    confirm(
                      `${nameOf(selected)} als nicht angetreten melden? Alle noch offenen Spiele gehen kampflos an den Gegner.`,
                    )
                  ) {
                    onWithdraw(selected);
                    setChoice('');
                  }
                }}
              >
                Kampflos werten
              </button>
            </div>
          )}

          <p className="faint">
            Bereits gespielte Ergebnisse bleiben unverändert. Rücken beste Dritte nach, sind die
            Punkte dieser Gruppe nicht mehr mit denen der anderen vergleichbar – die KO-Seite weist
            darauf hin.
          </p>
        </div>
      )}
    </div>
  );
}
