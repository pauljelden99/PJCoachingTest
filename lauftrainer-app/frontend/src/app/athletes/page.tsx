"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AthleteProfileForm } from "@/components/AthleteProfileForm";
import { BakkenZoneTable } from "@/components/BakkenZoneTable";
import { DanielsZoneTable } from "@/components/DanielsZoneTable";
import { RouteGuard } from "@/components/RouteGuard";
import { WattZoneTable } from "@/components/WattZoneTable";
import { ApiError, deleteAthlete, getAthleteProfile, getAthletes } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AthleteProfile, AthleteSummary } from "@/types/training";

// Trainer-Ansicht fuer Athletenprofile - bewusst von /profile (das eigene
// Trainerkonto: Name/E-Mail/Passwort/Integrationen) getrennt, damit die
// beiden nicht mehr wie zuvor in derselben Seite/Komponente vermischt sind
// (siehe app/profile/page.tsx).
function AthletesContent() {
  const { user, token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const athleteIdParam = searchParams.get("athlete_id");

  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [viewedAthlete, setViewedAthlete] = useState<AthleteProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getAthletes(token).then(setAthletes);
  }, [token]);

  useEffect(() => {
    if (!athleteIdParam && athletes.length > 0) {
      router.replace(`/athletes?athlete_id=${athletes[0].id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteIdParam, athletes]);

  useEffect(() => {
    if (!token || !athleteIdParam) {
      setViewedAthlete(null);
      return;
    }
    // Athletenwechsel setzt viewedAthlete sofort auf null - AthleteProfileForm
    // haelt seine Formularfelder in lokalem useState, das nur beim Mounten
    // aus der `user`-Prop initialisiert wird (siehe
    // components/AthleteProfileForm.tsx). Ohne dieses Zwischen-Unmounten
    // wuerde beim Wechsel zwischen zwei Athleten dieselbe Komponenteninstanz
    // mit neuer `user`-Prop weiterlaufen und die alten Formularwerte des
    // vorherigen Athleten anzeigen.
    setViewedAthlete(null);
    setLoadError(null);
    getAthleteProfile(Number(athleteIdParam), token)
      .then(setViewedAthlete)
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "Athletenprofil konnte nicht geladen werden")
      );
  }, [athleteIdParam, token]);

  async function handleDeleteAthlete() {
    if (!token || !viewedAthlete) return;
    if (
      !window.confirm(
        `${viewedAthlete.name} wirklich löschen? Alle Aktivitäten und Trainingspläne dieses Athleten gehen dabei unwiderruflich verloren.`
      )
    )
      return;
    try {
      await deleteAthlete(viewedAthlete.id, token);
      const remaining = athletes.filter((a) => a.id !== viewedAthlete.id);
      setAthletes(remaining);
      router.replace(remaining.length > 0 ? `/athletes?athlete_id=${remaining[0].id}` : "/athletes");
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Athlet konnte nicht gelöscht werden");
    }
  }

  if (!user) return null;

  return (
    <main className="page max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Athletenprofile</h1>
        <select
          className="select-inline"
          value={athleteIdParam ?? ""}
          onChange={(e) => router.push(`/athletes?athlete_id=${e.target.value}`)}
        >
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {!loadError && !viewedAthlete && <p className="text-sm text-mist">Lädt...</p>}
      {viewedAthlete && (
        <>
          <AthleteProfileForm
            user={viewedAthlete}
            mode="trainer"
            athleteId={Number(athleteIdParam)}
            onSaved={(updated) => setViewedAthlete((prev) => (prev ? { ...prev, ...updated } : prev))}
          />
          <DanielsZoneTable
            user={viewedAthlete}
            editable
            athleteId={Number(athleteIdParam)}
            onSaved={(updated) => setViewedAthlete((prev) => (prev ? { ...prev, ...updated } : prev))}
          />
          <BakkenZoneTable user={viewedAthlete} />
          <WattZoneTable
            user={viewedAthlete}
            editable
            athleteId={Number(athleteIdParam)}
            onSaved={(updated) => setViewedAthlete((prev) => (prev ? { ...prev, ...updated } : prev))}
          />
          <div className="card space-y-3 border border-danger/30">
            <h2 className="text-base font-medium text-ink">Athlet löschen</h2>
            <p className="text-xs text-mist">
              Löscht {viewedAthlete.name} samt aller Aktivitäten und Trainingspläne unwiderruflich - z.B. für einen
              Test-/QA-Account.
            </p>
            <button type="button" onClick={handleDeleteAthlete} className="btn-outline-danger">
              Athlet löschen
            </button>
          </div>
        </>
      )}
    </main>
  );
}

export default function AthletesPage() {
  return (
    <RouteGuard role={["trainer"]}>
      <Suspense fallback={<main className="p-6 text-mist">Lädt...</main>}>
        <AthletesContent />
      </Suspense>
    </RouteGuard>
  );
}
