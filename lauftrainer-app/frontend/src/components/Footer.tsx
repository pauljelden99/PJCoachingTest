import Link from "next/link";

// Rechtlich vorgeschriebene Angaben (Impressum/Datenschutz) sowie Kontakt
// auf jeder Seite ganz unten - aktuell mit Platzhaltertexten, bis die
// echten Angaben (Anbieterkennzeichnung, Kontaktdaten) feststehen. Als
// eigene Komponente in layout.tsx eingebunden, damit sie unabhaengig vom
// Seiteninhalt (eingeloggt/ausgeloggt) immer am unteren Rand erscheint.
export function Footer() {
  return (
    <footer className="mt-auto border-t border-mist/10 bg-surface/60">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-6 py-5 text-center text-xs text-mist sm:flex-row sm:justify-between sm:text-left">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-start">
          <Link href="/impressum" className="transition-colors hover:text-ink hover:underline">
            Impressum
          </Link>
          <Link href="/datenschutz" className="transition-colors hover:text-ink hover:underline">
            Datenschutzerklärung
          </Link>
          {/* Aus der Navbar hierher verschoben (siehe components/Navbar.tsx)
              - Glossar ist wie Impressum/Datenschutz ein Nachschlagewerk,
              das man selten braucht, aber jederzeit von ueberall erreichen
              koennen soll, ohne dafuer dauerhaft Platz im primaeren
              Tab-Menue zu belegen. */}
          <Link href="/glossar" className="transition-colors hover:text-ink hover:underline">
            Glossar
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-end">
          <a href="tel:+491234567890" className="transition-colors hover:text-ink hover:underline">
            +49 123 4567890
          </a>
          <a href="mailto:kontakt@lauftrainer-app.example" className="transition-colors hover:text-ink hover:underline">
            kontakt@lauftrainer-app.example
          </a>
        </div>
      </div>
    </footer>
  );
}
