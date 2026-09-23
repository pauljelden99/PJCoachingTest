"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/types/training";

function defaultRedirect(role: UserRole): string {
  if (role === "admin") return "/admin";
  return "/training-plan";
}

export function RouteGuard({
  role,
  children,
}: {
  role?: UserRole | UserRole[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Admin-Konten haben keine Athletendaten (hr_rest/hr_max/... bleiben
  // leer) - Seiten ohne explizite `role`-Angabe sind implizit fuer
  // Athleten/Trainer gedacht, nicht fuer Admins. Ohne diese Regel wuerde
  // ein Admin z.B. /dashboard direkt aufrufen koennen und eine leere,
  // fuer ihn bedeutungslose Ansicht sehen.
  const isAllowed =
    user !== null &&
    (Array.isArray(role) ? role.includes(user.role) : role ? user.role === role : user.role !== "admin");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!isAllowed) {
      router.replace(defaultRedirect(user.role));
    }
  }, [loading, user, isAllowed, router]);

  if (loading || !user || !isAllowed) {
    return (
      <main className="mx-auto max-w-4xl p-6 text-sm text-mist animate-pulse">Lädt...</main>
    );
  }

  return <>{children}</>;
}
