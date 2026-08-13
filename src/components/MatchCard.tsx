import type { Match, Player } from '../engine/types';
import type { Resolver } from '../engine/resolve';
import { describeSlot, formatResult } from '../engine/labels';
import { formatTime } from '../engine/schedule';
import type { GroupOrigin } from '../engine/tournament';

interface Props {
  match: Match;
  resolver: Resolver;
  players: readonly Player[];
  byId: Map<string, Match>;
  live?: boolean;
  onEnterResult?: () => void;
  /** Gruppe und Platzierung, aus der der Spieler kommt (KO-Phase). */
  origins?: Map<string, GroupOrigin>;
}

export function MatchCard({
  match,
  resolver,
  players,
  byId,
  live = false,
  onEnterResult,
  origins,
}: Props) {
  const a = describeSlot(match.a, resolver, players, byId);
  const b = describeSlot(match.b, resolver, players, byId);
  const winner = resolver.winner(match.id);
  const winnerId = winner.kind === 'player' ? winner.playerId : undefined;
  const done = Boolean(match.result);

  const sideClass = (side: typeof a) => {
    if (side.kind === 'open' || side.kind === 'bye') return 'match-side match-side--open';
    if (!done) return 'match-side';
    return side.playerId === winnerId ? 'match-side match-side--winner' : 'match-side match-side--loser';
  };

  return (
    <div className={`match-card${live ? ' match-card--live' : ''}${done ? ' match-card--done' : ''}`}>
      <div className="match-card__head">
        <span>{match.field ? `Feld ${match.field}` : match.label}</span>
        <span>{match.field ? formatTime(match.scheduledAt) : ''}</span>
      </div>

      <div className="match-card__body">
        {match.field && <span className="faint">{match.label}</span>}

        <div className={sideClass(a)}>
          <span className="match-side__name">
            <strong>
              {a.name}
              <OriginTag origins={origins} playerId={a.playerId} />
            </strong>
            {a.club && <span className="match-side__club">{a.club}</span>}
          </span>
          <span className="match-side__legs">{done ? match.result?.legsA : '–'}</span>
        </div>

        <div className="match-card__vs">gegen</div>

        <div className={sideClass(b)}>
          <span className="match-side__name">
            <strong>
              {b.name}
              <OriginTag origins={origins} playerId={b.playerId} />
            </strong>
            {b.club && <span className="match-side__club">{b.club}</span>}
          </span>
          <span className="match-side__legs">{done ? match.result?.legsB : '–'}</span>
        </div>
      </div>

      {(onEnterResult || done) && (
        <div className="match-card__foot">
          {done && match.result?.pointsA !== undefined && (
            <span className="match-card__points">{formatResult(match)}</span>
          )}
          {onEnterResult && (
            <button
              type="button"
              className={done ? 'btn btn--sm' : 'btn btn--success btn--sm'}
              onClick={onEnterResult}
              style={{ marginLeft: 'auto' }}
            >
              {done ? 'Ergebnis ändern' : 'Ergebnis eintragen'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function OriginTag({
  origins,
  playerId,
}: {
  origins?: Map<string, GroupOrigin>;
  playerId?: string;
}) {
  const origin = playerId ? origins?.get(playerId) : undefined;
  if (!origin) return null;
  return (
    <span className="origin-tag" title={`${origin.groupName} · Platz ${origin.rank}`}>
      {origin.short}
    </span>
  );
}
