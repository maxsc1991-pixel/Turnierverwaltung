import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { PlayerManager } from '../components/PlayerManager';
import { KoRoundTable } from '../components/KoRoundTable';
import { roundSettings, withRoundSetting } from '../engine/rounds';
import {
  DART_GAME_LABEL,
  FORMAT_LABEL,
  SCORING_LABEL,
  SPORT_LABEL,
  allowsNoShow,
  bestOf,
  scoringOf,
  type DartGame,
  type Format,
  type Scoring,
  type Sport,
} from '../engine/types';
import {
  MAX_PARTICIPANTS,
  MAX_SINGLE_GROUP,
  MIN_PARTICIPANTS,
  findGroupOption,
  groupOptions,
  hasErrors,
  roundNames,
  validateConfig,
} from '../engine/validation';

const SCORING_HINTS: Record<Scoring, string> = {
  standard: 'Sieg 2 Punkte, Unentschieden 1, Niederlage 0. Danach entscheidet die Leg-Differenz.',
  legBonus:
    'Sieg ohne verlorenes Leg 3 Punkte, jeder andere Sieg 2, eine Niederlage mit mindestens einem gewonnenen Leg 1. Die Leg-Differenz entfällt als Kriterium – bei Gleichstand entscheidet der direkte Vergleich.',
};

const FORMAT_HINTS: Record<Format, string> = {
  single_ko: 'Wer verliert, ist raus. Krumme Teilnehmerzahlen werden mit Freilosen aufgefüllt.',
  double_ko:
    'Nach der ersten Niederlage geht es in die Verliererrunde. Erst die zweite Niederlage bedeutet das Aus.',
  groups: 'Jeder gegen jeden in Gruppen, danach eine KO-Runde mit den Qualifizierten.',
};

export function ConfigPage() {
  const navigate = useNavigate();
  const config = useTournamentStore((s) => s.config);
  const players = useTournamentStore((s) => s.players);
  const setConfig = useTournamentStore((s) => s.setConfig);
  const generatePlan = useTournamentStore((s) => s.generatePlan);
  const active = useTournamentStore((s) => s.active);
  const displayRefreshSeconds = useTournamentStore((s) => s.displayRefreshSeconds);
  const setDisplayRefreshSeconds = useTournamentStore((s) => s.setDisplayRefreshSeconds);

  const options = useMemo(() => groupOptions(config.participants), [config.participants]);
  const selectedOption = findGroupOption(config.participants, config.groupCount);
  const issues = useMemo(() => validateConfig(config, players.length), [config, players.length]);
  // Spiele der Gruppenphase: jeder gegen jeden je Gruppe, mit Rückrunde doppelt.
  const groupMatchCount =
    config.groupCount *
    ((config.groupSize * (config.groupSize - 1)) / 2) *
    (config.returnLeg ? 2 : 1);
  const blocked = hasErrors(issues);
  // Die KO-Runden ergeben sich aus dem Modus und der Teilnehmerzahl – im
  // Gruppenmodus aus den Qualifizierten, nicht aus den Teilnehmern.
  const koRounds = useMemo(() => roundSettings(config), [config]);

  const changeParticipants = (value: number) => {
    const participants = Math.min(MAX_PARTICIPANTS, Math.max(MIN_PARTICIPANTS, value || 0));
    const available = groupOptions(participants);
    // Die bisherige Gruppenanzahl beibehalten, wenn sie weiterhin passt.
    const keep = available.find((o) => o.groupCount === config.groupCount) ?? available[0];
    setConfig({
      participants,
      groupCount: keep?.groupCount ?? config.groupCount,
      groupSize: keep?.groupSize ?? config.groupSize,
    });
  };

  const changeGroupCount = (groupCount: number) => {
    const option = findGroupOption(config.participants, groupCount);
    setConfig({ groupCount, groupSize: option?.groupSize ?? config.participants / groupCount });
  };

  const onGenerate = () => {
    generatePlan();
    navigate('/plan');
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Turnier konfigurieren</h1>
          <p className="page-head__meta">
            Sportart wählen, Turniereinstellungen festlegen, Spieler erfassen – am Ende wird der
            Spielplan ausgelost.
          </p>
        </div>
        {active && (
          <button type="button" className="btn" onClick={() => navigate('/plan')}>
            Zum bestehenden Turnierplan
          </button>
        )}
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">Sportart</div>
        </div>
        <div className="card__body">
          <div className="segmented">
            {(Object.keys(SPORT_LABEL) as Sport[]).map((sport) => (
              <button
                key={sport}
                type="button"
                className={config.sport === sport ? 'is-active' : ''}
                onClick={() => setConfig({ sport })}
              >
                {SPORT_LABEL[sport]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">Turnierdaten</div>
        </div>
        <div className="card__body">
          <div className="grid grid--4">
            <div className="field">
              <label htmlFor="cfg-name">Turniername</label>
              <input
                id="cfg-name"
                type="text"
                value={config.name}
                placeholder="z.B. Vereinsmeisterschaft"
                onChange={(e) => setConfig({ name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cfg-start">Turnierstart</label>
              <input
                id="cfg-start"
                type="time"
                value={config.startTime}
                onChange={(e) => setConfig({ startTime: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cfg-duration">⌀ Spieldauer (Min.)</label>
              <input
                id="cfg-duration"
                type="number"
                min={1}
                max={180}
                value={config.avgMatchMinutes}
                onChange={(e) => setConfig({ avgMatchMinutes: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="cfg-fields">
                {config.sport === 'dart' ? 'Anzahl Boards' : 'Anzahl Bahnen'}
              </label>
              <input
                id="cfg-fields"
                type="number"
                min={1}
                max={32}
                value={config.fields}
                onChange={(e) => setConfig({ fields: Number(e.target.value) })}
              />
              <span className="field__hint">Wie viele Spiele laufen gleichzeitig?</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">Turniermodus</div>
        </div>
        <div className="card__body stack">
          <div className="segmented">
            {(Object.keys(FORMAT_LABEL) as Format[]).map((format) => (
              <button
                key={format}
                type="button"
                className={config.format === format ? 'is-active' : ''}
                onClick={() => setConfig({ format })}
              >
                {FORMAT_LABEL[format]}
              </button>
            ))}
          </div>
          <p className="faint">{FORMAT_HINTS[config.format]}</p>

          <div className="grid grid--3">
            <div className="field">
              <label htmlFor="cfg-participants">Teilnehmeranzahl</label>
              <input
                id="cfg-participants"
                type="number"
                min={MIN_PARTICIPANTS}
                max={MAX_PARTICIPANTS}
                value={config.participants}
                onChange={(e) => changeParticipants(Number(e.target.value))}
              />
              <span className="field__hint">
                {MIN_PARTICIPANTS} bis {MAX_PARTICIPANTS} Teilnehmer
              </span>
            </div>

            {config.format === 'groups' && (
              <>
                <div className="field">
                  <label htmlFor="cfg-groups">Gruppenanzahl</label>
                  <select
                    id="cfg-groups"
                    value={config.groupCount}
                    onChange={(e) => changeGroupCount(Number(e.target.value))}
                  >
                    {options.length === 0 && <option value={config.groupCount}>keine gültige Einteilung</option>}
                    {options.map((option) => (
                      <option key={option.groupCount} value={option.groupCount}>
                        {option.groupCount === 1
                          ? `1 Gruppe mit ${option.groupSize} Spielern`
                          : `${option.groupCount} Gruppen à ${option.groupSize}`}
                      </option>
                    ))}
                  </select>
                  <span className="field__hint">
                    Gruppen × Stärke muss die Teilnehmerzahl ergeben. Eine einzelne Gruppe ist bis{' '}
                    {MAX_SINGLE_GROUP} Spieler möglich.
                  </span>
                </div>
                <div className="field">
                  <span className="field-label">Gruppenstärke</span>
                  <input type="number" value={config.groupSize} readOnly disabled />
                  <span className="field__hint">Ergibt sich aus Teilnehmern ÷ Gruppen.</span>
                </div>
              </>
            )}
          </div>

          {config.format === 'groups' && selectedOption && (
            <>
              <label className="row">
                <input
                  type="checkbox"
                  checked={config.returnLeg ?? false}
                  onChange={(e) => setConfig({ returnLeg: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                <span>Hin- und Rückrunde spielen</span>
              </label>
              <p className="faint">
                {config.returnLeg
                  ? `Jede Paarung wird zweimal ausgetragen – ${groupMatchCount} statt ${groupMatchCount / 2} Gruppenspiele. Die Rückrunde beginnt erst, wenn die Hinrunde der Gruppe komplett ist.`
                  : `Jede Paarung wird einmal ausgetragen – ${groupMatchCount} Gruppenspiele.`}
              </p>
            </>
          )}

          {config.format === 'groups' && selectedOption && config.groupCount === 1 && (
            <>
              <label className="row">
                <input
                  type="checkbox"
                  checked={config.groupFinal}
                  onChange={(e) => setConfig({ groupFinal: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                <span>Nach der Gruppenphase ein Finale austragen</span>
              </label>
              <div className="notice notice--success">
                <div>
                  {config.groupFinal ? (
                    <>
                      <strong>Jeder gegen jeden, danach ein Finale</strong> – die beiden
                      Erstplatzierten der Gruppe spielen den Sieger aus. Dritter wird der Dritte der
                      Tabelle.
                    </>
                  ) : (
                    <>
                      <strong>Reine Gruppenphase</strong> – jeder gegen jeden, die Endtabelle
                      entscheidet. Nach dem letzten Spiel ist das Turnier beendet.
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {config.format === 'groups' && selectedOption && config.groupCount > 1 && (
            <div className="notice notice--success">
              <div>
                <strong>
                  {selectedOption.qualifiers} Qualifizierte für die KO-Phase
                </strong>{' '}
                – die ersten beiden jeder Gruppe
                {selectedOption.bestThirds > 0
                  ? ` sowie die ${selectedOption.bestThirds} besten Gruppendritten`
                  : ''}
                . KO-Runden: {roundNames(selectedOption.qualifiers).join(' → ')}.
              </div>
            </div>
          )}

          {config.format !== 'double_ko' && !(config.format === 'groups' && config.groupCount === 1) && (
            <label className="row">
              <input
                type="checkbox"
                checked={config.thirdPlaceMatch}
                onChange={(e) => setConfig({ thirdPlaceMatch: e.target.checked })}
                style={{ width: 'auto' }}
              />
              <span>Spiel um Platz 3 austragen</span>
            </label>
          )}
          {config.format === 'double_ko' && (
            <p className="faint">
              Im Doppel-KO ergibt sich Platz 3 aus der Verliererrunde – ein separates Spiel um Platz 3
              entfällt.
            </p>
          )}

          {koRounds.length > 0 && (
            <div className="field">
              <span className="field-label">Legs je KO-Runde</span>
              <KoRoundTable
                rounds={koRounds}
                onChange={(label, patch) =>
                  setConfig({ koRounds: withRoundSetting(config.koRounds, label, patch) })
                }
              />
            </div>
          )}

          <label className="row">
            <input
              type="checkbox"
              checked={allowsNoShow(config)}
              onChange={(e) => setConfig({ noShowWalkover: e.target.checked })}
              style={{ width: 'auto' }}
            />
            <span>Nicht angetretene Teams kampflos werten</span>
          </label>
          <p className="faint">
            {allowsNoShow(config)
              ? 'Während des Turniers lässt sich ein Team als nicht angetreten markieren. Seine noch offenen Spiele gehen kampflos an den Gegner, bereits gespielte Ergebnisse bleiben stehen.'
              : 'Ohne diese Option gibt es während des Turniers keinen Weg, ein fehlendes Team zu behandeln – vor dem Start wird es stattdessen aus der Spielerliste entfernt und neu ausgelost.'}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">
            {config.sport === 'dart' ? 'Dart-Einstellungen' : 'Cornhole-Einstellungen'}
          </div>
        </div>
        <div className="card__body stack">
          {config.sport === 'dart' ? (
            <>
              <div className="field">
                <span className="field-label">Spielart</span>
                <div className="segmented">
                  {(Object.keys(DART_GAME_LABEL) as DartGame[]).map((game) => (
                    <button
                      key={game}
                      type="button"
                      className={config.dart.game === game ? 'is-active' : ''}
                      onClick={() => setConfig({ dart: { ...config.dart, game } })}
                    >
                      {DART_GAME_LABEL[game]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid--3">
                {(Object.keys(DART_GAME_LABEL) as DartGame[]).map((game) => (
                  <div className="field" key={game}>
                    <label htmlFor={`legs-${game}`}>
                      Legs {DART_GAME_LABEL[game]}
                      {config.dart.game === game && ' (aktiv)'}
                    </label>
                    <input
                      id={`legs-${game}`}
                      type="number"
                      min={1}
                      max={15}
                      value={config.dart.legs[game]}
                      onChange={(e) =>
                        setConfig({
                          dart: {
                            ...config.dart,
                            legs: { ...config.dart.legs, [game]: Number(e.target.value) },
                          },
                        })
                      }
                    />
                    <span className="field__hint">
                      Best of {config.dart.legs[game]} – {Math.floor(config.dart.legs[game] / 2) + 1}{' '}
                      Legs zum Sieg
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid grid--2">
              <div className="field">
                <label htmlFor="cfg-cornhole-legs">Anzahl Legs</label>
                <input
                  id="cfg-cornhole-legs"
                  type="number"
                  min={1}
                  max={15}
                  value={config.cornhole.legs}
                  onChange={(e) =>
                    setConfig({ cornhole: { ...config.cornhole, legs: Number(e.target.value) } })
                  }
                />
                <span className="field__hint">
                  Best of {config.cornhole.legs} – {Math.floor(config.cornhole.legs / 2) + 1} Legs zum
                  Sieg
                </span>
              </div>
              <div className="field">
                <span className="field-label">Punkte pro Leg</span>
                <input type="number" value={config.cornhole.targetPoints} readOnly disabled />
                <span className="field__hint">
                  Gewonnen hat, wer zuerst {config.cornhole.targetPoints} Punkte erreicht.
                </span>
              </div>
            </div>
          )}

          <div className="field">
            <span className="field-label">Wertung der Gruppentabelle</span>
            <div className="segmented">
              {(Object.keys(SCORING_LABEL) as Scoring[]).map((scoring) => (
                <button
                  key={scoring}
                  type="button"
                  className={scoringOf(config) === scoring ? 'is-active' : ''}
                  disabled={bestOf(config) === 1}
                  onClick={() => setConfig({ scoring })}
                >
                  {SCORING_LABEL[scoring]}
                </button>
              ))}
            </div>
            <span className="field__hint">
              {bestOf(config) === 1
                ? 'Über ein einzelnes Leg gibt es keinen Leg-Bonus – hier gilt immer: Sieg 2 Punkte, Niederlage 0.'
                : SCORING_HINTS[scoringOf(config)]}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">Anzeigeseite</div>
          <span className="faint">Turnierstand für Zuschauer, ohne Bedienelemente</span>
        </div>
        <div className="card__body">
          <div className="grid grid--2" style={{ alignItems: 'end' }}>
            <div className="field">
              <label htmlFor="cfg-refresh">Automatisch aktualisieren (Sek.)</label>
              <input
                id="cfg-refresh"
                type="number"
                min={0}
                max={600}
                step={5}
                value={displayRefreshSeconds}
                onChange={(e) => setDisplayRefreshSeconds(Number(e.target.value))}
              />
              <span className="field__hint">
                {displayRefreshSeconds > 0
                  ? `Die Anzeige liest den Turnierstand alle ${displayRefreshSeconds} Sekunden neu ein. 0 schaltet die automatische Aktualisierung ab.`
                  : 'Automatische Aktualisierung ist abgeschaltet – die Anzeige zeigt den Stand vom Öffnen.'}
              </span>
            </div>
            <div className="field">
              <span className="field-label">Zweiter Bildschirm</span>
              <button
                type="button"
                className="btn"
                onClick={() => window.open(`${window.location.href.split('#')[0]}#/anzeige`, '_blank')}
              >
                Anzeige in neuem Fenster öffnen
              </button>
              <span className="field__hint">
                Läuft die Anzeige in einem eigenen Fenster, holt sie sich neue Ergebnisse über diese
                Aktualisierung.
              </span>
            </div>
          </div>
        </div>
      </div>

      <PlayerManager />

      <div className="card">
        <div className="card__head">
          <div className="card__title">Spielplan generieren</div>
        </div>
        <div className="card__body stack">
          {issues.length === 0 && (
            <div className="notice notice--success">
              Alle Angaben sind plausibel. Der Spielplan kann ausgelost werden.
            </div>
          )}
          {issues.map((issue, index) => (
            <div
              key={`${issue.field}-${index}`}
              className={`notice notice--${issue.level === 'error' ? 'error' : 'warning'}`}
            >
              {issue.message}
            </div>
          ))}

          {active && (
            <div className="notice notice--warning">
              Es existiert bereits ein Turnierplan. Beim erneuten Generieren wird dieser
              einschließlich aller eingetragenen Ergebnisse ersetzt.
            </div>
          )}

          <div className="btn-row">
            <button
              type="button"
              className="btn btn--primary"
              disabled={blocked || players.length < 2}
              onClick={onGenerate}
            >
              Spielplan generieren
            </button>
            {players.length < 2 && <span className="faint">Mindestens 2 Spieler erfassen.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
