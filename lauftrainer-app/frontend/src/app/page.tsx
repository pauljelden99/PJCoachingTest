"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/types/training";

// Gleiche Weiterleitungslogik wie RouteGuard.tsx (defaultRedirect) - hier
// separat gehalten statt importiert, da RouteGuard fuer eine ganze
// Kind-Seite gedacht ist (role-Pruefung + Kinder rendern), waehrend diese
// Seite selbst nur ein reiner Weiterleitungs-Stub ohne eigenen Inhalt ist.
function defaultRedirect(role: UserRole): string {
  if (role === "admin") return "/admin";
  return "/training-plan";
}

// Es gibt keine eigenstaendige Startseite - "/" existiert nur, damit die
// Domain-Wurzel (z.B. die GitHub-Pages-URL) nicht ins Leere laeuft, und
// leitet sofort zur passenden Einstiegsseite weiter: eingeloggt zur
// rollenspezifischen Standardseite, sonst zum Login.
export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? defaultRedirect(user.role) : "/login");
  }, [loading, user, router]);

  return <main className="mx-auto max-w-4xl p-6 text-sm text-mist animate-pulse">Lädt...</main>;
}
