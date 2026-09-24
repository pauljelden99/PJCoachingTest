#!/usr/bin/env bash
# Einmaliges Setup fuer einen frischen Strato-VPS (Ubuntu/Debian, Root-SSH-
# Zugang wie bei Strato ueblich vorausgesetzt) - installiert Docker samt
# Compose-Plugin und richtet die Firewall ein (nur SSH/HTTP/HTTPS nach
# aussen). Rest des Deployments (Repo klonen, .env.production anlegen,
# docker compose hochfahren) siehe README.md, Abschnitt "Produktivbetrieb".
#
# Nutzung auf dem frisch bestellten VPS: bash deploy/setup-server.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Bitte als root ausfuehren (z.B. direkt nach dem ersten SSH-Login)." >&2
  exit 1
fi

echo "==> System aktualisieren"
apt-get update
apt-get upgrade -y

echo "==> Docker Engine + Compose-Plugin installieren"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
else
  echo "Docker bereits installiert, ueberspringe."
fi

echo "==> Firewall einrichten (nur SSH/HTTP/HTTPS nach aussen)"
if ! command -v ufw >/dev/null 2>&1; then
  apt-get install -y ufw
fi
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> Fertig. Naechste Schritte:"
echo "    git clone <repo-url> && cd lauftrainer-app"
echo "    cp .env.production.example .env.production && Werte eintragen"
echo "    docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build"
