import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";

import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Lauftrainer Dashboard",
  description: "Trainingspläne, Protokolle und Belastungsanalyse",
};

// Explizit statt des Next.js-Defaults: `viewportFit: "cover"` laesst die
// Seite auf Geraeten mit Display-Ausschnitt (Notch/Dynamic Island) bis an
// den Rand laufen und macht dafuer env(safe-area-inset-*) nutzbar (siehe
// ThemeToggle unten). `maximumScale`/`userScalable` bleiben bewusst
// unangetastet, damit Zoomen als Bedienhilfe moeglich bleibt.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Setzt die "dark"-Klasse synchron vor dem ersten Paint, bevor React
// hydriert - sonst gaebe es kurz das falsche Theme zu sehen (Flash of
// Wrong Theme), da der Server das gespeicherte/Systempraeferenz-Theme
// nicht kennt. Siehe lib/theme-context.tsx fuer die Laufzeit-Logik.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = window.localStorage.getItem("lt_theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (theme === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            <Suspense fallback={null}>
              <Navbar />
            </Suspense>
            <div className="flex-1">{children}</div>
            <Footer />
            {/* Safe-Area-Abstand, damit der Umschalter auf dem Smartphone
                nicht unter der Home-Indicator-Leiste bzw. der Browser-
                Bedienleiste klebt (siehe viewportFit: "cover" oben). */}
            <div
              className="fixed bottom-4 right-4 z-50 rounded-full border border-mist/15 bg-surface shadow-lg shadow-ink/10"
              style={{
                bottom: "calc(1rem + env(safe-area-inset-bottom))",
                right: "calc(1rem + env(safe-area-inset-right))",
              }}
            >
              <ThemeToggle />
            </div>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
