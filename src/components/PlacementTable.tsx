import type { Player, Tournament } from '../engine/types';
import { groupOrigins, koPlacements } from '../engine/tournament';

interface Props {
  tournament: Tournament;
  /** Kompakte Darstellung für die Anzeigetafel. */
  compact?: boolean;
}

/**
 * Endplatzierung ab der KO-Runde. Spieler, die in derselben Runde ausgeschieden
 * sind, teilen sich einen Rang und stehen gemeinsam in einer Zeile.
 */
export function PlacementTable({ tournament, compact = false }: Props) {
  const rows = koPlacements(tournament);
  const origins = groupOrigins(tournament);
  const nameOf = (id: string): Player | undefined => tournament.players.find((p) => p.id === id);

  if (!rows.length) return <div className="empty">Noch keine Platzierungen ermittelt.</div>;

  return (
    <div className="table-scroll">
      <table className={compact ? 'placements placements--compact' : 'placements'}>
        <thead>
          <tr>
            <th>Platz</th>
            <th>Spieler</th>
            <th>Erreicht</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rank} className={row.rank <= 3 ? `is-podium is-podium--${row.rank}` : undefined}>
              <td className="placements__rank">
                {row.rank <= 3 ? (
                  <span className={`rank-medal rank-medal--${row.rank}`}>{row.rank}</span>
                ) : (
                  row.rankLabel
                )}
              </td>
              <td>
                <div className="placements__players">
                  {row.playerIds.map((playerId) => {
                    const player = nameOf(playerId);
                    const origin = origins.get(playerId);
                    return (
                      <span className="placements__player" key={playerId}>
                        <strong>{player?.name ?? '–'}</strong>
                        {origin && (
                          <span className="origin-tag" title={`${origin.groupName} · Platz ${origin.rank}`}>
                            {origin.short}
                          </span>
                        )}
                        {player?.club && !compact && (
                          <span className="placements__club">{player.club}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              </td>
              <td className="faint">{row.reached}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
