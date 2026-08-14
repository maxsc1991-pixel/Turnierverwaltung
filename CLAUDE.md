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

### Terminplanung

`engine/schedule.ts` verteilt greedy über Zeitslots: pro Slot wird jedes Feld mit der spielbereiten
Partie belegt, deren Spieler am längsten pausiert haben. Ist einer Gruppe ein festes Feld zugewiesen
(`Group.field`), laufen ihre Spiele nur dort und damit zwangsläufig nacheinander; andere Partien
meiden dieses Feld.

Die Feldschleife darf beim ersten leeren Feld **nicht abbrechen** (`continue`, nicht `break`) – mit
festen Gruppenfeldern kann auf einem späteren Feld sehr wohl noch eine Partie anstehen.

Von Hand geänderte Felder oder Zeiten können Doppelbelegungen erzeugen; `findScheduleConflicts()`
findet sie und die Planseite weist darauf hin.

### Zustand und Persistenz

Ein zustand-Store (`src/store/useTournamentStore.ts`) mit `persist` unter dem versionierten Schlüssel
`tv.state.v1`. Alle Mutationen laufen über Store-Aktionen; Komponenten rechnen nicht selbst.

Persistiert werden `config`, `players`, `active`, `archive` und `displayRefreshSeconds`. **Wird das
Datenmodell inkompatibel geändert, den Schlüssel hochzählen oder eine Migration ergänzen** – sonst
laufen gespeicherte Turniere der Anwender in undefiniertes Verhalten.

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
#/historie  HistoryPage   ewige Tabelle, Archiv, JSON-Export/-Import
```

`Tournament.stage` steuert den Fortschritt: `plan → group → ko → finished`. Ohne Gruppenphase geht es
direkt nach `ko`.

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

Unit-Tests decken die Engine ab (`engine.test.ts`, `playthrough.test.ts` – letzterer spielt Turniere
mit 2 bis 24 Teilnehmern vollständig durch). Sie sind der erste Anlaufpunkt für jede Regeländerung.

**Vorsicht bei Tests gegen leere Tabellen:** stehen alle Werte auf null, entscheidet der Losentscheid
nach Setzliste und liefert zufällig oft genau die erwartete Reihenfolge – ein solcher Test besteht
auch dann, wenn gar keine Spiele erzeugt wurden. Immer zusätzlich Spielanzahl und `played` prüfen.

Oberflächenänderungen mit Playwright gegen den Entwicklungsserver fahren; Chromium liegt unter
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (mit `--no-sandbox`). Zwei wiederkehrende
Stolpersteine dabei:

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
