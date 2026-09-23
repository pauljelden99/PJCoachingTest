"use client";

import { useEffect, useState } from "react";

import { ApiError, getAthleteProfile, getAthletes, updateAthleteProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { AthleteProfile, AthleteSummary, UserProfileUpdate } from "@/types/training";

// Zeigt und bearbeitet saemtliche Formeln zur taeglichen Trainingslast-
// berechnung (Banister-TRIMP bei HF-Daten, kontinuierliche Pace-
// Kostenfunktion um vLT3 sonst, D'-Balance-Extra-Term oberhalb der
// Critical Speed - siehe backend/app/services/training_load.py) fuer
// einen frei waehlbaren Athleten. Lebt bewusst im eigenen Profil des
// Trainers statt im Athletenprofil (app/athletes/page.tsx), da diese
// Werte reine Trainer-Kalibrierung sind, kein Bestandteil des
// Athletenprofils selbst - serverseitig zusaetzlich ueber
// TRAINER_ONLY_FIELDS (services/user_profile.py) abgesichert, ein Athlet
// kann sie nicht selbst setzen.
export function LoadFormulaSettings() {
  const { token } = useAuth();
  const [athletes, setAthletes] = useState<AthleteSummary[]>([]);
  const [athleteId, setAthleteId] = useState<number | null>(null);
  const [athlete, setAthlete] = useState<AthleteProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [trimpExponent, setTrimpExponent] = useState("");
  const [trimpWeight, setTrimpWeight] = useState("");
  const [loadK, setLoadK] = useState("");
  const [csUseVlt3, setCsUseVlt3] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    getAthletes(token).then((result) => {
      setAthletes(result);
      setAthleteId((prev) => prev ?? result[0]?.id ?? null);
    });
  }, [token]);

  useEffect(() => {
    if (!token || !athleteId) return;
    setAthlete(null);
    setLoadError(null);
    setSaved(false);
    getAthleteProfile(athleteId, token)
      .then((a) => {
        setAthlete(a);
        setTrimpExponent(a.trimp_exponent_factor?.toString() ?? "");
        setTrimpWeight(a.trimp_weight_factor?.toString() ?? "");
        setLoadK(a.load_k?.toString() ?? "");
        setCsUseVlt3(a.cs_use_vlt3);
      })
      .catch((err) =>
        setLoadError(err instanceof ApiError ? err.message : "Athletenprofil konnte nicht geladen werden")
      );
  }, [athleteId, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !athleteId) return;
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const payload: UserProfileUpdate = {
        trimp_exponent_factor: trimpExponent ? Number(trimpExponent) : null,
        trimp_weight_factor: trimpWeight ? Number(trimpWeight) : null,
        load_k: loadK ? Number(loadK) : null,
        cs_use_vlt3: csUseVlt3,
      };
      const updated = await updateAthleteProfile(athleteId, payload, token);
      setAthlete(updated);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Formeln konnten nicht gespeichert werden");
    } finally {
      setSubmitting(false);
    }
  }

  // Ein Trainer ohne Athleten hat hier nichts zu konfigurieren.
  if (athletes.length === 0) return null;

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-medium text-ink">Belastungsformeln</h2>
        <select
          className="select-inline"
          value={athleteId ?? ""}
          onChange={(e) => setAthleteId(Number(e.target.value))}
        >
          {athletes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-mist">
        Je nach Datenquelle einer Aktivität greift eine von zwei Formeln zur täglichen Trainingslast (Grundlage von
        Fitness/Fatigue/Form im Dashboard) - hier individuell pro Athlet überschreibbar. Leer gelassen gilt jeweils
        die Standardformel.
      </p>

      {loadError && <p className="text-sm text-danger">{loadError}</p>}

      {athlete && (
        <>
          <div>
            <h3 className="mb-1 text-sm font-medium text-ink">Banister-TRIMP (bei Herzfrequenzdaten)</h3>
            <p className="mb-2 text-xs text-mist">
              Last = Dauer × HF-Reserve-Anteil × Gewicht × e^(Exponent × HF-Reserve-Anteil). Standard: Exponent 1,92
              / Gewicht 0,64 für Männer, 1,67 / 0,86 für Frauen.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Exponent-Faktor</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="1.92"
                  className="input"
                  value={trimpExponent}
                  onChange={(e) => setTrimpExponent(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Gewichts-Faktor</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.64"
                  className="input"
                  value={trimpWeight}
                  onChange={(e) => setTrimpWeight(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium text-ink">Pace-Kostenfunktion (ohne HF-Daten)</h3>
            <p className="mb-2 text-xs text-mist">
              Last = Σ Minuten je Pace (v) × (v / vLT3)^K. vLT3 ist die Pace bei 3 mmol/l Laktat
              (Laktat-Leistungsdiagnostik im Athletenprofil, sonst die Schwellenpace). K wird automatisch aus dem
              Riegel-Ermüdungsexponenten über alle hinterlegten Bestzeiten berechnet (K→3 bei starker Ausdauer,
              K→2 bei eher schnelligkeitsbetonter Leistungsstruktur) - fehlen ausreichend Bestzeiten, gilt K 2,5.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">K (überschreibt Riegel-Berechnung)</label>
                <input
                  type="number"
                  step="0.05"
                  min="2"
                  max="3"
                  placeholder="automatisch"
                  className="input"
                  value={loadK}
                  onChange={(e) => setLoadK(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-sm font-medium text-ink">D'-Balance-Extra-Term (oberhalb Critical Speed)</h3>
            <p className="mb-2 text-xs text-mist">
              Zusätzlich zur obigen Last: bei Intervalleinheiten oberhalb der Critical Speed (CS) wird über das
              D'-Balance-Modell (Skiba et al. 2012) ein Extra-Term aus Tempo/Länge der Wiederholungen sowie
              Pausendauer/-tempo berechnet und aufaddiert. CS und die anaerobe Kapazität D' werden aus den
              Bestzeiten geschätzt (Critical-Speed-2-Parameter-Modell) - einsehbar im Athletenprofil.
            </p>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={csUseVlt3}
                onChange={(e) => setCsUseVlt3(e.target.checked)}
              />
              vLT3 statt des berechneten Critical Speed verwenden
            </label>
          </div>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-moss">Gespeichert.</p>}

      <button type="submit" disabled={submitting || !athlete} className="btn-primary w-full">
        Speichern
      </button>
    </form>
  );
}
