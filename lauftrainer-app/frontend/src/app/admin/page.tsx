"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { AccountCreateForm } from "@/components/AccountCreateForm";
import { RouteGuard } from "@/components/RouteGuard";
import { ApiError, createAthlete, createTrainer } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

function AdminContent() {
  const { user, token } = useAuth();
  const router = useRouter();
  // Ein Trainer darf diese Seite nur mit Admin-Rechten sehen (siehe
  // backend/app/core/deps.py:require_admin) - ohne is_admin wuerde er hier
  // zwar landen, die Formulare aber gegen einen 403 vom Backend laufen.
  const allowed = user?.role === "admin" || (user?.role === "trainer" && user.is_admin);

  useEffect(() => {
    if (user && !allowed) router.replace("/training-plan");
  }, [user, allowed, router]);

  if (!allowed) return null;

  return (
    <main className="page max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Konten verwalten</h1>
      <div className="grid gap-6 sm:grid-cols-2">
        <AccountCreateForm
          role="athlete"
          title="Neuen Athleten anlegen"
          submitLabel="Athleten-Konto anlegen"
          onSubmit={(payload) => {
            if (!token) throw new ApiError(401, "Nicht angemeldet");
            return createAthlete(payload, token);
          }}
        />
        <AccountCreateForm
          role="trainer"
          title="Neuen Trainer anlegen"
          submitLabel="Trainer-Konto anlegen"
          onSubmit={(payload) => {
            if (!token) throw new ApiError(401, "Nicht angemeldet");
            return createTrainer(payload, token);
          }}
        />
      </div>
    </main>
  );
}

export default function AdminPage() {
  return (
    <RouteGuard role={["admin", "trainer"]}>
      <AdminContent />
    </RouteGuard>
  );
}
