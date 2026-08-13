import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { StandingsTable } from '../components/StandingsTable';
import {
  DART_GAME_LABEL,
  SPORT_LABEL,
  bestOf,
  type KoSettings,
} from '../engine/types';
import { qualifyFromGroups } from '../engine/qualification';
import { allStandings, groupPhaseComplete, seedOf, standingsOptions } from '../engine/tournament';
import { estimatedEnd, formatTime } from '../engine/schedule';
import { findGroupOption, roundNames } from '../engine/validation';

/**
 * Zwischenschritt zwischen Gruppenphase und KO-Runde: hier werden Spieldauer,
 * Leg-Anzahl, Felder und Startzeit für die KO-Phase festgelegt und die
 * ermittelte Setzung zur Kontrolle angezeigt.
 */
export function KoSetupPage() {
  const navigate = useNavigate();
  const tournament = useTournamentStore((s) => s.active);
  const startKo = useTournamentStore((s) => s.startKo);

  const groupEnd = tournament ? estimatedEnd(
    tournament.matches.filter((m) => m.phase === 'group'),
    tournament.config,
  ) : null;

  const [settings, setSettings] = useState<KoSettings>(() => ({
    avgMatchMinutes: tournament?.config.avgMatchMinutes ?? 15,
    legs: tournament ? bestOf(tournament.config) : 3,
    fields: tournament?.config.fields ?? 2,
    startTime: '',
  }));

  const preview = useMemo(() => {
    if (!tournament || tournament.config.format !== 'groups') return null;
    const option = findGroupOption(tournament.config.participants, tournament.config.groupCount);
    return qualifyFromGroups(
      tournament.groups,
      allStandings(tournament),
      option?.bestThirds ?? 0,
      seedOf(tournament.players),
      standingsOptions(tournament.config),
    );
  }, [tournament]);

  if (!tournament || tournament.stage !== 'group') {
    return (
      <div className="card">
        <div className="card__body stack">
          <div className="empty">
            {tournament?.stage === 'ko'
              ? 'Die KO-Phase läuft bereits.'
              : 'Es ist keine Gruppenphase aktiv.'}
          </div>
          <div className="btn-row btn-row--end">
            <button type="button" className="btn btn--primary" onClick={() => navigate('/live')}>
              Zur Turnieransicht
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!groupPhaseComplete(tournament)) {
    return (
      <div className="card">
        <div className="card__body stack">
          <div className="notice notice--warning">
            Die Gruppenphase ist noch nicht abgeschlossen – es fehlen Ergebnisse.
          </div>
          <div className="btn-row btn-row--end">
            <button type="button" className="btn btn--primary" onClick={() => navigate('/live')}>
              Zurück zum Turnier
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { config, players } = tournament;
  const option = findGroupOption(config.participants, config.groupCount);
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '–';
  const legsToWin = Math.floor(settings.legs / 2) + 1;

  const start = () => {
    startKo({ ...settings, startTime: settings.startTime || undefined });
    navigate('/live');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>KO-Phase vorbereiten</h1>
          <p className="page-head__meta">
            {SPORT_LABEL[config.sport]} ·{' '}
            {option ? `${option.qualifiers} Qualifizierte · ${roundNames(option.qualifiers).join(' → ')}` : 'KO-Runde'}
          </p>
        </div>
        <button type="button" className="btn" onClick={() => navigate('/live')}>
          Zurück zum Turnier
        </button>
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">Einstellungen für die KO-Phase</div>
          <span className="faint">Gelten nur für die KO-Spiele, die Gruppenphase bleibt unberührt.</span>
        </div>
        <div className="card__body">
          <div className="grid grid--4">
            <div className="field">
              <label htmlFor="ko-duration">⌀ Spieldauer (Min.)</label>
              <input
                id="ko-duration"
                type="number"
                min={1}
                max={180}
                value={settings.avgMatchMinutes}
                onChange={(e) => setSettings({ ...settings, avgMatchMinutes: Number(e.target.value) })}
              />
              <span className="field__hint">
                In der Gruppenphase waren es {config.avgMatchMinutes} Minuten.
              </span>
            </div>

            <div className="field">
              <label htmlFor="ko-legs">
                Legs {config.sport === 'dart' ? DART_GAME_LABEL[config.dart.game] : 'Cornhole'}
              </label>
              <input
                id="ko-legs"
                type="number"
                min={1}
                max={15}
                value={settings.legs}
                onChange={(e) => setSettings({ ...settings, legs: Number(e.target.value) })}
              />
              <span className="field__hint">
                Best of {settings.legs} – {legsToWin} Legs zum Sieg
              </span>
            </div>

            <div className="field">
              <label htmlFor="ko-fields">
                {config.sport === 'dart' ? 'Anzahl Boards' : 'Anzahl Bahnen'}
              </label>
              <input
                id="ko-fields"
                type="number"
                min={1}
                max={32}
                value={settings.fields}
                onChange={(e) => setSettings({ ...settings, fields: Number(e.target.value) })}
              />
              <span className="field__hint">In der Gruppenphase waren es {config.fields}.</span>
            </div>

            <div className="field">
              <label htmlFor="ko-start">Startzeit</label>
              <input
                id="ko-start"
                type="time"
                value={settings.startTime ?? ''}
                onChange={(e) => setSettings({ ...settings, startTime: e.target.value })}
              />
              <span className="field__hint">
                {settings.startTime
                  ? 'Feste Uhrzeit für das erste KO-Spiel.'
                  : `Leer lassen = direkt im Anschluss (${groupEnd ? formatTime(groupEnd.toISOString()) : '–'}).`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">
            Setzung der ersten Runde
            <span className="badge">{preview?.pairings.length ?? 0} Spiele</span>
          </div>
          <span className="faint">Aus den Endständen der Gruppen ermittelt</span>
        </div>
        <div className="card__body">
          {!preview?.pairings.length ? (
            <div className="empty">Keine Paarungen ermittelbar.</div>
          ) : (
            <div className="grid grid--2">
              {preview.pairings.map((pair, index) => (
                <div className="match-card" key={`${pair.home.playerId}-${pair.away.playerId}`}>
                  <div className="match-card__head">
                    <span>{roundNames(option?.qualifiers ?? 2)[0]} {index + 1}</span>
                  </div>
                  <div className="match-card__body">
                    <div className="match-side">
                      <span className="match-side__name">
                        <strong>{nameOf(pair.home.playerId)}</strong>
                        <span className="match-side__club">
                          {pair.home.groupName} · Platz {pair.home.groupRank}
                        </span>
                      </span>
                    </div>
                    <div className="match-card__vs">gegen</div>
                    <div className="match-side">
                      <span className="match-side__name">
                        <strong>{nameOf(pair.away.playerId)}</strong>
                        <span className="match-side__club">
                          {pair.away.groupName} · Platz {pair.away.groupRank}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">Endstand der Gruppen</div>
        </div>
        <div className="card__body">
          <div className="group-grid">
            {tournament.groups.map((group) => (
              <div className="card" key={group.id} style={{ marginTop: 0 }}>
                <div className="group-card__head">
                  <span>{group.name}</span>
                </div>
                <div className="card__body card__body--flush">
                  <StandingsTable
                    standings={allStandings(tournament).get(group.id) ?? []}
                    players={players}
                    qualifyingPlaces={2}
                    thirdPlaceCandidate={(option?.bestThirds ?? 0) > 0}
                    showPoints={config.sport === 'cornhole'}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__body">
          <div className="row row--between">
            <div>
              <h2>KO-Phase starten</h2>
              <p className="faint">
                Der Spielplan der KO-Runde wird jetzt erzeugt. Die Gruppenergebnisse bleiben
                erhalten.
              </p>
            </div>
            <button type="button" className="btn btn--success" onClick={start}>
              KO-Phase starten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
