"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/lib/auth-context";

const LINK_CLASS = "px-3 py-1.5 rounded-full text-sm font-medium transition-colors";

// Auf diesen oeffentlichen Auth-Seiten bleibt die Navbar auch dann
// ausgeblendet, wenn im Browser noch ein gueltiger Token einer frueheren
// Sitzung liegt (z.B. gemeinsam genutztes Geraet) - sonst waere die volle
// Tableiste des vorherigen Kontos bereits sichtbar/klickbar, bevor sich
// jemand bewusst neu anmeldet oder abmeldet (siehe auch handleLogout, das
// deshalb aktiv auf /login navigiert statt sich auf diese Pruefung allein
// zu verlassen).
const HIDE_NAVBAR_PATHS = ["/login", "/forgot-password", "/reset-password"];

// useSearchParams() braucht einen Suspense-Grenzwert (siehe Next.js App
// Router) - da die Navbar in layout.tsx ausserhalb jeder Seiten-eigenen
// Suspense-Boundary sitzt, wird sie dort selbst in <Suspense> gewrappt.
export function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Nur fuer die Smartphone-Breite relevant (ab md steht die volle
  // Tableiste, siehe unten) - ein Seitenwechsel schliesst das Menue wieder,
  // sonst bliebe es ueber der neuen Seite offen stehen.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname, searchParams]);

  if (!user) return null;
  if (HIDE_NAVBAR_PATHS.some((path) => pathname?.startsWith(path))) return null;

  // Navigiert nach dem Abmelden aktiv zum Login - reines logout() raeumt
  // nur den Auth-State auf und reicht auf geschuetzten Seiten (RouteGuard
  // reagiert dort selbst auf user=null), aber nicht auf oeffentlichen
  // Seiten wie /impressum oder /datenschutz (bewusst ohne RouteGuard, siehe
  // dort), auf denen man sonst trotz Abmeldung stehen bliebe.
  function handleLogout() {
    logout();
    router.replace("/login");
  }

  // Fuer den Trainer haengt jeder Tab an `athlete_id`, damit der Wechsel
  // zwischen den vier Ansichten den gerade ausgewaehlten Athleten
  // beibehaelt (die Athletenauswahl per Dropdown passiert auf jeder der
  // vier Seiten selbst, siehe z.B. app/training-plan/page.tsx). Der
  // Profil-Link oben rechts bekommt bewusst KEIN athlete_id-Suffix - das
  // ist der Weg zum eigenen Konto (siehe app/profile/page.tsx), getrennt
  // von der Athletenprofile-Ansicht unter /athletes.
  const athleteId = searchParams.get("athlete_id");
  const suffix = athleteId ? `?athlete_id=${athleteId}` : "";

  const baseLinks =
    user.role === "admin"
      ? [{ path: "/admin", label: "Admin" }]
      : user.role === "trainer"
        ? [
            { path: "/training-plan", label: "Plan & Protokoll" },
            { path: "/overview", label: "Übersicht" },
            { path: "/dashboard", label: "Dashboard" },
            { path: "/athletes", label: "Athletenprofile" },
            { path: "/year-planner", label: "Jahresplaner" },
            { path: "/tipps", label: "Tipps & Tricks" },
          ]
        : [
            { path: "/training-plan", label: "Plan & Protokoll" },
            { path: "/dashboard", label: "Dashboard" },
            { path: "/year-planner", label: "Jahresplaner" },
            { path: "/tipps", label: "Tipps & Tricks" },
          ];

  const links = baseLinks.map((link) => ({
    ...link,
    href: user.role === "trainer" ? `${link.path}${suffix}` : link.path,
  }));

  const isActive = (path: string) => !!pathname?.startsWith(path);

  return (
    <nav className="sticky top-0 z-40 border-b border-mist/10 bg-surface/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5 text-base font-semibold tracking-tight text-ink">
            <span className="h-2 w-2 rounded-full bg-moss shadow-sm shadow-moss/50" />
            Lauftrainer
          </span>
          {/* Die volle Tableiste passt nur auf Laptop/Desktop nebeneinander -
              auf dem Smartphone tritt das aufklappbare Menue rechts an ihre
              Stelle (siehe unten), statt die Tabs umbrechen oder seitlich
              aus dem Bild laufen zu lassen. */}
          <div className="hidden items-center gap-1 md:flex">
            {links.map((link) => (
              <Link
                key={link.path}
                href={link.href}
                className={`${LINK_CLASS} ${
                  isActive(link.path) ? "bg-moss/15 text-moss" : "text-mist hover:bg-mist/10 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {/* Glossar zieht in den Footer (siehe components/Footer.tsx) -
              dort steht es neben Impressum/Datenschutz, statt dauerhaft
              Platz im primaeren Tab-Menue zu belegen. Hilfe & Support
              entfaellt ganz (siehe app/hilfe/, entfernt). */}
          <Link
            href="/profile"
            className={`flex items-center gap-2 whitespace-nowrap rounded-full py-1 pl-2 pr-3 transition-colors ${
              isActive("/profile") ? "bg-moss/15 text-moss" : "text-mist hover:bg-mist/10 hover:text-ink"
            }`}
          >
            <Avatar name={user.name} src={user.avatar} size={24} />
            {/* Der Name kostet auf dem Smartphone die Breite, die das
                Menue braucht - das Bild allein genuegt dort als Einstieg
                ins eigene Profil. */}
            <span className="hidden sm:inline">{user.name}</span>
          </Link>
          <button
            onClick={handleLogout}
            className="hidden rounded-full px-3 py-1.5 text-mist transition-colors hover:bg-mist/10 hover:text-ink md:block"
          >
            Abmelden
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Menü schließen" : "Menü öffnen"}
            className="rounded-full p-2 text-mist transition-colors hover:bg-mist/10 hover:text-ink md:hidden"
          >
            <span aria-hidden className="block text-lg leading-none">
              {menuOpen ? "✕" : "☰"}
            </span>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-mist/10 bg-surface px-4 pb-3 pt-2 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.path}
                href={link.href}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(link.path) ? "bg-moss/15 text-moss" : "text-mist hover:bg-mist/10 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <button
              onClick={handleLogout}
              className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-mist transition-colors hover:bg-mist/10 hover:text-ink"
            >
              Abmelden
            </button>
          </div>
        </div>
      )}
    </nav>
  );
}
