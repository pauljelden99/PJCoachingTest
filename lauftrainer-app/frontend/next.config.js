/** @type {import('next').NextConfig} */

// GitHub Pages kann nur statische Dateien ausliefern - kein Node-Server,
// keine Next.js-API-Routen, kein SSR zur Laufzeit. GITHUB_PAGES=true wird
// ausschliesslich vom Deploy-Workflow (.github/workflows/deploy-pages.yml)
// gesetzt und schaltet auf `output: "export"` um; jeder andere Build
// (lokal, Docker - siehe Dockerfile.prod) bleibt unveraendert beim
// bisherigen `output: "standalone"`-Server-Build.
const isGithubPages = process.env.GITHUB_PAGES === "true";

// Project-Page-URL (https://<user>.github.io/<repo>/) statt einer eigenen
// Domain - jeder Pfad/Asset-Link braucht daher den Repo-Namen als Praefix
// (basePath/assetPrefix), sonst zeigen absolute Links (z.B.
// <Link href="/profile">) unterhalb der Domain-Wurzel statt unterhalb von
// /<repo>/ ins Leere. Wird vom Workflow automatisch aus dem Repo-Namen
// gesetzt; lokal (ohne GITHUB_PAGES) bleibt der Wert leer und wirkt sich
// nicht aus.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig = {
  reactStrictMode: true,
  ...(isGithubPages
    ? {
        // Reiner Static-HTML/JS/CSS-Export (Ausgabeordner "out/") statt
        // eines Node-Servers - vorausgesetzt: keine Next.js-API-Routen, kein
        // serverseitiges Rendering zur Laufzeit, keine next/image-
        // Bildoptimierung. Alles bereits der Fall in dieser App (reine
        // Client-Komponenten + separates FastAPI-Backend, siehe README).
        output: "export",
        // GitHub Pages loest "/pfad/" zuverlaessig zu "pfad/index.html" auf;
        // ohne trailingSlash exportiert Next.js stattdessen "pfad.html",
        // was nicht in jedem Fall automatisch gefunden wird.
        trailingSlash: true,
        basePath,
        assetPrefix: basePath ? `${basePath}/` : undefined,
        images: {
          // next/image-Optimierung braucht einen Server; ohne Server muss
          // jedes Bild unveraendert ausgeliefert werden. Aktuell nutzt die
          // App kein next/image, schadet aber nicht, falls spaeter eines
          // hinzukommt.
          unoptimized: true,
        },
      }
    : {
        // Eigenstaendiger, minimaler Server-Output (.next/standalone) fuer
        // das Produktions-Image (frontend/Dockerfile.prod) - bündelt nur die
        // tatsaechlich benoetigten node_modules statt des kompletten
        // Installationsbaums. Ohne Auswirkung auf `next dev`
        // (docker-compose.yml).
        output: "standalone",
      }),
};

module.exports = nextConfig;
