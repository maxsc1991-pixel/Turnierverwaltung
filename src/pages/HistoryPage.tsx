import { useMemo, useRef, useState } from 'react';
import {
  buildExport,
  parseImport,
  useTournamentStore,
} from '../store/useTournamentStore';
import { computeAllTimeStats, type PlayerStats } from '../engine/stats';
import { FORMAT_LABEL, SPORT_LABEL, type Sport, type Tournament } from '../engine/types';

type SortKey = keyof Pick<
  PlayerStats,
  'titles' | 'podiums' | 'points' | 'won' | 'matches' | 'legDiff' | 'tournaments'
>;

const COLUMNS: Array<{ key: SortKey; label: string; title: string }> = [
  { key: 'tournaments', label: 'Turniere', title: 'Teilnahmen' },
  { key: 'matches', label: 'Spiele', title: 'Gespielte Spiele' },
  { key: 'won', label: 'S', title: 'Siege' },
  { key: 'points', label: 'Pkt', title: 'Punkte (2 je Sieg)' },
  { key: 'legDiff', label: 'Legs', title: 'Leg-Differenz' },
  { key: 'podiums', label: 'Podest', title: 'Top-3-Platzierungen' },
  { key: 'titles', label: 'Titel', title: 'Turniersiege' },
];

export function HistoryPage() {
  const archive = useTournamentStore((s) => s.archive);
  const active = useTournamentStore((s) => s.active);
  const deleteArchived = useTournamentStore((s) => s.deleteArchived);
  const importData = useTournamentStore((s) => s.importData);

  const [sport, setSport] = useState<Sport | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('titles');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [message, setMessage] = useState<{ level: 'success' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => archive.filter((t) => (sport === 'all' ? true : t.config.sport === sport)),
    [archive, sport],
  );

  const stats = useMemo(
    () => computeAllTimeStats(archive, sport === 'all' ? undefined : sport),
    [archive, sport],
  );

  const sorted = useMemo(
    () =>
      stats.slice().sort((x, y) => {
        const diff = y[sortKey] - x[sortKey];
        return diff !== 0 ? diff : x.name.localeCompare(y.name, 'de-DE');
      }),
    [stats, sortKey],
  );

  const onExport = () => {
    const payload = buildExport({ active, archive });
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `turnierverwaltung-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage({ level: 'success', text: 'Datenbestand exportiert.' });
  };

  const onImport = async (file: File) => {
    try {
      importData(parseImport(await file.text()));
      setMessage({ level: 'success', text: 'Datenbestand importiert.' });
    } catch (error) {
      setMessage({
        level: 'error',
        text: error instanceof Error ? error.message : 'Die Datei konnte nicht gelesen werden.',
      });
    }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Ewige Tabelle</h1>
          <p className="page-head__meta">
            Alle abgeschlossenen Turniere und die daraus gerechnete Spielerstatistik.
          </p>
        </div>
        <div className="btn-row">
          <div className="segmented">
            <button
              type="button"
              className={sport === 'all' ? 'is-active' : ''}
              onClick={() => setSport('all')}
            >
              Alle
            </button>
            {(Object.keys(SPORT_LABEL) as Sport[]).map((s) => (
              <button
                key={s}
                type="button"
                className={sport === s ? 'is-active' : ''}
                onClick={() => setSport(s)}
              >
                {SPORT_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {message && (
        <div className={`notice notice--${message.level}`}>{message.text}</div>
      )}

      <div className="stat-tiles">
        <Tile label="Turniere" value={String(filtered.length)} />
        <Tile label="Spieler" value={String(stats.length)} />
        <Tile
          label="Spiele"
          value={String(stats.reduce((sum, s) => sum + s.matches, 0) / 2 || 0)}
        />
        <Tile
          label="Legs"
          value={String(stats.reduce((sum, s) => sum + s.legsFor, 0))}
        />
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">Spielerstatistik</div>
          <span className="faint">Spalte anklicken zum Sortieren</span>
        </div>
        <div className="card__body card__body--flush">
          {sorted.length === 0 ? (
            <div className="empty">
              Noch keine abgeschlossenen Turniere. Sobald ein Turnier abgeschlossen wird, erscheint es
              hier.
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Spieler</th>
                    {COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        className={`num sortable${sortKey === column.key ? ' is-active' : ''}`}
                        title={column.title}
                        onClick={() => setSortKey(column.key)}
                      >
                        {column.label}
                        {sortKey === column.key ? ' ▾' : ''}
                      </th>
                    ))}
                    <th className="num" title="Beste Platzierung">
                      Best
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, index) => (
                    <tr key={row.key}>
                      <td className="num muted">{index + 1}</td>
                      <td>
                        <span className="standings__name">{row.name}</span>
                        {row.club && <span className="standings__club">{row.club}</span>}
                      </td>
                      {COLUMNS.map((column) => (
                        <td className="num mono" key={column.key}>
                          {column.key === 'legDiff' && row.legDiff > 0 ? '+' : ''}
                          {row[column.key]}
                        </td>
                      ))}
                      <td className="num">
                        {row.bestRank ? (
                          <span className={`rank-medal rank-medal--${row.bestRank}`}>
                            {row.bestRank}
                          </span>
                        ) : (
                          '–'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card__head">
          <div className="card__title">
            Turnierarchiv
            <span className="badge">{filtered.length}</span>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn--sm" onClick={onExport}>
              Export (JSON)
            </button>
            <button type="button" className="btn btn--sm" onClick={() => fileInput.current?.click()}>
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImport(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <div className="card__body card__body--flush">
          {filtered.length === 0 ? (
            <div className="empty">Noch keine Turniere archiviert.</div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Turnier</th>
                    <th>Modus</th>
                    <th className="num">Teilnehmer</th>
                    <th>Sieger</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tournament) => (
                    <ArchiveRow
                      key={tournament.id}
                      tournament={tournament}
                      expanded={expanded === tournament.id}
                      onToggle={() =>
                        setExpanded((current) => (current === tournament.id ? null : tournament.id))
                      }
                      onDelete={() => {
                        if (confirm('Dieses Turnier endgültig aus dem Archiv löschen?')) {
                          deleteArchived(tournament.id);
                        }
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ArchiveRow({
  tournament,
  expanded,
  onToggle,
  onDelete,
}: {
  tournament: Tournament;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const winner = tournament.finalRanking?.find((r) => r.rank === 1);
  const nameOf = (playerId: string) =>
    tournament.players.find((p) => p.id === playerId)?.name ?? '–';
  const date = new Date(tournament.finishedAt ?? tournament.createdAt);

  return (
    <>
      <tr>
        <td className="mono">{date.toLocaleDateString('de-DE')}</td>
        <td>
          <strong>{tournament.config.name || 'Ohne Namen'}</strong>
          <span className="standings__club">{SPORT_LABEL[tournament.config.sport]}</span>
        </td>
        <td className="faint">{FORMAT_LABEL[tournament.config.format]}</td>
        <td className="num">{tournament.players.length}</td>
        <td>{winner ? nameOf(winner.playerId) : '–'}</td>
        <td>
          <span className="row" style={{ flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--sm" onClick={onToggle}>
              {expanded ? 'Zuklappen' : 'Endstand'}
            </button>
            <button type="button" className="btn btn--sm" onClick={onDelete}>
              Löschen
            </button>
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--c-surface-alt)' }}>
            <div className="stack--sm" style={{ display: 'grid', padding: 'var(--space-2) 0' }}>
              {(tournament.finalRanking ?? []).slice(0, 8).map((entry) => (
                <div className="row" key={entry.playerId}>
                  <span
                    className={`rank-medal${entry.rank <= 3 ? ` rank-medal--${entry.rank}` : ''}`}
                  >
                    {entry.rank}
                  </span>
                  <span>{nameOf(entry.playerId)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
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
