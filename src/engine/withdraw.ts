import { Resolver } from './resolve';
import {
  applyKoSettings,
  isWithdrawn,
  legsToWin,
  type Match,
  type Tournament,
  type TournamentConfig,
} from './types';

/**
 * Nicht angetretene Teams.
 *
 * Ein zurückgezogenes Team bleibt im Turnier stehen – Gruppe, Setzliste und
 * bereits gespielte Ergebnisse ändern sich nicht. Seine **offenen** Spiele
 * werden kampflos gewertet: der Gegner gewinnt über die volle Leg-Zahl.
 *
 * Bewusst so und nicht anders:
 *
 * - **Gespieltes bleibt gespielt.** Wer schon gegen das Team angetreten ist,
 *   behält sein Ergebnis. Ein erkämpftes 2:1 nachträglich in einen geschenkten
 *   Sieg zu verwandeln, wäre den übrigen Gegnern gegenüber unfair.
 * - **Das Ergebnis wird eingetragen, nicht errechnet.** Dadurch rechnen
 *   Tabelle, Qualifikation, ewige Tabelle und Endplatzierung unverändert
 *   weiter; `Match.noShow` ist reine Kennzeichnung für die Anzeige.
 * - **Die Liste der Zurückgezogenen ist die Quelle der Wahrheit.** Spiele, die
 *   erst später entstehen – die KO-Runde –, werden von `settleNoShows()`
 *   nachgezogen, sobald sie spielbereit sind.
 *
 * Nicht gelöst und bewusst offen: rücken beste Dritte nach, sind die Gruppen
 * nicht mehr vergleichbar, weil eine Gruppe drei Punkte zu verschenken hatte.
 * `groupsWithWithdrawal()` liefert die betroffenen Gruppen, damit die KO-Seite
 * darauf hinweisen kann, statt still zu korrigieren.
 */

/** Konfiguration der Phase, in der ein Spiel stattfindet. */
function configFor(tournament: Tournament, match: Match): TournamentConfig {
  return match.phase === 'group'
    ? tournament.config
    : applyKoSettings(tournament.config, tournament.ko);
}

/**
 * Trägt für jedes spielbereite, noch offene Spiel eines zurückgezogenen Teams
 * das kampflose Ergebnis ein. Spiele, deren Gegner noch nicht feststeht,
 * bleiben unberührt – sie werden beim nächsten Aufruf nachgezogen.
 */
export function settleNoShows(tournament: Tournament): Tournament {
  const withdrawn = tournament.withdrawn ?? [];
  if (!withdrawn.length) return tournament;

  const resolver = new Resolver(tournament.matches);
  let changed = false;

  const matches = tournament.matches.map((match) => {
    // Ein regulär gespieltes Ergebnis ist unantastbar. Ein kampflos vergebenes
    // wird dagegen neu bestimmt: zieht sich später auch der Sieger zurück, darf
    // ihm der Sieg gegen ein ebenfalls fehlendes Team nicht bleiben. Dadurch
    // ist das Ergebnis unabhängig davon, in welcher Reihenfolge markiert wurde.
    if (match.result && !match.noShow) return match;
    if (resolver.isWalkover(match)) return match;

    const [a, b] = [resolver.slot(match.a), resolver.slot(match.b)];
    if (a.kind !== 'player' || b.kind !== 'player') return match;

    const outA = withdrawn.includes(a.playerId);
    const outB = withdrawn.includes(b.playerId);
    if (!outA && !outB) return match;

    const target = legsToWin(configFor(tournament, match));
    // Treten beide nicht an, gibt es nichts zu gewinnen – 0:0, kein Sieger.
    const result = outA && outB
      ? { legsA: 0, legsB: 0 }
      : outA
        ? { legsA: 0, legsB: target }
        : { legsA: target, legsB: 0 };
    const noShow = outA ? ('a' as const) : ('b' as const);

    if (match.noShow === noShow && match.result?.legsA === result.legsA && match.result.legsB === result.legsB) {
      return match;
    }
    changed = true;
    return { ...match, noShow, result };
  });

  return changed ? { ...tournament, matches } : tournament;
}

/** Markiert ein Team als nicht angetreten und wertet seine offenen Spiele. */
export function withdrawPlayer(tournament: Tournament, playerId: string): Tournament {
  if (isWithdrawn(tournament, playerId)) return tournament;
  return settleNoShows({
    ...tournament,
    withdrawn: [...(tournament.withdrawn ?? []), playerId],
  });
}

/**
 * Nimmt die Markierung zurück – für den Fall, dass das Team doch noch kommt
 * oder versehentlich der Falsche angeklickt wurde. Die kampflos vergebenen
 * Ergebnisse verschwinden wieder, regulär gespielte bleiben stehen.
 */
export function reinstatePlayer(tournament: Tournament, playerId: string): Tournament {
  if (!isWithdrawn(tournament, playerId)) return tournament;
  const withdrawn = (tournament.withdrawn ?? []).filter((id) => id !== playerId);
  const resolver = new Resolver(tournament.matches);

  const matches = tournament.matches.map((match) => {
    if (!match.noShow || !resolver.playerIds(match).includes(playerId)) return match;
    const { noShow: _noShow, result: _result, ...rest } = match;
    return rest;
  });

  // Der Gegner kann weiterhin zurückgezogen sein – dann wird das Spiel sofort
  // wieder kampflos gewertet, nur diesmal zugunsten des Zurückgekehrten.
  return settleNoShows({ ...tournament, withdrawn, matches });
}

/**
 * Gruppen, in denen ein Team nicht angetreten ist. Nur dort sind die Punkte
 * nicht mit denen der übrigen Gruppen vergleichbar.
 */
export function groupsWithWithdrawal(tournament: Tournament): string[] {
  const withdrawn = tournament.withdrawn ?? [];
  if (!withdrawn.length) return [];
  return tournament.groups
    .filter((group) => group.playerIds.some((id) => withdrawn.includes(id)))
    .map((group) => group.name);
}
