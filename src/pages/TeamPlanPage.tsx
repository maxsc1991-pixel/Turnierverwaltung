import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { Logo } from '../components/Logo';
import { allTeamPlans, nextTeamMatch, type TeamPlan } from '../engine/teamPlan';
import { formatTime } from '../engine/schedule';
import { FORMAT_LABEL, SPORT_LABEL, type TournamentConfig } from '../engine/types';

export function TeamPlanPage() {
  const navigate = useNavigate();
  const tournament = useTournamentStore((s) => s.active);

  const plans = useMemo(() => (tournament ? allTeamPlans(tournament) : []), [tournament]);
  const [selectedId, setSelectedId] = useState<string>('');
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
  const selected = plans.find((p) => p.player.id === selectedId) ?? plans[0];

  return (
    <div className={`stack teamplan${printAll ? ' teamplan--all' : ''}`}>
      <div className="page-head no-print">
        <div>
          <h1>Spielplan pro Team</h1>
          <p className="page-head__meta">
            {config.name || 'Turnier'} · {SPORT_LABEL[config.sport]} · {FORMAT_LABEL[config.format]} ·{' '}
            {plans.length} Teams
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
        <div className="card__body">
          <div className="row row--between teamplan__picker">
            <div className="field">
              <label htmlFor="teamplan-team">Team</label>
              <select
                id="teamplan-team"
                value={selected?.player.id ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {plans.map((plan) => (
                  <option key={plan.player.id} value={plan.player.id}>
                    {plan.player.name}
                    {plan.player.club ? ` · ${plan.player.club}` : ''}
                    {plan.groupName ? ` · ${plan.groupName}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <p className="faint">
              Im Druckdialog „Als PDF speichern" wählen, um die Pläne ohne Drucker weiterzugeben –
              jedes Team bekommt ein eigenes Blatt.
            </p>
          </div>
        </div>
      </div>

      {selected && (
        <div className="teamplan__single">
          <TeamSheet plan={selected} config={config} />
        </div>
      )}

      {/* Nur für den Druck aller Aushänge – auf dem Bildschirm ausgeblendet. */}
      <div className="teamplan__sheets">
        {plans.map((plan) => (
          <TeamSheet key={plan.player.id} plan={plan} config={config} />
        ))}
      </div>
    </div>
  );
}

function TeamSheet({ plan, config }: { plan: TeamPlan; config: TournamentConfig }) {
  const next = nextTeamMatch(plan.matches);
  const fieldWord = config.sport === 'dart' ? 'Board' : 'Bahn';

  return (
    <section className="card team-sheet">
      <div className="card__head team-sheet__head">
        <div className="team-sheet__brand">
          <Logo size={36} />
          <div>
            <div className="card__title">{plan.player.name}</div>
            <div className="faint">
              {[plan.player.club, plan.groupName].filter(Boolean).join(' · ') || 'Ohne Verein'}
            </div>
          </div>
        </div>
        <div className="team-sheet__meta">
          <span className="badge badge--dark">{config.name || 'Turnier'}</span>
          {next ? (
            <span className="badge badge--green">
              Nächstes Spiel {formatTime(next.scheduledAt)}
              {next.field ? ` · ${fieldWord} ${next.field}` : ''}
            </span>
          ) : (
            <span className="badge">Alle Spiele gespielt</span>
          )}
        </div>
      </div>
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
