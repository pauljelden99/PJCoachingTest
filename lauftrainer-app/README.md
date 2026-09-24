# Lauftrainer-App

Plattform fuer Trainingsplaene, Trainingsprotokolle und Belastungs-
analyse (ATL/CTL/TSB, GA1/Schwelle/VO2max) mit manueller
Trainingseingabe.

## Architektur im Ueberblick

```
Manuelle Eingabe (frontend/)
        v
Normalizer (app/services/normalizer.py)
        v
Berechnungs-Engine (app/services/)       <- ATL/CTL/TSB, Zonen
        v
PostgreSQL
        v
REST-API (app/api/)
        v
Next.js-Dashboard (frontend/)            <- TypeScript
```

Der zentrale Architekturgedanke: rohe Eingabedaten werden auf ein
einheitliches Format normalisiert (`NormalizedActivity`), bevor sie die
Berechnungs-Engine erreichen - siehe `app/services/normalizer.py`.

## Datei-Uebersicht

```
lauftrainer-app/
├── docker-compose.yml          Gesamte Dev-Umgebung (DB, Redis, API, Worker, Web)
├── docker-compose.prod.yml     Produktiv-Stack (siehe "Produktivbetrieb" unten)
├── .env.example                Vorlage fuer Umgebungsvariablen
├── deploy/setup-server.sh      Einmaliges VPS-Setup (Docker + Firewall)
│
├── backend/
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── alembic.ini / alembic/  DB-Migrationen (Alembic)
│   ├── app/
│   │   ├── main.py             FastAPI-Einstiegspunkt
│   │   ├── worker.py           Celery-App
│   │   ├── core/
│   │   │   ├── config.py       Settings aus .env
│   │   │   └── database.py     SQLAlchemy Engine/Session
│   │   ├── models/              Athlete/User, Activity, PlannedSession
│   │   ├── schemas/             Pydantic-Schemas fuer die API
│   │   ├── services/
│   │   │   ├── training_load.py    ATL/CTL/TSB - reine Funktionen, getestet
│   │   │   ├── zone_classifier.py  GA1/Schwelle/VO2max - reine Funktionen, getestet
│   │   │   └── normalizer.py       verbindet die manuelle Eingabe mit der Berechnungs-Engine
│   │   └── api/
│   │       ├── activities.py   Aktivitaeten auflisten + manuelle Eingabe
│   │       └── training_load.py  CTL/ATL/TSB- und Zonen-Endpunkte
│   └── tests/                  pytest-Tests fuer training_load.py und zone_classifier.py
│
└── frontend/
    ├── package.json / tsconfig.json / tailwind.config.ts
    ├── Dockerfile
    └── src/
        ├── app/dashboard/page.tsx      setzt alle Komponenten zusammen
        ├── components/
        │   ├── TrainingLoadChart.tsx   Fitness/Fatigue/Form-Chart
        │   ├── ZoneDistribution.tsx    GA1/Schwelle/VO2max als Tortendiagramm
        │   └── ActivityList.tsx        Tabelle der letzten Aktivitaeten
        ├── lib/api.ts                  Backend-Client
        └── types/training.ts           TypeScript-Typen passend zu den Pydantic-Schemas
```

## Setup

```bash
cp .env.example .env
# .env mit echten Werten fuellen (DATABASE_URL/REDIS_URL reichen fuer
# den ersten Start)

docker compose up --build
```

- API: http://localhost:8000 (Health-Check: `/health`)
- Frontend: http://localhost:3000/dashboard
- Erste DB-Migration erzeugen und anwenden:

```bash
docker compose exec api alembic revision --autogenerate -m "initial"
docker compose exec api alembic upgrade head
```

## Produktivbetrieb (oeffentlicher Zugriff)

`docker-compose.yml`/`Dockerfile` sind bewusst auf lokale Entwicklung
ausgelegt (Uvicorn mit `--reload`, `next dev`, Quellcode als Volume
gemountet, DB/Redis-Ports offen). Fuer den oeffentlichen Betrieb gibt es
stattdessen `docker-compose.prod.yml`:

- `api`/`worker`/`web` bauen aus `backend/Dockerfile.prod` bzw.
  `frontend/Dockerfile.prod` (kein Reload, Next.js als gebauter
  Produktionsserver via `output: "standalone"`), ohne Code-Mount - ein
  Update erfordert `docker compose ... build`.
- `db`/`redis` sind nur noch intern im Compose-Netzwerk erreichbar, nicht
  mehr auf dem Host-Port.
- `caddy` ist der einzige von aussen erreichbare Dienst (Port 80/443) und
  reicht Anfragen laut `Caddyfile` an `api`/`web` weiter - Frontend und
  Backend teilen sich dadurch dieselbe Origin (kein CORS noetig).

Deployment auf einem eigenen Server (z.B. Strato VPS/Cloud Server, oder
jeder andere Linux-VPS mit Docker - der Ablauf ist ueberall identisch):

```bash
# Einmalig auf einem frischen VPS: Docker installieren + Firewall
# einrichten (nur SSH/80/443 nach aussen)
bash deploy/setup-server.sh

cp .env.production.example .env.production
# .env.production ausfuellen - insbesondere SECRET_KEY und
# POSTGRES_PASSWORD mit z.B. `openssl rand -hex 32` erzeugen, FRONTEND_ORIGIN
# auf die Server-IP (spaeter Domain) setzen. Details in den Kommentaren
# der Datei.

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm api alembic upgrade head
```

(`--env-file` ist noetig, damit Compose `.env.production` auch fuer seine
eigenen `${...}`-Platzhalter in `docker-compose.prod.yml` liest, z.B.
`POSTGRES_PASSWORD` - `env_file:` allein spielt die Werte nur in die
jeweiligen Container ein.)

Danach ist die Seite unter `http://<server-ip>/dashboard` erreichbar.
Sobald eine Domain auf den Server zeigt: `FRONTEND_ORIGIN` in
`.env.production` sowie die Adresse `:80` in
`Caddyfile` auf die Domain umstellen (`docker compose -f
docker-compose.prod.yml up -d --build` erneut ausfuehren) - Caddy holt dann
automatisch ein Let's-Encrypt-Zertifikat und leitet HTTP auf HTTPS um.

Ersten Admin-Account danach wie gewohnt per CLI anlegen (siehe unten,
`python -m app.create_admin`) - `docker compose --env-file .env.production
-f docker-compose.prod.yml exec api python -m app.create_admin --name "..."
--email admin@example.com --password "..."`.

## Testbetrieb auf GitHub Pages

GitHub Pages liefert ausschliesslich statische Dateien aus - kein
Node-Server, keine Datenbank. Fuer einen unverbindlichen Test-Link lässt
sich daher nur das **Frontend** dort veroeffentlichen; das Backend
(FastAPI + PostgreSQL + Redis) braucht weiterhin einen echten Server oder
einen Hosting-Dienst mit Python-Laufzeit (z.B. Render, Fly.io, oder der
eigene Server aus dem Abschnitt oben).

1. **Backend separat hosten** und dabei sicherstellen, dass es von
   ausserhalb erreichbar ist (eigene URL, z.B. `https://api.eure-domain.tld`
   oder die vom Hosting-Dienst vergebene Adresse). `FRONTEND_ORIGIN` dort auf
   die spaetere GitHub-Pages-Adresse setzen (nur Schema+Host, **ohne**
   Pfad, also z.B. `https://<user>.github.io` - nicht
   `https://<user>.github.io/<repo>`), damit CORS die Anfragen des
   Frontends akzeptiert. Soll parallel weiterhin z.B. `localhost:3000`
   funktionieren, zusaetzlich `CORS_EXTRA_ORIGINS=http://localhost:3000`
   setzen (kommagetrennt fuer mehrere Origins) - siehe
   `backend/app/core/config.py`.
2. **GitHub Pages aktivieren**: Repository-Settings -> *Pages* -> unter
   *Build and deployment* als Source **"GitHub Actions"** waehlen (nicht
   "Deploy from a branch"). Der Workflow
   `.github/workflows/deploy-pages.yml` baut dann bei jedem Push auf `main`
   (Aenderungen unter `frontend/`) automatisch einen statischen Export und
   veroeffentlicht ihn.
3. **Backend-Adresse hinterlegen**: Repository-Settings -> *Secrets and
   variables* -> *Actions* -> Tab *Variables* -> neue Repository-Variable
   `NEXT_PUBLIC_API_URL` mit der Backend-URL aus Schritt 1 anlegen. Ohne
   diese Variable faellt der Build auf den lokalen Entwicklungs-Default
   (`http://localhost:8000`) zurueck und die veroeffentlichte Seite kann
   sich von github.io aus nicht mit dem Backend verbinden.
4. Push auf `main` (oder den Workflow manuell unter *Actions* ausloesen) -
   die Seite ist danach unter `https://<user>.github.io/<repo>/` erreichbar
   (bzw. direkt unter `https://<user>.github.io/`, falls das Repo selbst
   `<user>.github.io` heisst - der Workflow erkennt das automatisch und
   laesst den URL-Pfad-Praefix dann weg).

Technischer Hintergrund: `frontend/next.config.js` schaltet nur innerhalb
dieses Workflows (`GITHUB_PAGES=true`) von `output: "standalone"` (Node-
Server, siehe Docker-Setup oben) auf `output: "export"` (reine
HTML/JS/CSS-Dateien) um - lokale Entwicklung und der Docker-Produktivbetrieb
sind davon unberuehrt. Da eine GitHub-Pages-Projektseite unterhalb von
`/<repo>/` statt einer eigenen Domain liegt, exportiert der Build zusaetzlich
mit passendem `basePath`/`assetPrefix` (aus dem Repo-Namen abgeleitet).

Da dies ein reiner Testbetrieb ist: es gibt keinen automatischen
Datenbank-Rollback o.ae. - alle unter der Backend-URL angelegten Konten/
Trainingsdaten bleiben bestehen, bis sie manuell geloescht werden.

### Backend-Tests lokal ausfuehren

```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```

`training_load.py` und `zone_classifier.py` sind bewusst als reine,
abhaengigkeitsfreie Funktionen geschrieben (kein DB- oder API-Zugriff)
- sie lassen sich daher isoliert und schnell testen. Die Formeln
wurden beim Erstellen bereits gegen mehrere Szenarien durchgerechnet
(u.a. Konvergenzverhalten bei konstanter Trainingslast, Reaktions-
geschwindigkeit von ATL vs. CTL bei einer Belastungsspitze).

## Multi-User, Auth, Trainer-Ansicht &amp; Datenanalyse

- **Authentifizierung**: echtes Login (`app/api/auth.py`) mit bcrypt-gehashten
  Passwoertern und JWT-Bearer-Token (`app/core/security.py`,
  `app/core/deps.py`). `Athlete` wurde zu `User` (Tabelle `users`) mit einer
  Rolle `athlete`/`trainer`/`admin` (`app/models/user.py`). Alle athletenbezogenen
  Routen pruefen ueber `ensure_can_access_athlete`, dass nur der Athlet selbst
  oder ein Trainer zugreift.
- **Rollenvergabe**: Es gibt keine oeffentliche Selbstregistrierung -
  sowohl Athleten- als auch Trainer-Konten entstehen ausschliesslich ueber
  einen Admin: `POST /api/auth/athletes` bzw. `POST /api/auth/trainers`
  (beide admin-only, `app/core/deps.py:require_admin`), im Frontend unter
  `/admin` (`frontend/src/app/admin/page.tsx`). Da es fuer Admin-Konten
  bewusst keinen Registrierungsweg gibt, wird der erste Admin ausserhalb der
  App per CLI angelegt:
  ```bash
  cd backend
  python -m app.create_admin --name "..." --email admin@example.com --password "..."
  ```
- **Manuelles Trainingsprotokoll**: Formular im "Protokoll"-Tab von
  Plan & Protokoll (`frontend/src/components/ManualActivityForm.tsx`), nutzt
  den bereits vorhandenen `/api/activities/manual`-Endpoint.
- **Tägliches Wellness-Protokoll**: Ruhepuls, HRV, Schlafdauer und
  Schlafqualitaet (1-10) pro Tag, ebenfalls im "Protokoll"-Tab
  (`frontend/src/components/DailyWellnessForm.tsx`,
  `PUT /api/wellness/{athlete_id}/{day}`). Das Dashboard zeigt zu jeder
  Metrik einen eigenen Graphen mit einer 30-Tage-Baseline (Mittelwert +
  90%-Streuungsband, `app/services/wellness.py`).
- **Trainer-Ansicht**: jeder Nutzer mit Rolle `trainer` sieht alle Athleten
  (`GET /api/trainer/athletes`) und kann deren Trainingsplaene ueber ein neues
  CRUD (`app/api/training_plans.py`, Frontend unter `/trainer/[athleteId]`)
  anlegen/bearbeiten/loeschen.
- **Datenanalyse** (`/analytics`, `app/services/analytics.py`,
  `app/api/analytics.py`): effektiver VO2max pro Einheit (Daniels-Gilbert-
  VDOT-Formel), Wochenkilometer-Histogramm, Wettkampfprognosen (Riegel-Formel)
  fuer 5&nbsp;km/10&nbsp;km/Halbmarathon/Marathon, sowie A:C Workload Ratio und
  Verletzungsrisiko-Einstufung (Gabbett-Sweet-Spot-Zonen) auf Basis der
  bestehenden CTL/ATL/TSB-Zeitreihe.
- **Helles/dunkles Theme**: Nutzer koennen frei zwischen hell und dunkel
  wechseln (Umschalter unten rechts, `frontend/src/components/ThemeToggle.tsx`).
  Default ist die Systempraeferenz (`prefers-color-scheme`), die Wahl wird in
  `localStorage` gemerkt. Technisch ueber Tailwinds `darkMode: "class"` plus
  CSS-Variablen pro Theme (`frontend/src/app/globals.css`,
  `frontend/src/lib/theme-context.tsx`) - die Farb-Tokens (`paper`/`surface`/
  `ink`/`mist`/...) bleiben gleich benannt, nur ihre Werte wechseln. Recharts-
  Diagramme lesen ihre Farben zusaetzlich aus `frontend/src/lib/chart-theme.ts`,
  da SVG-Props keine CSS-Variablen/Tailwind-Klassen akzeptieren.
## To-Do

### Vor dem oeffentlichen Go-Live (Pflicht)

- [ ] **Impressum ausfuellen** (`frontend/src/app/impressum/page.tsx`) -
  enthaelt noch Platzhalterangaben ("Max Mustermann..."). Ohne echte
  Anbieterkennzeichnung nach § 5 TMG ist ein oeffentlicher Betrieb in
  Deutschland abmahnfaehig.
- [ ] **Datenschutzerklaerung ausfuellen** (`frontend/src/app/datenschutz/page.tsx`)
  - ebenfalls noch Platzhaltertext. Die App verarbeitet Gesundheitsdaten
    (Herzfrequenz, Trainingswerte) - das ist eine besondere Kategorie
    personenbezogener Daten nach Art. 9 DSGVO, im Zweifel juristisch
    pruefen lassen statt den Platzhaltertext nur zu ergaenzen.
- [ ] **VPS bestellen und Domain einrichten** (z.B. Strato VPS/Cloud
  Server, siehe Abschnitt "Produktivbetrieb" oben) - DNS-A-Record der
  Domain (z.B. im Strato-Kundenmenue) auf die Server-IP zeigen lassen,
  danach `FRONTEND_ORIGIN` in `.env.production` sowie die Adresse in
  `Caddyfile` von `:80` auf die Domain umstellen, damit Caddy automatisch
  HTTPS (Let's Encrypt) einrichtet.
- [ ] **`.env.production` mit echten Secrets befuellen** - `SECRET_KEY` und
  `POSTGRES_PASSWORD` per `openssl rand -hex 32` erzeugen (siehe Kommentare
  in `.env.production.example`), niemals die Beispielwerte uebernehmen.
- [ ] **SMTP fuer "Passwort vergessen" einrichten** (`SMTP_HOST` etc. in
  `.env.production`) - ohne SMTP-Server wird die Reset-Mail nur geloggt statt
  verschickt (`app/services/email.py`), Athleten koennen ihr Passwort dann
  nicht selbst zuruecksetzen.
- [ ] **Ersten Admin-Account anlegen** per CLI (`python -m app.create_admin`,
  Befehl siehe Abschnitt "Multi-User..." unten) und danach ueber `/admin`
  Trainer-/Athletenkonten anlegen.
- [ ] **Firewall konfigurieren** - erledigt `deploy/setup-server.sh`
  (nur Port 80/443 fuer Caddy und 22 fuer SSH nach aussen offen);
  `docker-compose.prod.yml` veroeffentlicht DB/Redis zwar bereits nicht
  mehr auf dem Host, die Firewall schuetzt aber zusaetzlich gegen
  Fehlkonfigurationen.
- [ ] **Deployment einmal durchspielen** (`docker compose --env-file
  .env.production -f docker-compose.prod.yml up -d --build`, Migration
  ausfuehren, `/health` sowie `/dashboard` unter der oeffentlichen Adresse
  aufrufen) - siehe Abschnitt "Produktivbetrieb" oben.

### Danach zeitnah (Betrieb absichern)

- [ ] **Automatische DB-Backups einrichten** - aktuell existiert kein
  Backup-Mechanismus; z.B. taeglicher `pg_dump` aus dem `db`-Container
  (`docker compose --env-file .env.production -f docker-compose.prod.yml
  exec db pg_dump -U lauftrainer lauftrainer`) per Cronjob in einen
  Offsite-Speicher (nicht auf demselben Server, sonst kein Schutz bei
  Server-/Disk-Ausfall).
- [ ] **Uptime-/Fehler-Monitoring** - z.B. ein externer Uptime-Check auf
  `/health` (UptimeRobot o.ae.) sowie zentrales Log-Sammeln
  (`docker compose logs` verschwindet sonst beim Container-Neustart).
  Aktuell gibt es keinerlei Alarmierung bei Ausfaellen.
- [ ] **Login-Rate-Limiting / Brute-Force-Schutz** pruefen - `POST
  /api/auth/login` (`app/api/auth.py`) hat aktuell kein Rate-Limiting;
  bei oeffentlichem Zugriff ein Kandidat fuer automatisierte
  Passwort-Rateversuche.
- [ ] **Log-Rotation fuer Docker-Container** einrichten (z.B.
  `max-size`/`max-file` im `logging`-Block je Service in
  `docker-compose.prod.yml`), sonst wachsen die Log-Dateien auf dem Server
  unbegrenzt.
- [ ] **Update-Prozess festlegen** - `docker-compose.prod.yml` mounted den
  Code bewusst nicht mehr live (siehe Abschnitt "Produktivbetrieb"); ein
  Codeupdate braucht `git pull` + `docker compose --env-file .env.production
  -f docker-compose.prod.yml up -d --build` + ggf. `alembic upgrade head`.
  Idealerweise als Skript oder CI-Job, nicht manuell aus dem Gedaechtnis.
- [ ] **Automatisch generierte SECRET_KEY/DB-Passwoerter sichern** - z.B. in
  einem Passwortmanager, nicht nur in `.env.production` auf dem Server
  (sonst kein Zugriff mehr bei Server-Totalausfall, z.B. fuer eine
  Wiederherstellung auf neuer Hardware).

### Offene Produkt-/Feature-Luecken

- [ ] **Redis/Celery-Verbindung pruefen** - vor dem Go-Live einmal
  `pytest tests/ -v` vollstaendig gruen bekommen (siehe Abschnitt
  "Backend-Tests" oben), falls `pip install -r requirements.txt` nicht
  (oder in der falschen Umgebung) ausgefuehrt wurde.
