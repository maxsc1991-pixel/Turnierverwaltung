# Turnierverwaltung · DC Lok Pfalzel

Lokale Webapp zur Durchführung von **Dart-** und **Cornhole-Turnieren**. Sie deckt den kompletten
Turniertag ab: konfigurieren → auslosen → Spielplan prüfen → live Ergebnisse erfassen → KO-Phase →
Endstand ins Archiv.

Die App läuft vollständig im Browser, braucht keinen Server und keine Internetverbindung. Alle Daten
liegen im `localStorage` des Browsers und lassen sich als JSON exportieren und importieren.

## Eine Datei, ein Doppelklick (empfohlen für den Turnierabend)

`npm run build` erzeugt `dist/index.html` – eine **einzige, vollständig eigenständige Datei**.
Programm, Stylesheet und Vereinslogo stecken darin. Nichts wird nachgeladen, es gibt keine
Nachbardateien, keinen Server und keine Internetverbindung.

```bash
npm install
npm run build
```

Die entstandene `dist/index.html` an einen beliebigen Ort kopieren – Desktop, USB-Stick,
Netzlaufwerk, E-Mail-Anhang –, nach Belieben umbenennen (z. B. `Turnierverwaltung.html`) und
**doppelklicken**. Das war's.

Node.js wird ausschließlich zum Bauen gebraucht. Der Rechner, auf dem das Turnier läuft, braucht
nichts außer einem Browser – dort muss weder etwas installiert noch etwas eingerichtet werden.

> **Wichtig zu den Daten:** Turniere und ewige Tabelle speichert der Browser lokal, getrennt je
> Browser **und je Ablageort**. Wird der Ordner verschoben oder ein anderer Browser verwendet, ist
> die ewige Tabelle zunächst leer – die Daten sind nicht weg, sie liegen nur am alten Ort. Zum
> Umziehen (und als Backup) gibt es auf der Seite *Ewige Tabelle* die Schaltflächen
> `Export (JSON)` und `Import`.

## Mit Entwicklungsserver starten

```bash
npm install
npm run dev
```

Danach die angezeigte Adresse (standardmäßig <http://localhost:5173>) im Browser öffnen. Änderungen
am Code sind sofort sichtbar; dafür muss das Terminal offen bleiben.

Weitere Befehle:

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver mit Hot Reload |
| `npm run build` | Baut `dist/` inklusive Typprüfung |
| `npm run paket` | Baut `dist/` ohne Typprüfung (schneller) |
| `npm run preview` | Gebauten Stand über einen lokalen Server testen |
| `npm run test` | Testsuite der Turnierlogik |

## Vereinslogo austauschen

Im Header und als Favicon wird `public/logo.svg` verwendet – eine Nachbildung des Vereinslogos in den
Vereinsfarben. Um das Originallogo zu verwenden, genügt **eine der beiden** Varianten:

- die eigene Datei als `public/logo.png` ablegen (wird bevorzugt geladen), **oder**
- `public/logo.svg` durch die eigene SVG-Datei ersetzen.

Am Code muss dafür nichts geändert werden; nach dem Austausch einmal `npm run build` laufen lassen.
Beim Bauen wird die Datei als Bilddaten fest in die HTML eingebettet – deshalb ist ein erneuter Build
nötig, ein Austausch im fertigen `dist/`-Ordner wirkt nicht mehr.

**Zur Dateigröße:** Die fertige HTML ist rund 1,7 MB groß, davon entfallen etwa 1,4 MB auf das
eingebettete Logo (`public/logo.png` liegt in 5597 × 5597 Pixeln vor, angezeigt wird es mit 44 px).
Wer die Datei kleiner haben möchte, legt eine verkleinerte Fassung (256 px genügen) als
`public/logo.png` ab – die HTML schrumpft damit auf etwa 350 KB. Auf die Funktion hat das keinen
Einfluss.

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
Teilnehmerzahl entsprechen.

**Eine einzelne Gruppe** ist von 3 bis 10 Spielern möglich – jeder gegen jeden. Ein Schalter auf der
Konfigurationsseite legt fest, was danach passiert: entweder bestreiten die beiden Erstplatzierten
ein **Finale** (Dritter wird der Tabellendritte), oder es gibt **keine KO-Runde** und die Endtabelle
entscheidet. Mit dem letzten Gruppenspiel ist das Turnier dann beendet.

**Ab zwei Gruppen** muss die Zahl der Qualifikanten eine Zweierpotenz ergeben – dafür gilt eine
einzige Regel:

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

Beim **Cornhole** zählen zusätzlich die erzielten Punkte: die Reihenfolge lautet dort
**Punkte → Leg-Differenz → Punktdifferenz → direkter Vergleich → Losentscheid**. Das ist nötig, weil
die Leg-Differenz beim Cornhole grob ausfällt (bei Best of 1 nur ±1) und sonst zu viele
Gleichstände entstünden. Die Gruppentabelle zeigt dafür zwei zusätzliche Spalten: *Punkte*
(erzielt:kassiert) und *PD* (Punktdifferenz). Werden mehrere Legs gespielt, ist die Punkteingabe die
Gesamtsumme über alle Legs – ein 2:1-Sieg mit insgesamt weniger Punkten ist dabei ausdrücklich
zulässig.

## Spielfelder festlegen

Auf der Seite *Turnierplan* trägt jede Gruppe im Kopf ein Auswahlfeld **Feld**:

- **automatisch** (Voreinstellung) – der Spielplan verteilt die Partien der Gruppe frei auf alle
  Felder und hält die Pausen möglichst gleichmäßig.
- **eine feste Feldnummer** – sämtliche Spiele dieser Gruppe laufen auf diesem Feld. Weil auf einem
  Feld nur nacheinander gespielt werden kann, werden sie automatisch hintereinander terminiert, und
  kein anderes Spiel belegt dieses Feld.

Unabhängig davon lässt sich in der Tabelle *Spielfelder und Zeiten* weiterhin jedes einzelne Spiel
von Hand auf ein anderes Feld oder eine andere Uhrzeit legen. Entsteht dabei eine Doppelbelegung –
zwei Spiele zur selben Zeit auf demselben Feld –, erscheint über der Tabelle eine Warnung mit den
betroffenen Feldern und Zeiten. Über *Neu auslosen* wird der Spielplan wieder sauber verteilt.

Während des Turniers zeigt jede Gruppe ihr festes Feld als rote Markierung neben dem Gruppennamen.

## Ablauf einer Gruppenphase mit KO-Runde

Ist die Gruppenphase abgeschlossen, führt der Weg über die Seite **KO-Phase vorbereiten**. Dort
lassen sich vor dem Start festlegen:

- durchschnittliche Spieldauer der KO-Spiele
- Leg-Anzahl (Best of N) – in der KO-Phase oft höher als in der Gruppenphase
- Anzahl der Spielfelder – am Turnierende stehen häufig weniger Boards zur Verfügung
- Startzeit; bleibt sie leer, schließt die KO-Phase direkt an das letzte Gruppenspiel an

Die Werte gelten ausschließlich für die KO-Spiele; die Gruppenphase und ihre Ergebnisse bleiben
unberührt. Zur Kontrolle zeigt die Seite die aus den Endtabellen ermittelte Setzung der ersten Runde
sowie alle Gruppentabellen.

In der KO-Phase steht hinter jedem Namen, woher der Spieler kommt: **A1** bedeutet Sieger der
Gruppe A, **B2** Zweiter der Gruppe B, **C3** ein nachgerückter Gruppendritter.

## Endplatzierung

Ist das Turnier abgeschlossen, zeigt die Turnieransicht die **vollständige Platzierung ab der
KO-Runde**: jeder Spieler, der die KO-Phase erreicht hat, mit Platz, Gruppenherkunft und der Runde,
in der er ausgeschieden ist. Wer in derselben Runde ausgeschieden ist, teilt sich einen Platz und
steht gemeinsam in einer Zeile – bei 16 Qualifizierten also `1.`, `2.`, `3.`, `4.`, `5.–8.` und
`9.–16.`.

Dieselbe Tabelle erscheint auf der Anzeigeseite unter dem Podest und im Turnierarchiv unter
*Endstand*. Wie viele Spieler aufgeführt werden, ergibt sich aus der Zahl der Qualifizierten: 48
Teilnehmer in 8 Gruppen à 6 ergeben 16 Qualifizierte und damit die besten 16. Bei 12 Gruppen à 4
wären es 32.

Gibt es keine KO-Phase (Einzelgruppe ohne Finale), entscheidet die Gruppentabelle – dann werden alle
Teilnehmer aufgeführt.

## Anzeigeseite für die Teilnehmer

Die Seite **Anzeige** stellt den Turnierstand kompakt und ohne Bedienelemente dar – gedacht für einen
zweiten Bildschirm, einen Beamer oder ein Tablet im Gastraum. Sie zeigt die gerade laufenden Spiele
groß hervorgehoben, die Gruppentabellen, die nächsten Paarungen mit Uhrzeit und Feld, den
Turnierbaum der KO-Phase und am Ende das Podest.

**Eigenes Fenster und Selbstaktualisierung:** Auf der Konfigurationsseite gibt es die Schaltfläche
*Anzeige in neuem Fenster öffnen* – so läuft die Tafel auf dem zweiten Bildschirm, während im ersten
Fenster weiter Ergebnisse erfasst werden. Ein zweites Fenster hat allerdings seinen eigenen
Arbeitsstand und bekommt Eingaben nicht von selbst mit. Deshalb lädt die Anzeigeseite den
Turnierstand regelmäßig neu; das Intervall wird auf der Konfigurationsseite unter *Automatisch
aktualisieren (Sek.)* eingestellt, **0 schaltet die Aktualisierung ab**. Zusätzlich meldet der
Browser über das `storage`-Ereignis sofort, wenn im anderen Fenster geschrieben wurde – in der Praxis
erscheinen Ergebnisse dadurch meist unmittelbar, und das Intervall dient als verlässlicher Rückfall.
Rechts oben zeigt die Seite an, in welchem Takt sie lädt und wann sie zuletzt aktualisiert hat.

## Spielplan pro Team (offline abrufbar und druckbar)

Die Seite **Teamplan** dreht den Spielplan von der Feld- auf die Teamsicht: oben wird ein Team
ausgewählt, darunter stehen alle seine Spiele mit Uhrzeit, Feld, Gegner und Ergebnis. Das nächste
Spiel steht als grüne Marke im Kopf – die häufigste Frage am Turnierabend („Wann und wo spielen
wir?") ist damit in zwei Klicks beantwortet.

Die Seite steht bereits nach *Spielplan generieren* zur Verfügung, also vor dem Turnierstart, und
funktioniert vollständig offline – sie ist Teil derselben HTML-Datei.

**Für die Ausgabe an die Teams:**

- *Diesen Plan drucken* druckt das angezeigte Blatt.
- *Alle Pläne drucken* erzeugt **ein Blatt je Team**, jeweils mit Vereinslogo, Turniername und dem
  eigenen Spielplan. Bei 24 Teams sind das 24 Seiten.
- Im Druckdialog statt eines Druckers *Als PDF speichern* wählen – so entsteht ohne Internet eine
  Datei, die sich per USB-Stick oder Messenger verteilen lässt.

Gedruckt werden nur die Blätter: Kopfzeile, Navigation und alle Schaltflächen bleiben außen vor.

Ergebnisse erscheinen aus Sicht des jeweiligen Teams – wer 1:2 verloren hat, sieht auf dem eigenen
Blatt `1:2`, der Gegner `2:1`. Solange die KO-Paarungen noch nicht feststehen, stehen sie auch auf
keinem Teamblatt; nach jeder Runde lohnt sich also ein neuer Ausdruck. Ein Freilos wird als solches
aufgeführt, allerdings ohne Uhrzeit und Feld.

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
    teamPlan.ts      Spielplan aus Sicht eines einzelnen Teams
    tournament.ts    Orchestrierung, Phasenwechsel, Endplatzierung
    stats.ts         Ewige Tabelle über alle Turniere
  store/       Zustand-Store mit localStorage-Persistenz und Export/Import
  pages/       Konfiguration · Turnierplan · Turnier (live) · Anzeige · Teamplan · Ewige Tabelle
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
