# TAKT – Produktionsplaner

Ein bewusst einfacher, gemeinsamer Produktionsplan für kleine Teams. TAKT zeigt laufende Aufträge, erwartete Lieferungen, geplante Arbeiten, Abhängigkeiten und einen daraus abgeleiteten möglichen Fertigstellungstermin.

Kein ERP, keine Lagerverwaltung und keine Stundenbuchung.

## Funktionen

- gemeinsame Auftragsübersicht mit Ampelstatus
- Lieferungen und Arbeiten im dichten Tagesraster mit Datum und Kalenderwoche
- deutsche Arbeitswoche von Montag bis Freitag; Wochenenden zählen nicht zur Dauer
- Abhängigkeiten reihen Arbeiten automatisch ein oder warnen bei bewusst fixierten Terminen
- sichtbare Verbindungslinien zeigen, welche Lieferung oder Arbeit wovon abhängt
- Lieferungen zeigen die Zeitspanne von der Bestellung bis zum erwarteten Eingang
- ursprünglicher Plan, aktueller Termin und tatsächlicher Abschluss bleiben getrennt
- benannte Verspätungen, Unterbrechungen und frühere Fertigstellungen mit Hover-Hinweis
- Folgearbeiten können bei früher Fertigstellung wahlweise nachrücken oder ihren Plantermin behalten
- sichtbare Verlängerungen mit zusätzlichen Arbeitstagen und Begründung
- Balken im freischaltbaren Bearbeitungsmodus verschieben
- alternative Kalenderansicht auf derselben Datengrundlage
- manuell änderbare Termine, Zuständigkeiten und Notizen
- Vorschau auf Terminverschiebungen und mögliche Fertigstellung
- bestehende Aufträge als Ausgangspunkt kopieren
- für PC, Tablet und Smartphone optimiert
- SQLite-Datenbank ohne separaten Datenbankserver

## Auf Unraid starten

Das fertige Image wird nach jedem Push auf `main` von GitHub Actions gebaut und unter `ghcr.io/trollnick/productionplaner:latest` veröffentlicht.

### Mit Docker Compose

Die enthaltene `compose.yaml` ist bereits für Unraid vorbereitet:

```bash
docker compose up -d
```

Danach ist die App unter `http://UNRAID-IP:3080` erreichbar. Die Daten liegen dauerhaft unter:

```text
/mnt/user/appdata/production-planer
```

### Als Unraid-Docker-Template

Folgende Werte im Unraid-Docker-Dialog verwenden:

| Feld | Wert |
|---|---|
| Repository | `ghcr.io/trollnick/productionplaner:latest` |
| WebUI | `http://[IP]:[PORT:3001]` |
| Container Port | `3001` |
| Host Port | `3080` oder ein freier Port |
| Container Path | `/data` |
| Host Path | `/mnt/user/appdata/production-planer` |
| Variable `SEED_DEMO` | `false` |
| Variable `TZ` | `Europe/Berlin` |

Falls GHCR das Package zunächst als privat anlegt, muss es in GitHub unter **Packages → Package settings → Change visibility** öffentlich gemacht werden. Alternativ kann Unraid mit einem GitHub Personal Access Token für `read:packages` angemeldet werden.

### Container beendet sich mit `SQLITE_CANTOPEN`

Zuerst das aktuelle Image laden und den Container neu erstellen:

```bash
docker pull ghcr.io/trollnick/productionplaner:latest
docker compose up -d --force-recreate
```

Falls der Fehler weiterhin erscheint, prüfen, ob `/mnt/user/appdata/production-planer` als Verzeichnis existiert und `/data` tatsächlich dorthin gemountet ist.

## Backup

Alle Nutzdaten liegen im gemounteten `/data`-Verzeichnis. Für ein konsistentes manuelles Backup den Container kurz stoppen, das Verzeichnis sichern und den Container wieder starten:

```bash
docker stop production-planer
# /mnt/user/appdata/production-planer mit dem gewünschten Unraid-Backup sichern
docker start production-planer
```

## Lokal entwickeln

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`  
API: `http://localhost:3001`

Beim ersten lokalen Start werden zwei Beispielaufträge angelegt. Mit `SEED_DEMO=false` startet die App leer.

## Produktions-Build testen

```bash
npm run typecheck
npm run build
npm start
```

Oder vollständig als Container:

```bash
docker build -t production-planer .
docker run --rm -p 3080:3001 -v production-planer-data:/data production-planer
```
