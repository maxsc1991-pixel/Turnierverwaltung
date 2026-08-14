import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { STORAGE_KEY, useTournamentStore } from '../store/useTournamentStore';
import { StandingsTable } from '../components/StandingsTable';
import { Resolver, indexMatches } from '../engine/resolve';
import { describeSlot } from '../engine/labels';
import { formatTime } from '../engine/schedule';
import { relevantMatches } from '../engine/doubleKo';
import { SPORT_LABEL, hasKoPhase, type Match } from '../engine/types';
import { findGroupOption, roundNames } from '../engine/validation';
import {
  allStandings,
  groupOrigins,
  groupPhaseComplete,
  type GroupOrigin,
} from '../engine/tournament';

/**
 * Anzeigetafel für die Teilnehmer: alles Wichtige auf einen Blick und ohne
 * Bedienelemente – Gruppentabellen, laufende und nächste Spiele sowie der
 * Turnierbaum. Gedacht für einen zweiten Bildschirm oder Beamer.
 */
export function DisplayPage() {
  const navigate = useNavigate();
  const tournament = useTournamentStore((s) => s.active);
  const refreshSeconds = useTournamentStore((s) => s.displayRefreshSeconds);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  /*
   * Läuft die Anzeige in einem zweiten Fenster, hat sie einen eigenen
   * Speicherzustand und bekommt dort eingetragene Ergebnisse nicht mit. Sie
   * liest den Stand deshalb regelmäßig neu aus dem localStorage ein.
   * Zusätzlich meldet der Browser über das storage-Ereignis sofort, wenn ein
   * anderes Fenster geschrieben hat – dann ist die Anzeige ohne Wartezeit aktuell.
   */
  useEffect(() => {
    let cancelled = false;
    const reload = async () => {
      await useTournamentStore.persist.rehydrate();
      if (!cancelled) setLastRefresh(new Date());
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEY) void reload();
    };
    window.addEventListener('storage', onStorage);

    const timer =
      refreshSeconds > 0 ? window.setInterval(() => void reload(), refreshSeconds * 1000) : undefined;

    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [refreshSeconds]);

  const resolver = useMemo(() => new Resolver(tournament?.matches ?? []), [tournament?.matches]);
  const byId = useMemo(() => indexMatches(tournament?.matches ?? []), [tournament?.matches]);
  const standings = useMemo(() => (tournament ? allStandings(tournament) : new Map()), [tournament]);
  const origins = useMemo(() => (tournament ? groupOrigins(tournament) : new Map()), [tournament]);

  if (!tournament || tournament.stage === 'plan') {
    return (
      <div className="card">
        <div className="card__body stack">
          <div className="empty">Es läuft derzeit kein Turnier.</div>
          <div className="btn-row btn-row--end">
            <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>
              Zur Konfiguration
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { config, players, matches, groups } = tournament;
  const inGroupPhase = tournament.stage === 'group';
  const option = findGroupOption(config.participants, config.groupCount);
  const needsKo = hasKoPhase(config);

  const relevant = relevantMatches(matches, resolver).filter((m) => !resolver.isWalkover(m));
  const played = relevant.filter((m) => m.result);
  const ready = relevant
    .filter((m) => resolver.status(m) === 'ready')
    .sort(
      (a, b) =>
        (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '') || (a.field ?? 0) - (b.field ?? 0),
    );

  const current = ready.slice(0, config.fields);
  const upcoming = ready.slice(config.fields, config.fields + 8);
  const koMatches = matches.filter((m) => m.phase !== 'group');
  const showKo = koMatches.length > 0;

  const nameOf = (slot: Match['a']) => describeSlot(slot, resolver, players, byId);

  return (
    <div className="display">
      <div className="display__head">
        <div>
          <h1>{config.name || 'Turnier'}</h1>
          <p className="display__meta">
            {SPORT_LABEL[config.sport]} ·{' '}
            {tournament.stage === 'finished'
              ? 'Turnier beendet'
              : inGroupPhase
                ? 'Gruppenphase'
                : 'KO-Phase'}{' '}
            · {played.length} von {relevant.length} Spielen
          </p>
        </div>
        <div className="display__status">
          <div className="display__progress" aria-hidden="true">
            <div
              className="display__progress-bar"
              style={{ width: `${relevant.length ? (played.length / relevant.length) * 100 : 0}%` }}
            />
          </div>
          <span className="display__refresh">
            {refreshSeconds > 0 ? (
              <>
                <span className="display__refresh-dot" /> aktualisiert alle {refreshSeconds}s
                {lastRefresh && ` · zuletzt ${lastRefresh.toLocaleTimeString('de-DE')}`}
              </>
            ) : (
              'automatische Aktualisierung aus'
            )}
          </span>
        </div>
      </div>

      {/* Laufende Spiele – der wichtigste Block für die Zuschauer. */}
      <section className="display__section">
        <h2 className="display__title">
          <span className="display__dot" /> Läuft jetzt
        </h2>
        {current.length === 0 ? (
          <p className="display__empty">
            {played.length === relevant.length ? 'Alle Spiele sind gespielt.' : 'Gleich geht es weiter.'}
          </p>
        ) : (
          <div className="display__now">
            {current.map((match) => {
              const a = nameOf(match.a);
              const b = nameOf(match.b);
              return (
                <div className="now-card" key={match.id}>
                  <div className="now-card__field">
                    {match.field ? `Feld ${match.field}` : match.roundLabel}
                  </div>
                  <div className="now-card__players">
                    <span>
                      {a.name}
                      <Origin origins={origins} playerId={a.playerId} hide={inGroupPhase} />
                    </span>
                    <span className="now-card__vs">:</span>
                    <span>
                      {b.name}
                      <Origin origins={origins} playerId={b.playerId} hide={inGroupPhase} />
                    </span>
                  </div>
                  <div className="now-card__meta">{match.label}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="display__columns">
        {/* Gruppenstände */}
        {groups.length > 0 && (
          <section className="display__section">
            <h2 className="display__title">
              {inGroupPhase || !showKo ? 'Gruppenstand' : 'Endstand der Gruppen'}
              {groupPhaseComplete(tournament) && (
                <span className="badge badge--green">abgeschlossen</span>
              )}
            </h2>
            <div className="display__groups">
              {groups.map((group) => (
                <div className="display__group" key={group.id}>
                  <div className="display__group-head">
                    <span>{group.name}</span>
                    {group.field && <span className="badge badge--red">Feld {group.field}</span>}
                  </div>
                  <StandingsTable
                    standings={standings.get(group.id) ?? []}
                    players={players}
                    qualifyingPlaces={needsKo ? 2 : 0}
                    thirdPlaceCandidate={(option?.bestThirds ?? 0) > 0}
                    showPoints={config.sport === 'cornhole'}
                    compact
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Kommende Paarungen */}
        <section className="display__section">
          <h2 className="display__title">Als Nächstes</h2>
          {upcoming.length === 0 ? (
            <p className="display__empty">Keine weiteren Paarungen.</p>
          ) : (
            <ul className="display__next">
              {upcoming.map((match) => {
                const a = nameOf(match.a);
                const b = nameOf(match.b);
                return (
                  <li key={match.id}>
                    <span className="display__next-time">{formatTime(match.scheduledAt)}</span>
                    <span className="display__next-pair">
                      {a.name}
                      <Origin origins={origins} playerId={a.playerId} hide={inGroupPhase} />
                      <span className="muted"> – </span>
                      {b.name}
                      <Origin origins={origins} playerId={b.playerId} hide={inGroupPhase} />
                    </span>
                    <span className="display__next-meta">
                      {match.field ? `Feld ${match.field}` : match.roundLabel}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Turnierbaum – kompakt, ohne Bedienelemente */}
      {showKo && (
        <section className="display__section">
          <h2 className="display__title">
            KO-Phase
            {option && <span className="badge">{roundNames(option.qualifiers).join(' → ')}</span>}
          </h2>
          <div className="display__bracket">
            {koRounds(koMatches).map((round) => (
              <div className="display__round" key={round.title}>
                <div className="display__round-title">{round.title}</div>
                {round.matches.map((match) => {
                  const a = nameOf(match.a);
                  const b = nameOf(match.b);
                  const winner = resolver.winner(match.id);
                  const winnerId = winner.kind === 'player' ? winner.playerId : undefined;
                  const cls = (side: typeof a) =>
                    side.playerId && side.playerId === winnerId
                      ? 'display__slot display__slot--winner'
                      : 'display__slot';
                  return (
                    <div className="display__match" key={match.id}>
                      <div className={cls(a)}>
                        <span>
                          {a.name}
                          <Origin origins={origins} playerId={a.playerId} />
                        </span>
                        <b>{match.result?.legsA ?? ''}</b>
                      </div>
                      <div className={cls(b)}>
                        <span>
                          {b.name}
                          <Origin origins={origins} playerId={b.playerId} />
                        </span>
                        <b>{match.result?.legsB ?? ''}</b>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {tournament.stage === 'finished' && tournament.finalRanking && (
        <section className="display__section">
          <h2 className="display__title">Endstand</h2>
          <div className="display__podium">
            {tournament.finalRanking
              .filter((entry) => entry.rank <= 3)
              .map((entry) => (
                <div className={`podium podium--${entry.rank}`} key={entry.playerId}>
                  <span className="podium__rank">{entry.rank}</span>
                  <span className="podium__name">
                    {players.find((p) => p.id === entry.playerId)?.name ?? '–'}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Origin({
  origins,
  playerId,
  hide = false,
}: {
  origins: Map<string, GroupOrigin>;
  playerId?: string;
  hide?: boolean;
}) {
  const origin = !hide && playerId ? origins.get(playerId) : undefined;
  if (!origin) return null;
  return (
    <span className="origin-tag" title={`${origin.groupName} · Platz ${origin.rank}`}>
      {origin.short}
    </span>
  );
}

/** Alle KO-Spiele in Spalten je Runde, Gruppierung wie im Turnierbaum. */
function koRounds(matches: readonly Match[]): Array<{ title: string; matches: Match[] }> {
  const rounds = new Map<string, Match[]>();
  const order: Match['phase'][] = ['wb', 'lb', 'ko', 'third', 'gf', 'gf_reset'];

  for (const phase of order) {
    for (const match of matches.filter((m) => m.phase === phase)) {
      const key = match.roundLabel;
      rounds.set(key, [...(rounds.get(key) ?? []), match]);
    }
  }
  return [...rounds.entries()].map(([title, list]) => ({ title, matches: list }));
}
