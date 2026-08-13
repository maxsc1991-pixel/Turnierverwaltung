# Turnierverwaltung · DC Lok Pfalzel

Lokale Webapp zur Durchführung von **Dart-** und **Cornhole-Turnieren**. Sie deckt den kompletten
Turniertag ab: konfigurieren → auslosen → Spielplan prüfen → live Ergebnisse erfassen → KO-Phase →
Endstand ins Archiv.

Die App läuft vollständig im Browser, braucht keinen Server und keine Internetverbindung. Alle Daten
liegen im `localStorage` des Browsers und lassen sich als JSON exportieren und importieren.

## Schnellstart

```bash
npm install
npm run dev
```

Danach die angezeigte Adresse (standardmäßig <http://localhost:5173>) im Browser öffnen.

Weitere Befehle:

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver mit Hot Reload |
| `npm run build` | Produktions-Build nach `dist/` |
| `npm run preview` | Produktions-Build lokal testen |
| `npm run test` | Testsuite der Turnierlogik |

## Vereinslogo austauschen

Im Header und als Favicon wird `public/logo.svg` verwendet – eine Nachbildung des Vereinslogos in den
Vereinsfarben. Um das Originallogo zu verwenden, genügt **eine der beiden** Varianten:

- die eigene Datei als `public/logo.png` ablegen (wird bevorzugt geladen), **oder**
- `public/logo.svg` durch die eigene SVG-Datei ersetzen.

Am Code muss dafür nichts geändert werden.

## Farben

| Farbe | Verwendung |
|---|---|
| `#E52928` | Aktionen, laufende Spiele, Turniersieg |
| `#378C45` | Bestätigungen, Qualifikation, gewonnene Partien |
| `#000000` | Header, Gruppenköpfe, Flächen |
| `#FFFFFF` | Inhalte |

Definiert sind sie zentral in `src/styles/tokens.css`.

## Turniermodi

### Single KO
Wer verliert, scheidet aus. Krumme Teilnehmerzahlen werden auf die nächste Zweierpotenz aufgefüllt;
die Freilose gehen an die höchstgesetzten Spieler. Ein Spiel um Platz 3 ist optional.

### Doppel-KO
Alle starten in der **Siegerrunde**. Wer dort verliert, wandert in die **Verliererrunde**; eine
zweite Niederlage bedeutet das Aus. Im **Grand Final** trifft der Sieger der Siegerrunde auf den
Sieger der Verliererrunde. Verliert der Sieger der Siegerrunde dabei sein erstes Spiel im Turnier,
entscheidet ein **Final-Rückspiel (Bracket Reset)** – dieses erscheint automatisch nur dann, wenn es
tatsächlich gebraucht wird.

### Gruppenphase + KO
Jeder gegen jeden in Gruppen, danach eine KO-Runde. Gruppenanzahl × Gruppenstärke muss der
Teilnehmerzahl entsprechen. Die Zahl der Qualifikanten muss eine Zweierpotenz ergeben – dafür gilt
eine einzige Regel:

```
Qualifikanten = 2 × Gruppen + beste Dritte
```

Die „besten Dritten" füllen dabei genau die Lücke zur nächsten Zweierpotenz und dürfen die
Gruppenanzahl nicht übersteigen. Daraus ergeben sich unter anderem:

| Teilnehmer | Gruppen | Qualifiziert | Beste Dritte | KO-Runden |
|---|---|---|---|---|
| 8 | 2 à 4 | 4 | – | Halbfinale, Finale |
| 12 | 3 à 4 | 8 | 2 | Viertelfinale … Finale |
| 16 | 4 à 4 | 8 | – | Viertelfinale … Finale |
| 24 | 6 à 4 | 16 | 4 | Achtelfinale … Finale |
| 32 | 8 à 4 | 16 | – | Achtelfinale … Finale |
| 48 | 12 à 4 | 32 | 8 | Sechzehntelfinale … Finale |
| 64 | 16 à 4 | 32 | – | Sechzehntelfinale … Finale |

128 Teilnehmer sind im Gruppenmodus nicht möglich. Die Konfigurationsmaske zeigt zu jeder
Teilnehmerzahl die gültigen Gruppenkombinationen als Auswahlliste an.

**Setzung:** Ohne nachrückende Dritte spielt der Sieger einer Gruppe gegen den Zweiten einer anderen
Gruppe (Kreuzmuster A1–B2, B1–A2, C1–D2 …). Mit nachrückenden Dritten treffen die besten
Gruppensieger auf die qualifizierten Dritten; die übrigen Sieger spielen gegen die schwächsten
Zweiten, der Rest der Zweiten wird untereinander aufgeteilt. Ein Gruppenduell in Runde 1 wird
automatisch vermieden.

## Spielregeln

**Legs:** Die eingestellte Zahl ist ein **Best of N** – bei Best of 3 gewinnt, wer zuerst 2 Legs holt.
Ein Unentschieden ist nur in der Gruppenphase und nur bei geradem N möglich (z. B. Best of 2 → 1:1).

**Dart:** Eine der drei Spielarten 301 Double Out, 501 Double Out oder Cricket gilt für das ganze
Turnier. Die Leg-Anzahl wird je Spielart getrennt gespeichert und bleibt beim Umschalten erhalten.

**Cornhole:** Ein Leg endet bei 21 Punkten. Zusätzlich zu den Legs wird immer das Punkteergebnis
erfasst.

**Ergebniseingabe:** Die Legs sind Pflicht. Punkte müssen zusätzlich eingetragen werden, wenn
Cornhole gespielt wird oder wenn ein Spiel über ein einzelnes Leg entschieden wird. Die
Schnelleingabe akzeptiert Kurzformen wie `1:0 (21:17)`.

**Wertung:** Sieg = 2 Punkte, Unentschieden = 1, Niederlage = 0. Die Gruppenplatzierung entscheidet
sich nach **Punkte → Leg-Differenz → direkter Vergleich → gewonnene Legs → Losentscheid**.

## Spielplan und faire Pausen

Aus Turnierstart, durchschnittlicher Spieldauer und Anzahl der Spielfelder wird ein Zeitraster
gebildet. Für jeden Zeitslot wird jedes freie Feld mit der spielbereiten Partie belegt, deren Spieler
**am längsten pausiert haben**. Dadurch entstehen weder Doppelbelegungen noch einzelne Spieler, die
auffällig lange warten. Auf der Plan-Seite lassen sich Feld und Startzeit jedes Spiels vor dem
Turnierstart noch von Hand überschreiben.

## Aufbau

```
src/
  engine/      Turnierlogik, komplett ohne UI und vollständig unit-getestet
    types.ts         Datenmodell (Match, Slot, Tournament, Config …)
    rng.ts           Reproduzierbare Auslosung über einen gespeicherten Seed
    validation.ts    Plausibilitätsprüfung und gültige Gruppenkombinationen
    groups.ts        Gruppenauslosung und Round Robin (Kreisverfahren)
    standings.ts     Tabellenberechnung inkl. direktem Vergleich
    bracket.ts       Single-Elimination-Baum mit Freilosen
    doubleKo.ts      Sieger-/Verliererrunde, Grand Final, Bracket Reset
    qualification.ts Gruppenplatzierungen → KO-Setzung
    schedule.ts      Verteilung auf Spielfelder und Zeitslots
    tournament.ts    Orchestrierung, Phasenwechsel, Endplatzierung
    stats.ts         Ewige Tabelle über alle Turniere
  store/       Zustand-Store mit localStorage-Persistenz und Export/Import
  pages/       Konfiguration · Turnierplan · Turnier (live) · Ewige Tabelle
  components/  Wiederverwendbare Bausteine (Bracket, Tabellen, Ergebnisdialog …)
```

Die gesamte Turnierlogik ist frei von React und besteht aus reinen Funktionen. Fehlerträchtige
Bereiche – Freilose, Bracket Reset, beste Dritte, Tiebreaker, Doppelbelegungen – sind durch Tests
abgedeckt (`npm run test`), inklusive vollständiger Turnierdurchläufe für 2 bis 24 Teilnehmer.

## Daten sichern

Auf der Seite **Ewige Tabelle** gibt es `Export (JSON)` und `Import`. Der Export enthält das laufende
Turnier und das komplette Archiv und eignet sich sowohl als Backup als auch zum Übertragen auf einen
anderen Rechner. Da die Daten im `localStorage` des Browsers liegen, gehen sie beim Löschen der
Browserdaten verloren – vor größeren Turnieren lohnt sich ein Export.
