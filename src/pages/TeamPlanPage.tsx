import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { Logo } from '../components/Logo';
import {
  allFieldPlans,
  allTeamPlans,
  nextOpenMatch,
  type FieldPlan,
  type TeamPlan,
} from '../engine/teamPlan';
import { formatTime } from '../engine/schedule';
import { FORMAT_LABEL, SPORT_LABEL, type TournamentConfig } from '../engine/types';

type View = 'team' | 'field';

export function TeamPlanPage() {
  const navigate = useNavigate();
  const tournament = useTournamentStore((s) => s.active);

  const teamPlans = useMemo(() => (tournament ? allTeamPlans(tournament) : []), [tournament]);
  const fieldPlans = useMemo(() => (tournament ? allFieldPlans(tournament) : []), [tournament]);

  const [view, setView] = useState<View>('team');
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [selectedField, setSelectedField] = useState<string>('');
  // Beim Drucken aller Aushänge wird kurzzeitig die vollständige Liste
  // eingeblendet; danach schaltet die Seite von selbst zurück.
  const [printAll, setPrintAll] = useState(false);

  useEffect(() => {
    if (!printAll) return;
    const reset = () => setPrintAll(false);
    window.addEventListener('afterprint', reset);
    // Erst nach dem Rendern drucken, sonst fehlen die eingeblendeten Blätter.
    const id = window.setTimeout(() => {
      window.print();
      reset();
    }, 50);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('afterprint', reset);
    };
  }, [printAll]);

  if (!tournament) {
    return (
      <div className="card">
        <div className="card__body stack">
          <div className="empty">Es läuft kein Turnier – daher gibt es noch keine Spielpläne.</div>
          <div className="btn-row btn-row--end">
            <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>
              Zur Konfiguration
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { config } = tournament;
  const fieldWord = config.sport === 'dart' ? 'Board' : 'Bahn';
  const fieldWords = config.sport === 'dart' ? 'Boards' : 'Bahnen';
  const byField = view === 'field';

  const team = teamPlans.find((p) => p.player.id === selectedTeam) ?? teamPlans[0];
  const field = fieldPlans.find((p) => String(p.field) === selectedField) ?? fieldPlans[0];

  const sheets = byField
    ? fieldPlans.map((plan) => (
        <FieldSheet key={plan.field} plan={plan} config={config} fieldWord={fieldWord} />
      ))
    : teamPlans.map((plan) => <TeamSheet key={plan.player.id} plan={plan} config={config} />);

  const current = byField
    ? field && <FieldSheet plan={field} config={config} fieldWord={fieldWord} />
    : team && <TeamSheet plan={team} config={config} />;

  return (
    <div className={`stack teamplan${printAll ? ' teamplan--all' : ''}`}>
      <div className="page-head no-print">
        <div>
          <h1>Spielplan pro {byField ? 'Spielfeld' : 'Team'}</h1>
          <p className="page-head__meta">
            {config.name || 'Turnier'} · {SPORT_LABEL[config.sport]} · {FORMAT_LABEL[config.format]} ·{' '}
            {byField
              ? `${fieldPlans.length} ${fieldPlans.length === 1 ? fieldWord : fieldWords}`
              : `${teamPlans.length} Teams`}
          </p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => window.print()}>
            Diesen Plan drucken
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setPrintAll(true)}>
            Alle Pläne drucken
          </button>
        </div>
      </div>

      <div className="card no-print">
        <div className="card__body stack">
          <div className="field">
            <span className="field-label">Aufteilung</span>
            <div className="segmented">
              <button
                type="button"
                className={byField ? '' : 'is-active'}
                onClick={() => setView('team')}
              >
                Nach Team
              </button>
              <button
                type="button"
                className={byField ? 'is-active' : ''}
                onClick={() => setView('field')}
              >
                Nach Spielfeld
              </button>
            </div>
          </div>

          <div className="row row--between teamplan__picker">
            {byField ? (
              <div className="field">
                <label htmlFor="teamplan-field">{fieldWord}</label>
                <select
                  id="teamplan-field"
                  value={field ? String(field.field) : ''}
                  onChange={(e) => setSelectedField(e.target.value)}
                >
                  {fieldPlans.map((plan) => (
                    <option key={plan.field} value={plan.field}>
                      {fieldWord} {plan.field} · {plan.matches.length} Spiele
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="teamplan-team">Team</label>
                <select
                  id="teamplan-team"
                  value={team?.player.id ?? ''}
                  onChange={(e) => setSelectedTeam(e.target.value)}
                >
                  {teamPlans.map((plan) => (
                    <option key={plan.player.id} value={plan.player.id}>
                      {plan.player.name}
                      {plan.player.club ? ` · ${plan.player.club}` : ''}
                      {plan.groupName ? ` · ${plan.groupName}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="faint">
              Im Druckdialog „Als PDF speichern" wählen, um die Pläne ohne Drucker weiterzugeben –
              {byField ? ` jedes ${fieldWord} bekommt` : ' jedes Team bekommt'} ein eigenes Blatt.
            </p>
          </div>
        </div>
      </div>

      {current && <div className="teamplan__single">{current}</div>}

      {/* Nur für den Druck aller Aushänge – auf dem Bildschirm ausgeblendet. */}
      <div className="teamplan__sheets">{sheets}</div>
    </div>
  );
}

function SheetHead({
  title,
  subtitle,
  config,
  next,
  fieldWord,
  showField,
}: {
  title: string;
  subtitle: string;
  config: TournamentConfig;
  next?: { scheduledAt?: string; field?: number };
  fieldWord: string;
  showField: boolean;
}) {
  return (
    <div className="card__head team-sheet__head">
      <div className="team-sheet__brand">
        <Logo size={36} />
        <div>
          <div className="card__title">{title}</div>
          <div className="faint">{subtitle}</div>
        </div>
      </div>
      <div className="team-sheet__meta">
        <span className="badge badge--dark">{config.name || 'Turnier'}</span>
        {next ? (
          <span className="badge badge--green">
            Nächstes Spiel {formatTime(next.scheduledAt)}
            {showField && next.field ? ` · ${fieldWord} ${next.field}` : ''}
          </span>
        ) : (
          <span className="badge">Alle Spiele gespielt</span>
        )}
      </div>
    </div>
  );
}

function TeamSheet({ plan, config }: { plan: TeamPlan; config: TournamentConfig }) {
  const next = nextOpenMatch(plan.matches);
  const fieldWord = config.sport === 'dart' ? 'Board' : 'Bahn';

  return (
    <section className="card team-sheet">
      <SheetHead
        title={plan.player.name}
        subtitle={[plan.player.club, plan.groupName].filter(Boolean).join(' · ') || 'Ohne Verein'}
        config={config}
        next={next}
        fieldWord={fieldWord}
        showField
      />
      <div className="card__body card__body--flush">
        {plan.matches.length === 0 ? (
          <div className="empty">
            Für dieses Team stehen noch keine Spiele fest – die Paarungen der nächsten Runde ergeben
            sich aus den laufenden Spielen.
          </div>
        ) : (
          <div className="table-scroll">
            <table className="schedule-table team-sheet__table">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>{fieldWord}</th>
                  <th>Spiel</th>
                  <th>Gegner</th>
                  <th>Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {plan.matches.map((match) => (
                  <tr key={match.matchId} className={match.status === 'done' ? 'is-done' : undefined}>
                    <td className="mono">{match.walkover ? '–' : formatTime(match.scheduledAt)}</td>
                    <td className="mono">{match.field ?? '–'}</td>
                    <td className="faint">{match.label}</td>
                    <td>
                      {match.walkover ? 'Freilos – kein Spiel' : match.opponent.name}
                      {match.opponent.club && <span className="faint"> · {match.opponent.club}</span>}
                    </td>
                    <td className={`mono team-sheet__result team-sheet__result--${match.outcome ?? 'open'}`}>
                      {match.result ?? (match.walkover ? 'weiter' : '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Aushang fürs Spielfeld: alles, was hier nacheinander gespielt wird. Noch
 * offene KO-Paarungen stehen mit ihrem Platzhalter darin, damit die Belegung
 * des Feldes vollständig ist.
 */
function FieldSheet({
  plan,
  config,
  fieldWord,
}: {
  plan: FieldPlan;
  config: TournamentConfig;
  fieldWord: string;
}) {
  const next = nextOpenMatch(plan.matches);
  const played = plan.matches.filter((m) => m.status === 'done').length;

  return (
    <section className="card team-sheet">
      <SheetHead
        title={`${fieldWord} ${plan.field}`}
        subtitle={`${plan.matches.length} Spiele · ${played} gespielt`}
        config={config}
        next={next}
        fieldWord={fieldWord}
        showField={false}
      />
      <div className="card__body card__body--flush">
        {plan.matches.length === 0 ? (
          <div className="empty">Für dieses Spielfeld ist noch nichts angesetzt.</div>
        ) : (
          <div className="table-scroll">
            <table className="schedule-table team-sheet__table">
              <thead>
                <tr>
                  <th>Zeit</th>
                  <th>Spiel</th>
                  <th>Paarung</th>
                  <th>Ergebnis</th>
                </tr>
              </thead>
              <tbody>
                {plan.matches.map((match) => (
                  <tr key={match.matchId} className={match.status === 'done' ? 'is-done' : undefined}>
                    <td className="mono">{formatTime(match.scheduledAt)}</td>
                    <td className="faint">{match.label}</td>
                    <td>
                      <Side side={match.home} />
                      <span className="muted"> – </span>
                      <Side side={match.away} />
                    </td>
                    <td className="mono">{match.result ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Side({ side }: { side: { name: string; club?: string; kind: string } }) {
  return (
    <span className={side.kind === 'player' ? undefined : 'faint'}>
      {side.name}
      {side.club && <span className="faint"> ({side.club})</span>}
    </span>
  );
}
