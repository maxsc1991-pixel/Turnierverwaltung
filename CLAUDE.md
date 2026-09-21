# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was das ist

Lokale Webapp zur Durchführung von Dart- und Cornhole-Turnieren des DC Lok Pfalzel. Kein Server,
kein Backend, keine Netzverbindung – alles läuft im Browser, Daten liegen im `localStorage`.

**Die Oberfläche ist durchgehend deutsch** (Beschriftungen, Meldungen, Routen wie `#/anzeige`).
Code-Bezeichner sind englisch, Kommentare deutsch. Neue Texte in dieser Sprache halten.

## Befehle

```bash
npm run dev                                  # Entwicklungsserver
npm run build                                # tsc -b + Vite-Build nach dist/
npm run paket                                # nur Vite-Build, ohne Typprüfung
npm run preview                              # gebautes dist/ über http:// ansehen
npm run test                                 # alle Tests
npm run lint                                 # oxlint
npx tsc -b                                   # nur Typprüfung

npx vitest run src/engine/engine.test.ts     # eine Datei
npx vitest run -t "Punktdifferenz"           # einzelner Test über den Namen
npm run test:watch                           # Watch-Modus
```

## Architektur

### Engine und Oberfläche sind strikt getrennt

`src/engine/` enthält die gesamte Turnierlogik als **reine Funktionen ohne React-Bezug** und ist
vollständig unit-getestet. `src/pages/` und `src/components/` enthalten ausschließlich Darstellung.

**Regeländerungen gehören in die Engine, nicht in eine Seite.** Alles, was eine Regel ist –
Wertung, Setzung, Terminierung, Gültigkeit einer Konfiguration – lässt sich dort ohne Browser testen.

### Slots und der Resolver – das zentrale Modell

Ein `Match` hat keine festen Spieler, sondern zwei `Slot`s. Ein Slot ist entweder ein Spieler oder
ein Platzhalter: `winnerOf`/`loserOf` (ein anderes Spiel), `groupRank`, `bye`.

Der `Resolver` (`engine/resolve.ts`) löst diese Kette rekursiv auf und beantwortet „wer spielt hier",
„wer hat gewonnen", „ist das Spiel spielbereit". Dadurch ist der Turnierfortschritt reiner Datenfluss:
**Ein Ergebnis eintragen genügt – alle abhängigen Spiele lösen sich von selbst auf.** Es gibt keinen
Schritt, der Sieger irgendwohin „weiterschiebt".

Zwei Konsequenzen, die man leicht übersieht:

- Ein Freilos (`bye`) macht ein Spiel automatisch `done`, ohne Ergebnis. `resolver.isWalkover()`
  filtert solche Spiele überall aus Listen und aus dem Spielplan.
- Der Resolver cacht. **Nach jeder Zustandsänderung einen neuen anlegen** – in Komponenten über
  `useMemo` auf `tournament.matches`.

### Doppel-KO: das Final-Rückspiel

Im Doppel-KO liegt neben dem Grand Final immer ein zweites Spiel im Datenbestand (`phase: 'gf_reset'`).
Gebraucht wird es nur, wenn der Sieger der Siegerrunde das Grand Final verliert – dann haben beide
genau eine Niederlage. `isBracketResetNeeded()` beantwortet das, `relevantMatches()` blendet das
Spiel aus, solange die Antwort „nein" lautet.

**Jede Liste von Spielen muss durch `relevantMatches(matches, resolver)` laufen**, sonst taucht ein
Spiel auf, das nie stattfindet. Die Kombination in `LivePage` und `DisplayPage` ist die vollständige
Form:

```ts
relevantMatches(matches, resolver).filter((m) => !resolver.isWalkover(m))
```

Der Haken dabei: das Rückspiel ist nicht etwa „noch nicht spielbereit". Seine Slots lösen sich auf,
sobald das Grand Final ein Ergebnis hat – der Resolver meldet also `ready`, auch wenn es gar nicht
mehr gebraucht wird. Wer es über `status(match)` herausfiltern will, filtert es nicht heraus.

### Phasenabhängige Konfiguration

Die KO-Phase kann eigene Werte haben (Spieldauer, Legs, Felder, Startzeit) – gespeichert als
`Tournament.ko`. Statt jede Auswertung mit einem Phasenparameter zu belasten, legt
`applyKoSettings(config, ko)` diese Werte über die Turnierkonfiguration und liefert eine normale
`TournamentConfig` zurück.

**Für Spiele der KO-Phase immer die abgeleitete Konfiguration verwenden** (`configFor(match)` in der
`LivePage`), sonst gilt versehentlich die Leg-Anzahl der Gruppenphase bei Ergebniseingabe,
Validierung und Schnellauswahl.

### Die eine Regel für Gruppenphasen

`engine/validation.ts` erzeugt gültige Gruppeneinteilungen aus einer einzigen Formel:

```
Qualifikanten = 2 × Gruppen + beste Dritte     (muss eine Zweierpotenz sein)
```

Die „besten Dritten" füllen die Lücke zur nächsten Zweierpotenz und dürfen die Gruppenanzahl nicht
übersteigen. Diese Formel erzeugt 8/2, 12/3, 16/4, 24/6, 32/8, 48/12 und 64/16 von selbst –
**keine Sonderfälle je Teilnehmerzahl einbauen.** Sonderfälle gibt es nur zwei: 128 im Gruppenmodus
ist ausgeschlossen, und eine Einzelgruppe (3–10 Spieler) liefert fest 2 Qualifikanten.

Bei genau einer Gruppe entscheidet `config.groupFinal`, ob überhaupt eine KO-Runde folgt –
abgefragt über `hasKoPhase(config)`, nicht über `format === 'groups'`.

Die Rangliste der Gruppendritten auf der KO-Seite kommt als `thirdsRanking` aus
`qualifyFromGroups()` – also aus **derselben** Sortierung, die auch die Setzung erzeugt. Wer sie
anderswo nachbaut, riskiert eine Anzeige, die der tatsächlichen Qualifikation widerspricht.

### Hin- und Rückrunde

`config.returnLeg` (abgefragt über `hasReturnLeg`) hängt in `buildGroupMatches` dieselben
Kreisverfahren-Runden ein zweites Mal an, mit getauschten Seiten und `Match.leg = 2`. Runde *r* der
Rückrunde hat damit dieselben Paarungen wie Runde *r* der Hinrunde.

Der Abstand zwischen beiden Spielen einer Paarung entsteht deshalb **erst in der Terminplanung**:
`scheduleMatches` gibt die Runden einer Gruppe nur der Reihe nach frei – eine Runde beginnt erst,
wenn jedes Spiel der Runde davor einen früheren Termin hat. Daraus folgt beides: die Rückrunde
beginnt erst nach der kompletten Hinrunde, und zwischen Hin- und Rückspiel liegt jede andere Runde
der Gruppe.

**Ohne diese Regel bevorzugt der Planer sogar die sofortige Wiederholung.** Er wählt die Partie,
deren Spieler am längsten pausiert haben – und direkt nach der Hinrunde ist das ausgerechnet das
Paar, das die letzte Runde zuerst gespielt hat; die eine Partie, die die Pause *beider* maximiert,
ist ihr eigenes Rückspiel. Gemessen traf das jede Aufstellung, in der Gruppengröße und Feldzahl
nicht glatt aufgehen (12 Teilnehmer, 3 Gruppen, 3 Felder: Wiedersehen nach 2 Slots). Die Regel ist
also kein Feinschliff, sondern trägt die Eigenschaft allein.

Sie gilt **nur bei Rückrunde** (`hasReturnLeg` im Planer über `leg === 2` erkannt). Ohne
Wiederholung gibt es nichts vorzuziehen, und die Rundenreihenfolge zu erzwingen würde nur Felder
leer lassen: 6 Spieler auf 2 Feldern brauchen je Runde zwei Slots, von denen der zweite halb frei
bliebe – der Einfachplan würde von 8 auf 10 Slots wachsen.

Unvermeidbar ist das schnelle Wiedersehen nur in einer Zweiergruppe, weil es dort nur eine Paarung
gibt.

Tabelle, direkter Vergleich, Feldplan, Teamplan und ewige Tabelle brauchen dafür nichts: sie zählen
Spiele, nicht Paarungen.

### Nicht angetretene Teams

`Tournament.withdrawn` ist die **einzige Quelle der Wahrheit** – eine Liste von Spieler-IDs, sonst
nichts. `engine/withdraw.ts` leitet daraus alles ab; die Funktion heißt `settleNoShows()` und trägt
für jedes spielbereite offene Spiel eines solchen Teams ein kampfloses Ergebnis über die volle
Leg-Zahl ein.

Der entscheidende Entwurfsschritt: **das Ergebnis wird eingetragen, nicht errechnet.** Dadurch
bleibt die übrige Engine unberührt – Tabelle, direkter Vergleich, Qualifikation, Endplatzierung und
ewige Tabelle rechnen mit einem ganz normalen Ergebnis weiter. `Match.noShow` ist reine
Kennzeichnung für die Anzeige. Wer das auf „bei der Auswertung so tun als ob" umbaut, muss jede
dieser Stellen anfassen und die Leg-Zahl der jeweiligen Phase mitschleppen.

Drei Regeln, die man beim Ändern leicht zerstört:

- **Gespieltes bleibt gespielt.** `settleNoShows` fasst nur Spiele ohne Ergebnis an – und solche,
  die es selbst kampflos gewertet hat (`match.noShow` gesetzt). Letztere werden neu bestimmt, damit
  es egal ist, in welcher Reihenfolge zwei Teams gemeldet werden: fehlen am Ende beide, steht dort
  0:0 statt eines geschenkten Siegs.
- **Nachziehen, wo Spiele entstehen oder spielbereit werden.** Der Store ruft `settleNoShows` in
  `setResult` und `startKo` auf. Eine KO-Paarung kennt ihre Spieler erst, wenn die Vorspiele
  entschieden sind – ohne diesen Aufruf stünde ein abgereistes Team plötzlich wieder im Bracket.
- **Der Verzerrung nicht heimlich gegensteuern.** Alle verbliebenen Teams der Gruppe bekommen
  denselben kampflosen Sieg, die Reihenfolge *innerhalb* der Gruppe bleibt also korrekt. Nicht mehr
  vergleichbar sind die Punkte **zwischen** den Gruppen – und das betrifft genau einen Fall: die
  Rangliste der Gruppendritten (12/3, 24/6, 48/12). `groupsWithWithdrawal()` liefert die betroffenen
  Gruppen, die KO-Seite weist darauf hin. Eine Rechenkorrektur (etwa Ergebnisse gegen den
  Gruppenletzten streichen) wurde bewusst verworfen: sie würde die Rangliste auch in Turnieren ohne
  Ausfall verändern.

Abschaltbar über `config.noShowWalkover`, gelesen mit `allowsNoShow()`. Vor dem Turnierstart ist das
Entfernen aus der Spielerliste der saubere Weg – dann wird mit der tatsächlichen Teilnehmerzahl neu
ausgelost, ganz ohne Wertungsfragen.

### Wertung der Gruppentabelle

`engine/standings.ts` sortiert nach **Punkte → Leg-Differenz → direkter Vergleich → gewonnene Legs →
Setzlistenposition**. Beim Cornhole schiebt sich die **Punktdifferenz vor den direkten Vergleich**,
weil die Leg-Differenz dort bei Best of 1 nur ±1 beträgt und zu viele Gleichstände erzeugt.

Daneben gibt es die wählbare **Leg-Bonus-Wertung** (`Scoring = 'legBonus'`): 3 Punkte für einen Sieg
ohne verlorenes Leg, 2 für jeden anderen Sieg, 1 für eine Niederlage mit mindestens einem gewonnenen
Leg. `matchPoints()` hängt dabei nur davon ab, **ob** der Verlierer ein Leg geholt hat – dadurch gilt
dieselbe Funktion für jedes Best of, ohne Sonderfälle je Leg-Anzahl.

In dieser Wertung steckt die Leg-Ausbeute schon in den Punkten. Leg- und Punktdifferenz **entfallen
deshalb als Kriterium** (`primaryKeys` liefert nur `[points]`), danach entscheidet der direkte
Vergleich. Wer sie dort wieder einbaut, wertet dasselbe zweimal.

**Über ein einzelnes Leg gilt immer die Standardwertung** – abgefragt über `scoringOf(config)`, nie
über `config.scoring` direkt. Dieselbe Funktion fängt gespeicherte Turniere ab, die das Feld noch
nicht kennen.

Umgeschaltet wird das nicht über die Sportart im Sortierer, sondern über
`standingsOptions(config)` → `{ usePoints, scoring }`. Wer eine neue Auswertung baut, muss diese
Optionen mitgeben, sonst wertet sie stillschweigend nach der Standardwertung ohne Punkte. Das gilt
auch für die ewige Tabelle: `stats.ts` wertet jedes Turnier mit **seiner** Wertung, und die KO-Phase
kann dabei eine andere Leg-Anzahl und damit eine andere geltende Wertung haben als die Gruppenphase.

Punkte sind nur bei einem einzelnen Leg Pflicht (`requiresPoints`); ob Felder überhaupt angeboten
werden, sagt `showsPoints`. Über mehrere Legs dürfen sie fehlen – Auswertungen müssen also mit
`pointsA === undefined` umgehen, und die Tabellen blenden die Punktespalten aus, solange nichts
erfasst ist.

Der direkte Vergleich ist eine Mini-Tabelle nur aus den Spielen der Gleichstehenden untereinander –
er entscheidet also erst, wenn die Kriterien davor gleich sind.

### Terminplanung

`engine/schedule.ts` verteilt greedy über Zeitslots: pro Slot wird jedes Feld mit der spielbereiten
Partie belegt, deren Spieler am längsten pausiert haben. Ist einer Gruppe ein festes Feld zugewiesen
(`Group.field`), laufen ihre Spiele nur dort und damit zwangsläufig nacheinander; andere Partien
meiden dieses Feld.

Die Feldschleife darf beim ersten leeren Feld **nicht abbrechen** (`continue`, nicht `break`) – mit
festen Gruppenfeldern kann auf einem späteren Feld sehr wohl noch eine Partie anstehen.

Von Hand geänderte Felder oder Zeiten können Doppelbelegungen erzeugen; `findScheduleConflicts()`
findet sie und die Planseite weist darauf hin.

### Endplatzierung

`computeFinalRanking()` vergibt Ränge an **alle** Teilnehmer; `koPlacements()` filtert daraus die
Spieler, die die KO-Phase erreicht haben, und fasst Ranggleiche zu einer Zeile zusammen
(`5.–8.`). Bei 16 Qualifizierten ergibt das `1.`, `2.`, `3.`, `4.`, `5.–8.`, `9.–16.`.

Die Runde, in der ein Spieler ausgeschieden ist, wird aus **seinem letzten KO-Spiel** abgeleitet, nicht
aus dem Rang – im Doppel-KO laufen Sieger- und Verliererrunde parallel, ein Rang allein sagt dort
nichts über die Runde. Freilos-Spiele zählen mit: wer ein Freilos hatte, hat die Runde erreicht.

Ohne KO-Phase liefert `koPlacements()` alle Teilnehmer nach der Gruppentabelle. Die Darstellung
teilen sich Turnieransicht, Anzeigeseite und Archiv über `components/PlacementTable.tsx`.

### Spielplan je Team und je Spielfeld

`engine/teamPlan.ts` dreht den Spielplan von der Feld- auf die Teamsicht: `teamPlan()` liefert alle
Spiele eines Teams samt Gegner, Zeit, Feld und **gespiegeltem Ergebnis** – wer auf Seite B stand,
sieht `2:1` statt `1:2`.

Aufgeführt wird nur, was schon feststeht. Ein KO-Spiel der nächsten Runde hat noch keinen Spieler in
seinen Slots und gehört damit keinem Team; erst mit dem Ergebnis des Vorspiels taucht es im Plan auf.
Freilose bleiben mit dem Vermerk „Freilos" stehen, aber ohne Zeit und Feld – sonst sucht jemand ein
Spiel, das nie stattfindet.

`allFieldPlans()` dreht denselben Plan auf die Feldsicht. Dort bleiben offene KO-Paarungen mit ihrem
Platzhalter stehen – am Feld zählt die Belegung, nicht der Name – während Freilose entfallen, weil
sie nie gespielt werden.

Beide Ansichten teilen sich Blattaufbau und Druckweg; welche gedruckt wird, entscheidet der
Umschalter der Seite. Gedruckt wird über `@media print` in `styles/components.css`: `.no-print`
blendet die Bedienung aus, `.teamplan--all` schaltet vom einzelnen Blatt auf alle Blätter um,
`break-after: page` je `.team-sheet` ergibt genau ein Blatt pro Team bzw. pro Spielfeld. Das
Umschalten ist Zustand der Seite und wird nach `window.print()` wieder zurückgenommen – die Blätter
dürfen auf dem Bildschirm nie erscheinen.

### Zustand und Persistenz

Ein zustand-Store (`src/store/useTournamentStore.ts`) mit `persist` unter dem versionierten Schlüssel
`tv.state.v1`. Alle Mutationen laufen über Store-Aktionen; Komponenten rechnen nicht selbst.

Persistiert werden `config`, `players`, `active`, `archive` und `displayRefreshSeconds`. **Wird das
Datenmodell inkompatibel geändert, den Schlüssel hochzählen oder eine Migration ergänzen** – sonst
laufen gespeicherte Turniere der Anwender in undefiniertes Verhalten.

Ein *zusätzliches* Konfigurationsfeld braucht dagegen keine Migration, wenn es seinen Vorgabewert
selbst mitbringt: gespeicherte Turniere kennen das Feld nicht, es kommt als `undefined` zurück. Die
Lesefunktion fängt das ab (`config.scoring ?? 'standard'` in `scoringOf`), nicht jede Auswertung
einzeln. Ebenso `Player.present` über `isPresent()`.

`Player.present` ist der Anwesenheitshaken der Anmeldung und **absichtlich folgenlos**: einziger
Leser ist `PlayerManager`, die Engine kennt ihn nicht. Wer nicht erscheint, wird von Hand aus der
Liste entfernt – das ist die Entscheidung des Turnierleiters, nicht die des Programms. Ihn an
Auslosung, Spielplan oder Wertung anzuschließen wäre also keine Verbesserung, sondern eine
Verhaltensänderung; ein Test in `engine.test.ts` hält fest, dass dieselbe Auslosung mit und ohne
Haken Spiel für Spiel identisch bleibt.

Die Anzeigeseite (`#/anzeige`) läuft typischerweise in einem zweiten Fenster mit eigenem
Speicherzustand. Sie holt sich Änderungen über `persist.rehydrate()` – zyklisch im eingestellten
Takt und zusätzlich sofort über das `storage`-Ereignis.

### Ablauf der Seiten

```
#/          ConfigPage    Sportart, Modus, Spieler → Spielplan generieren
#/plan      PlanPage      Auslosung prüfen, Spieler tauschen, Felder/Zeiten → Turnier starten
#/ko-start  KoSetupPage   nur Gruppenmodus: Einstellungen der KO-Phase + Setzung
#/live      LivePage      Gruppen/Bracket links, laufende Spiele rechts, Ergebniseingabe
#/anzeige   DisplayPage   Zuschaueransicht, ohne Bedienelemente, selbstaktualisierend
#/teamplan  TeamPlanPage  Spielplan je Team oder je Spielfeld, druckbar – ein Blatt je Auswahl
#/historie  HistoryPage   ewige Tabelle, Archiv, JSON-Export/-Import
```

`Tournament.stage` steuert den Fortschritt: `plan → group → ko → finished`. Ohne Gruppenphase geht es
direkt nach `ko`.

Auf der Anzeigeseite tauschen Turnierbaum und Gruppentabellen mit der Phase den Platz: die Abschnitte
liegen als Konstanten (`groupsSection`, `koSection`, `upcomingSection`) vor dem `return`, das sie nur
noch anordnet. Der Baum steht dabei immer in voller Breite – in einer Spalte des Zweispalters müsste
man auf dem Beamer scrollen, um das Finale zu sehen.

## Build: eine einzige HTML-Datei

Der Build erzeugt **eine eigenständige `dist/index.html`**, die per Doppelklick über `file://` läuft.
Dafür sorgt das Plugin `inlineAssets` in `vite.config.ts`: es bettet JavaScript, CSS und das
Vereinslogo als Daten ein.

Der Grund ist keine Bequemlichkeit: über `file://` blockiert der Browser das Nachladen von
Modul-Skripten und Stylesheets per CORS. **`base: './'` allein reicht nicht** – ohne Inlining bleibt
die Seite weiß.

Zwei Fallen in diesem Plugin:

- `String.replace` mit einer **Zeichenkette** als Ersetzung deutet `$&`, `` $` `` und `$'` im
  minifizierten Code als Sonderzeichen und vervielfacht Teile des Dokuments. Immer eine
  **Ersetzungsfunktion** übergeben.
- Jeder Pfad zu `logo.png`/`logo.svg` wird durch die eingebetteten Bilddaten ersetzt. Steht ein Pfad
  mehrfach im Code, landet das Bild mehrfach in der Datei – deshalb führt `Logo.tsx` seine beiden
  Pfade in einer Liste, in der jeder genau einmal vorkommt.

Das Logo wird über `public/logo.png` (bevorzugt) bzw. `public/logo.svg` ausgetauscht, ohne Codeänderung.

## Prüfen von Änderungen

Unit-Tests decken die Engine ab: `engine.test.ts` (Wertung, Setzung, Spielpläne), `result.test.ts`
(Eingabe und Prüfung eines Ergebnisses), `tournament.test.ts` (Auslosung, Tabelle, Platzierung),
`withdraw.test.ts` (nicht angetretene Teams) und `playthrough.test.ts`, der Turniere mit 2 bis 48
Teilnehmern vollständig durchspielt. Sie sind der erste Anlaufpunkt für jede Regeländerung.

**Vorsicht bei Tests gegen leere Tabellen:** stehen alle Werte auf null, entscheidet der Losentscheid
nach Setzliste und liefert zufällig oft genau die erwartete Reihenfolge – ein solcher Test besteht
auch dann, wenn gar keine Spiele erzeugt wurden. Immer zusätzlich Spielanzahl und `played` prüfen.

Oberflächenänderungen mit Playwright gegen den Entwicklungsserver fahren. **Playwright ist bewusst
keine Abhängigkeit des Projekts** – die Skripte laufen außerhalb des Repos (`npm install playwright`
im Arbeitsverzeichnis genügt). Chromium ist vorinstalliert unter
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` und braucht `--no-sandbox`; `playwright install`
ist nicht nötig. Zwei wiederkehrende Stolpersteine dabei:

- Nach `waitForURL` ist React noch nicht fertig. Vor dem Zählen von Elementen auf einen konkreten
  Selektor warten, sonst entstehen Phantomfehler.
- `innerText` liefert die **gerenderte** Schrift. Wo CSS `text-transform: uppercase` setzt, laufen
  Vergleiche auf Kleinschreibung ins Leere.

Vor dem Ausliefern die gebaute Einzeldatei in einem leeren Ordner über `file://` gegenprüfen –
Routing, `localStorage` und Logo verhalten sich dort anders als unter `http://`.

## Farben

Nur vier Farben, zentral in `src/styles/tokens.css`: `#E52928` (Aktion, laufend), `#378C45`
(Bestätigung, Qualifikation, Sieg), `#000000` (Header, Flächen), `#FFFFFF` (Inhalte). Alle Grautöne
sind daraus abgeleitet – keine weiteren Farben einführen.
