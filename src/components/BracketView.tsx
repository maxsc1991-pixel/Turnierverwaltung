import type { Match, Phase, Player, Tournament } from '../engine/types';
import { Resolver, indexMatches } from '../engine/resolve';
import { describeSlot } from '../engine/labels';
import { isBracketResetNeeded } from '../engine/doubleKo';
import { groupOrigins, type GroupOrigin } from '../engine/tournament';

interface Props {
  tournament: Tournament;
  /** Beschränkt die Anzeige auf bestimmte Phasen (z.B. nur die Siegerrunde). */
  phases?: Phase[];
}

export function BracketView({ tournament, phases }: Props) {
  const resolver = new Resolver(tournament.matches);
  const byId = indexMatches(tournament.matches);
  const needsReset = isBracketResetNeeded(tournament.matches, resolver);

  // Herkunft aus der Gruppenphase, damit hinter jedem Namen "A2" o.ä. steht.
  const origins = groupOrigins(tournament);

  const visible = tournament.matches.filter((m) => {
    if (phases && !phases.includes(m.phase)) return false;
    if (m.phase === 'gf_reset' && !needsReset) return false;
    return true;
  });

  if (!visible.length) return <div className="empty">Noch kein Bracket vorhanden.</div>;

  const sections = groupIntoSections(visible);

  return (
    <div>
      {sections.map((section) => (
        <div key={section.title}>
          {sections.length > 1 && <div className="bracket-section-title">{section.title}</div>}
          <div className="bracket">
            {section.rounds.map((round) => (
              <div className="bracket__round" key={`${section.title}-${round.round}`}>
                <div className="bracket__round-title">{round.title}</div>
                {round.matches.map((match) => (
                  <BracketMatch
                    key={match.id}
                    match={match}
                    resolver={resolver}
                    players={tournament.players}
                    byId={byId}
                    origins={origins}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BracketMatch({
  match,
  resolver,
  players,
  byId,
  origins,
}: {
  match: Match;
  resolver: Resolver;
  players: readonly Player[];
  byId: Map<string, Match>;
  origins: Map<string, GroupOrigin>;
}) {
  const a = describeSlot(match.a, resolver, players, byId);
  const b = describeSlot(match.b, resolver, players, byId);
  const winner = resolver.winner(match.id);
  const winnerId = winner.kind === 'player' ? winner.playerId : undefined;

  const sideClass = (side: typeof a) => {
    if (side.kind === 'bye') return 'bracket-match__side bracket-match__side--bye';
    if (side.kind === 'open') return 'bracket-match__side bracket-match__side--open';
    if (winnerId && side.playerId === winnerId) return 'bracket-match__side bracket-match__side--winner';
    return 'bracket-match__side';
  };

  return (
    <div className="bracket-match" title={match.label}>
      <div className={sideClass(a)}>
        <span>
          {a.name}
          <Origin origins={origins} playerId={a.playerId} />
        </span>
        <span className="bracket-match__legs">{match.result ? match.result.legsA : ''}</span>
      </div>
      <div className={sideClass(b)}>
        <span>
          {b.name}
          <Origin origins={origins} playerId={b.playerId} />
        </span>
        <span className="bracket-match__legs">{match.result ? match.result.legsB : ''}</span>
      </div>
    </div>
  );
}

/** Kurzhinweis auf Gruppe und Platzierung, z.B. "A2". */
function Origin({
  origins,
  playerId,
}: {
  origins: Map<string, GroupOrigin>;
  playerId?: string;
}) {
  const origin = playerId ? origins.get(playerId) : undefined;
  if (!origin) return null;
  return (
    <span className="origin-tag" title={`${origin.groupName} · Platz ${origin.rank}`}>
      {origin.short}
    </span>
  );
}

interface Section {
  title: string;
  rounds: Array<{ round: number; title: string; matches: Match[] }>;
}

const SECTION_TITLES: Partial<Record<Phase, string>> = {
  wb: 'Siegerrunde',
  lb: 'Verliererrunde',
  gf: 'Entscheidung',
  gf_reset: 'Entscheidung',
  ko: 'KO-Phase',
  third: 'KO-Phase',
};

/** Gruppiert die Spiele nach Phase und Runde in Bracket-Spalten. */
function groupIntoSections(matches: readonly Match[]): Section[] {
  const order: Phase[] = ['ko', 'third', 'wb', 'lb', 'gf', 'gf_reset'];
  const sections = new Map<string, Section>();

  for (const phase of order) {
    const inPhase = matches.filter((m) => m.phase === phase);
    if (!inPhase.length) continue;

    const title = SECTION_TITLES[phase] ?? 'Spiele';
    let section = sections.get(title);
    if (!section) {
      section = { title, rounds: [] };
      sections.set(title, section);
    }

    // Das Spiel um Platz 3 bekommt eine eigene, klar benannte Spalte hinter dem
    // Finale – sonst stünde es unbeschriftet neben dem Endspiel.
    if (phase === 'third') {
      section.rounds.push({
        round: Number.MAX_SAFE_INTEGER,
        title: 'Spiel um Platz 3',
        matches: inPhase,
      });
      continue;
    }

    for (const round of [...new Set(inPhase.map((m) => m.round))].sort((a, b) => a - b)) {
      const roundMatches = inPhase.filter((m) => m.round === round);
      const existing = section.rounds.find((r) => r.round === round);
      if (existing) {
        existing.matches.push(...roundMatches);
      } else {
        section.rounds.push({
          round,
          title: roundMatches[0].roundLabel,
          matches: roundMatches,
        });
      }
    }
    section.rounds.sort((a, b) => a.round - b.round);
  }

  return [...sections.values()];
}
