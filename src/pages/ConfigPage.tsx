import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { PlayerManager } from '../components/PlayerManager';
import {
  DART_GAME_LABEL,
  FORMAT_LABEL,
  SPORT_LABEL,
  type DartGame,
  type Format,
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

  const options = useMemo(() => groupOptions(config.participants), [config.participants]);
  const selectedOption = findGroupOption(config.participants, config.groupCount);
  const issues = useMemo(() => validateConfig(config, players.length), [config, players.length]);
  const blocked = hasErrors(issues);

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
