"use client";

import { Suspense } from "react";

import { AccountCreateForm } from "@/components/AccountCreateForm";
import { AthleteProfileForm } from "@/components/AthleteProfileForm";
import { BakkenZoneTable } from "@/components/BakkenZoneTable";
import { DanielsZoneTable } from "@/components/DanielsZoneTable";
import { DeleteAccountForm } from "@/components/DeleteAccountForm";
import { LoadFormulaSettings } from "@/components/LoadFormulaSettings";
import { PasswordForm } from "@/components/PasswordForm";
import { RouteGuard } from "@/components/RouteGuard";
import { WattZoneTable } from "@/components/WattZoneTable";
import { ApiError, createAthlete, createTrainer } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// Ausschliesslich das eigene Konto (Name/E-Mail/Passwort/Integrationen) -
// fuer Athlet, Trainer und Admin gleichermassen. Athletenprofile, die ein
// Trainer einsieht/bearbeitet, sind bewusst eine eigene Seite
// (app/athletes/page.tsx), damit "eigenes Konto" und "fremdes
// Athletenprofil" nicht mehr in derselben Ansicht vermischt sind.
function ProfileContent() {
  const { user, token } = useAuth();

  if (!user) return null;

  // Trainer laufen nicht selbst - HF-Werte, Wettkampfzeiten und die daraus
  // abgeleiteten Tempozonen sind fuer ihr eigenes Profil nicht relevant.
  const isAthlete = user.role === "athlete";
  // Trainer mit Admin-Rechten duerfen dieselben Konten anlegen wie Admins
  // (siehe backend/app/core/deps.py:require_admin) - die Konto-Anlage lebt
  // daher hier im Trainerprofil statt (nur) unter der separaten
  // /admin-Seite. Ohne is_admin bleibt dieser Abschnitt fuer den Trainer
  // ausgeblendet.
  const canManageAccounts = user.role === "trainer" && user.is_admin;

  return (
    <main className="page max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Profil</h1>
      <AthleteProfileForm user={user} mode="self" isAthlete={isAthlete} />
      {isAthlete && (
        <>
          <DanielsZoneTable user={user} />
          <BakkenZoneTable user={user} />
          <WattZoneTable user={user} editable />
        </>
      )}
      {user.role === "trainer" && <LoadFormulaSettings />}
      {canManageAccounts && (
        <div>
          <h2 className="mb-3 text-lg font-medium tracking-tight text-ink">Konten verwalten</h2>
          <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      )}
      <PasswordForm />
      <DeleteAccountForm />
    </main>
  );
}

export default function ProfilePage() {
  return (
    <RouteGuard role={["athlete", "trainer", "admin"]}>
      <Suspense fallback={<main className="p-6 text-mist">Lädt...</main>}>
        <ProfileContent />
      </Suspense>
    </RouteGuard>
  );
}
