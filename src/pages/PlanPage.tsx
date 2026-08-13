import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { BracketView } from '../components/BracketView';
import { Resolver, indexMatches } from '../engine/resolve';
import { describeSlot } from '../engine/labels';
import { estimatedEnd, findScheduleConflicts, formatTime, startDate } from '../engine/schedule';
import { FORMAT_LABEL, SPORT_LABEL, bestOf, type Match } from '../engine/types';
import { findGroupOption, roundNames } from '../engine/validation';

export function PlanPage() {
  const navigate = useNavigate();
  const tournament = useTournamentStore((s) => s.active);
  const redrawPlan = useTournamentStore((s) => s.redrawPlan);
  const swapPlayers = useTournamentStore((s) => s.swapPlayers);
  const setGroupField = useTournamentStore((s) => s.setGroupField);
  const setMatchField = useTournamentStore((s) => s.setMatchField);
  const setMatchTime = useTournamentStore((s) => s.setMatchTime);
  const confirmPlan = useTournamentStore((s) => s.confirmPlan);

  const [selected, setSelected] = useState<string | null>(null);

  const resolver = useMemo(() => new Resolver(tournament?.matches ?? []), [tournament?.matches]);
  const byId = useMemo(() => indexMatches(tournament?.matches ?? []), [tournament?.matches]);

  if (!tournament) {
    return (
      <div className="card">
        <div className="card__body stack">
          <div className="empty">Es wurde noch kein Turnierplan generiert.</div>
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
  const locked = tournament.stage !== 'plan';
  const option = findGroupOption(config.participants, config.groupCount);
  const playable = matches.filter((m) => !resolver.isWalkover(m));
  const end = estimatedEnd(matches, config);
  const conflicts = findScheduleConflicts(playable);

  const pick = (playerId: string) => {
    if (locked) return;
    if (!selected) {
      setSelected(playerId);
      return;
    }
    if (selected !== playerId) swapPlayers(selected, playerId);
    setSelected(null);
  };

  const nameOf = (playerId: string) => players.find((p) => p.id === playerId)?.name ?? '–';

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{config.name || 'Turnierplan'}</h1>
          <p className="page-head__meta">
            {SPORT_LABEL[config.sport]} · {FORMAT_LABEL[config.format]} · {players.length} Teilnehmer ·
            Best of {bestOf(config)} · {config.fields}{' '}
            {config.sport === 'dart' ? 'Boards' : 'Bahnen'}
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => navigate('/')}>
            Zurück zur Konfiguration
          </button>
          {!locked && (
            <button type="button" className="btn" onClick={redrawPlan}>
              Neu auslosen
            </button>
          )}
        </div>
      </div>

      {locked && (
        <div className="notice notice--warning">
          Das Turnier läuft bereits – der Plan kann nicht mehr verändert werden.
        </div>
      )}

      {!locked && (
        <div className="plan-swap">
          {selected ? (
            <>
              <strong>{nameOf(selected)}</strong> ist ausgewählt – jetzt den Tauschpartner anklicken.
              <button
                type="button"
                className="btn btn--sm"
                style={{ marginLeft: 'auto' }}
                onClick={() => setSelected(null)}
              >
                Abbrechen
              </button>
            </>
          ) : (
            <>Zum Tauschen zwei Spieler nacheinander anklicken.</>
          )}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Tile label="Spiele gesamt" value={String(playable.length)} />
        <Tile label="Turnierstart" value={formatTime(startDate(config.startTime).toISOString())} />
        <Tile label="Voraussichtliches Ende" value={end ? formatTime(end.toISOString()) : '–'} />
        <Tile
          label={config.format === 'groups' ? 'KO-Runden' : 'Runden'}
          value={
            config.format === 'groups' && option
              ? String(roundNames(option.qualifiers).length)
              : String(new Set(matches.filter((m) => m.phase !== 'third').map((m) => `${m.phase}-${m.round}`)).size)
          }
        />
      </div>

      {config.format === 'groups' ? (
        <div className="card">
          <div className="card__head">
            <div className="card__title">Gruppenauslosung</div>
            {option && (
              <span className="badge badge--green">
                {option.qualifiers} Qualifizierte · {roundNames(option.qualifiers).join(' → ')}
              </span>
            )}
          </div>
          <div className="card__body">
            <div className="group-grid">
              {groups.map((group) => (
                <div className="card" key={group.id} style={{ marginTop: 0 }}>
                  <div className="group-card__head">
                    <span>{group.name}</span>
                    {locked ? (
                      <span className="badge badge--dark">
                        {group.field ? `Feld ${group.field}` : `${group.playerIds.length} Spieler`}
                      </span>
                    ) : (
                      <label className="group-field">
                        <span>Feld</span>
                        <select
                          value={group.field ?? ''}
                          aria-label={`Spielfeld für ${group.name}`}
                          onChange={(e) =>
                            setGroupField(group.id, e.target.value ? Number(e.target.value) : undefined)
                          }
                        >
                          <option value="">automatisch</option>
                          {Array.from({ length: config.fields }, (_, i) => i + 1).map((field) => (
                            <option key={field} value={field}>
                              {field}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="card__body" style={{ padding: 'var(--space-2)' }}>
                    {group.playerIds.map((playerId, index) => {
                      const player = players.find((p) => p.id === playerId);
                      return (
                        <button
                          key={playerId}
                          type="button"
                          className={`swap-target${selected === playerId ? ' is-selected' : ''}`}
                          onClick={() => pick(playerId)}
                          disabled={locked}
                        >
                          <span className="muted" style={{ marginRight: 8 }}>
                            {index + 1}.
                          </span>
                          {player?.name}
                          {player?.club && <span className="faint"> · {player.club}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card__head">
            <div className="card__title">Setzliste der ersten Runde</div>
          </div>
          <div className="card__body">
            <div className="grid grid--2">
              {matches
                .filter((m) => m.round === 1 && (m.phase === 'ko' || m.phase === 'wb'))
                .map((match) => (
                  <div className="match-card" key={match.id}>
                    <div className="match-card__head">
                      <span>{match.label}</span>
                      <span>{resolver.isWalkover(match) ? 'Freilos' : formatTime(match.scheduledAt)}</span>
                    </div>
                    <div className="card__body" style={{ padding: 'var(--space-2)' }}>
                      {[match.a, match.b].map((slot, index) => {
                        const info = describeSlot(slot, resolver, players, byId);
                        if (info.kind !== 'player') {
                          return (
                            <div className="swap-target faint" key={index}>
                              {info.name}
                            </div>
                          );
                        }
                        return (
                          <button
                            key={info.playerId}
                            type="button"
                            className={`swap-target${selected === info.playerId ? ' is-selected' : ''}`}
                            onClick={() => info.playerId && pick(info.playerId)}
                            disabled={locked}
                          >
                            {info.name}
                            {info.club && <span className="faint"> · {info.club}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {config.format !== 'groups' && (
        <div className="card">
          <div className="card__head">
            <div className="card__title">Turnierbaum</div>
          </div>
          <div className="card__body card__body--flush">
            <BracketView tournament={tournament} />
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__head">
          <div className="card__title">Spielfelder und Zeiten</div>
          <span className="faint">
            Automatisch so verteilt, dass die Pausen möglichst gleichmäßig sind.
          </span>
        </div>
        {conflicts.length > 0 && (
          <div style={{ padding: 'var(--space-4) var(--space-5) 0' }}>
            <div className="notice notice--warning">
              <div>
                <strong>Doppelbelegung:</strong> {conflicts.length}{' '}
                {conflicts.length === 1 ? 'Zeitpunkt ist' : 'Zeitpunkte sind'} doppelt belegt –{' '}
                {conflicts
                  .slice(0, 3)
                  .map((c) => `Feld ${c.field} um ${formatTime(c.scheduledAt)}`)
                  .join(', ')}
                {conflicts.length > 3 ? ' …' : ''}. Über „Neu auslosen" wird der Spielplan wieder
                sauber verteilt.
              </div>
            </div>
          </div>
        )}
        <div className="card__body card__body--flush">
          <div className="table-scroll">
            <table className="schedule-table">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Feld</th>
                  <th>Spiel</th>
                  <th>Paarung</th>
                </tr>
              </thead>
              <tbody>
                {playable
                  .slice()
                  .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
                  .map((match) => (
                    <ScheduleRow
                      key={match.id}
                      match={match}
                      fields={config.fields}
                      locked={locked}
                      label={pairLabel(match, resolver, players, byId)}
                      onField={(field) => setMatchField(match.id, field)}
                      onTime={(iso) => setMatchTime(match.id, iso)}
                    />
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {!locked && (
        <div className="card">
          <div className="card__body">
            <div className="row row--between">
              <div>
                <h2>Turnierplan bestätigen</h2>
                <p className="faint">
                  Danach beginnt das Turnier und die Auslosung kann nicht mehr geändert werden.
                </p>
              </div>
              <button
                type="button"
                className="btn btn--success"
                onClick={() => {
                  confirmPlan();
                  navigate('/live');
                }}
              >
                Turnier starten
              </button>
            </div>
          </div>
        </div>
      )}

      {locked && (
        <div className="btn-row btn-row--end">
          <button type="button" className="btn btn--primary" onClick={() => navigate('/live')}>
            Zur Turnieransicht
          </button>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile__value">{value}</div>
      <div className="stat-tile__label">{label}</div>
    </div>
  );
}

function ScheduleRow({
  match,
  fields,
  locked,
  label,
  onField,
  onTime,
}: {
  match: Match;
  fields: number;
  locked: boolean;
  label: string;
  onField: (field: number) => void;
  onTime: (iso: string) => void;
}) {
  const time = match.scheduledAt ? new Date(match.scheduledAt) : null;
  const timeValue = time
    ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
    : '';

  return (
    <tr>
      <td>
        {locked ? (
          <span className="mono">{formatTime(match.scheduledAt)}</span>
        ) : (
          <input
            type="time"
            value={timeValue}
            aria-label={`Startzeit ${match.label}`}
            onChange={(e) => {
              const [hours, minutes] = e.target.value.split(':').map(Number);
              const next = time ? new Date(time) : new Date();
              next.setHours(hours || 0, minutes || 0, 0, 0);
              onTime(next.toISOString());
            }}
          />
        )}
      </td>
      <td>
        {locked ? (
          match.field ?? '–'
        ) : (
          <select
            value={match.field ?? 1}
            aria-label={`Spielfeld ${match.label}`}
            onChange={(e) => onField(Number(e.target.value))}
          >
            {Array.from({ length: fields }, (_, i) => i + 1).map((field) => (
              <option key={field} value={field}>
                {field}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="faint">{match.label}</td>
      <td>{label}</td>
    </tr>
  );
}

function pairLabel(
  match: Match,
  resolver: Resolver,
  players: Parameters<typeof describeSlot>[2],
  byId: Map<string, Match>,
): string {
  const a = describeSlot(match.a, resolver, players, byId);
  const b = describeSlot(match.b, resolver, players, byId);
  return `${a.name} – ${b.name}`;
}
