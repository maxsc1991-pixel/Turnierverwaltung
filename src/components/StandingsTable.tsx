import type { Player, Standing } from '../engine/types';

interface Props {
  standings: readonly Standing[];
  players: readonly Player[];
  /** Wie viele Plätze direkt weiterkommen (grün markiert). */
  qualifyingPlaces?: number;
  /** Platz, der als möglicher "bester Dritter" markiert wird. */
  thirdPlaceCandidate?: boolean;
  /** Beim Cornhole zählen die erzielten Punkte mit und werden mit angezeigt. */
  showPoints?: boolean;
  /** Kompakte Darstellung für die Anzeigetafel. */
  compact?: boolean;
}

export function StandingsTable({
  standings,
  players,
  qualifyingPlaces = 0,
  thirdPlaceCandidate = false,
  showPoints = false,
  compact = false,
}: Props) {
  const nameOf = (id: string) => players.find((p) => p.id === id);

  return (
    <div className="table-scroll">
      <table className={compact ? 'standings standings--compact' : 'standings'}>
        <thead>
          <tr>
            <th aria-label="Platz" />
            <th>Spieler</th>
            <th className="num" title="Spiele">
              Sp
            </th>
            <th className="num" title="Punkte">
              Pkt
            </th>
            <th className="num" title="Legs">
              Legs
            </th>
            <th className="num" title="Leg-Differenz">
              Diff
            </th>
            {showPoints && (
              <>
                <th className="num" title="Erzielte und kassierte Punkte">
                  Punkte
                </th>
                <th className="num" title="Punktdifferenz – entscheidet vor dem direkten Vergleich">
                  PD
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {standings.map((row) => {
            const player = nameOf(row.playerId);
            const qualified = row.rank <= qualifyingPlaces;
            const candidate = thirdPlaceCandidate && row.rank === qualifyingPlaces + 1;
            return (
              <tr
                key={row.playerId}
                className={qualified ? 'is-qualified' : candidate ? 'is-third-candidate' : undefined}
              >
                <td>{row.rank}</td>
                <td>
                  <span className="standings__name">{player?.name ?? '–'}</span>
                  {player?.club && !compact && (
                    <span className="standings__club">{player.club}</span>
                  )}
                  {row.tiebreak && <span className="standings__tiebreak"> · {row.tiebreak}</span>}
                </td>
                <td className="num">{row.played}</td>
                <td className="num">
                  <strong>{row.points}</strong>
                </td>
                <td className="num mono">
                  {row.legsFor}:{row.legsAgainst}
                </td>
                <td className="num mono">
                  {row.legDiff > 0 ? '+' : ''}
                  {row.legDiff}
                </td>
                {showPoints && (
                  <>
                    <td className="num mono">
                      {row.pointsFor}:{row.pointsAgainst}
                    </td>
                    <td className="num mono">
                      {row.pointsDiff > 0 ? '+' : ''}
                      {row.pointsDiff}
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
