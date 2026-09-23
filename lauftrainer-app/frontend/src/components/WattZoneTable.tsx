"use client";

import { useState } from "react";

import { ApiError, updateAthleteProfile, updateProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { computeFiveWattZones } from "@/lib/wattZones";
import type { User, UserProfileUpdate } from "@/types/training";

const ZONE_HINTS: Record<string, string> = {
  Erholung: "Aktive Erholung, sehr locker",
  Grundlage: "Grundlagenausdauer, lockere Ausfahrten",
  Tempo: "Tempo, zügiges Fahren",
  Schwelle: "Schwellentraining (Tempo, Cruise Intervals)",
  VO2max: "VO2max-Intervalle",
};

// Wattzonentabelle fuer Radeinheiten, Pendant zu DanielsZoneTable.tsx fuer
// Laufen - anders als dort gibt es fuer FTP keine automatische Ableitung
// aus einer Wettkampfzeit, daher kein *_manual-Umschalter: bei `editable`
// ist die FTP direkt in dieser Tabelle editierbar (Athlet im eigenen Profil
// wie bisher, Trainer zusaetzlich fuer ein fremdes Athletenprofil), sonst
// nur die daraus abgeleiteten Zonengrenzen (lib/wattZones.ts:
// computeFiveWattZones) read-only angezeigt.
// Fuenf Zonen (vereinfachtes Coggan-Modell) statt der drei Trainingszonen
// (GA1/Schwelle/VO2max), die fuer die eigentliche Einheiten-Planung
// verwendet werden (siehe SegmentEditor.tsx) - diese Tabelle ist rein
// informativ und feiner aufgeloest.
export function WattZoneTable({
  user,
  editable = false,
  athleteId,
  onSaved,
}: {
  user: User;
  editable?: boolean;
  athleteId?: number;
  onSaved?: (user: User) => void;
}) {
  const { token, setUser } = useAuth();
  const [ftpInput, setFtpInput] = useState(user.ftp_watts?.toString() ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const rows = computeFiveWattZones({ ftp_watts: user.ftp_watts });

  async function handleSave() {
    if (!token) return;
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const payload: UserProfileUpdate = { ftp_watts: ftpInput ? Number(ftpInput) : null };
      const updated = athleteId
        ? await updateAthleteProfile(athleteId, payload, token)
        : await updateProfile(payload, token);
      if (!athleteId) setUser(updated);
      onSaved?.(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "FTP konnte nicht gespeichert werden");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium text-ink">Wattzonen (Radfahren)</h2>
        {!editable && user.ftp_watts != null && <span className="text-xs text-mist">FTP {user.ftp_watts} W</span>}
      </div>
      <p className="mt-1 text-xs text-mist">
        Fünf Leistungszonen als Prozentsatz der Schwellenleistung (FTP), analog zur Trainingsbereichtabelle beim
        Laufen.
      </p>

      {editable && (
        <div className="mt-3 flex items-end gap-3">
          <div>
            <label className="label">FTP (Watt)</label>
            <input
              type="number"
              min={0}
              className="input w-32"
              value={ftpInput}
              onChange={(e) => setFtpInput(e.target.value)}
            />
          </div>
          <button type="button" onClick={handleSave} disabled={submitting} className="btn-outline">
            Speichern
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      {saved && !error && <p className="mt-2 text-sm text-moss">Gespeichert.</p>}

      {!rows && (
        <p className="mt-3 text-xs text-mist">
          Noch keine FTP hinterlegt - {editable ? "oben" : "im Profil"} eine Schwellenleistung (Watt) eintragen, um
          die Wattzonen zu berechnen.
        </p>
      )}

      {rows && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-mist">
                <th className="py-2 font-normal">Zone</th>
                <th className="py-2 font-normal">% FTP</th>
                <th className="py-2 font-normal">Leistungsbereich</th>
                <th className="py-2 font-normal">Einsatz</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.zone} className="border-t border-mist/10 transition-colors hover:bg-mist/5">
                  <td className="py-2 text-ink">{row.zone}</td>
                  <td className="py-2">
                    {row.upperPct != null
                      ? `< ${Math.round(row.upperPct * 100)}%`
                      : `≥ ${Math.round(row.lowerPct * 100)}%`}
                  </td>
                  <td className="py-2">
                    {row.upperWatts != null ? `${row.lowerWatts}–${row.upperWatts} W` : `≥ ${row.lowerWatts} W`}
                  </td>
                  <td className="py-2 text-mist">{ZONE_HINTS[row.zone]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
