"use client";

import { useState } from "react";

import { AvatarEditor } from "@/components/AvatarEditor";
import { ApiError, updateAthleteProfile, updateProfile } from "@/lib/api";
import { formatRaceTime, parseRaceTime } from "@/lib/format";
import { formatPaceValue } from "@/lib/pace";
import { useAuth } from "@/lib/auth-context";
import type { Gender, User, UserProfileUpdate, UserRole } from "@/types/training";

const ROLE_LABELS: Record<UserRole, string> = { athlete: "Athlet", trainer: "Trainer", admin: "Admin" };

const GENDER_OPTIONS: { value: Gender | ""; label: string }[] = [
  { value: "", label: "Nicht angegeben" },
  { value: "male", label: "Männlich" },
  { value: "female", label: "Weiblich" },
  { value: "diverse", label: "Divers" },
];

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
type WeekdayNotes = Record<(typeof WEEKDAYS)[number], string>;

function emptyWeekdayNotes(): WeekdayNotes {
  return { Mo: "", Di: "", Mi: "", Do: "", Fr: "", Sa: "", So: "" };
}

// weekly_rhythm_note wird als einzelnes Text-Feld im Backend gespeichert
// (kein Migrationsaufwand fuer die Tagesaufteilung); im Formular aber als
// JSON-Objekt {Mo:"", ...} kodiert, damit pro Wochentag ein eigenes
// Textfeld angezeigt werden kann. Alte, nicht als JSON gespeicherte
// Freitext-Notizen (vor dieser Aenderung) landen als Fallback im
// Montags-Feld, damit sie nicht verloren gehen.
function parseWeekdayNotes(note: string | null): WeekdayNotes {
  const empty = emptyWeekdayNotes();
  if (!note) return empty;
  try {
    const parsed = JSON.parse(note);
    if (parsed && typeof parsed === "object") {
      return { ...empty, ...parsed };
    }
  } catch {
    // kein JSON -> alte Freitext-Notiz, siehe Kommentar oben
  }
  return { ...empty, Mo: note };
}

function serializeWeekdayNotes(notes: WeekdayNotes): string | null {
  if (WEEKDAYS.every((d) => !notes[d].trim())) return null;
  return JSON.stringify(notes);
}

// Vereint die frueher getrennten Formulare/Karten "Profilinformationen"
// (Profilbild/Name/E-Mail), "Profil" (HF-Werte/Wettkampfzeiten) und
// "Persoenliche Daten und Ziele" zu einem Formular. Wird sowohl vom
// Athleten fuer das eigene Profil (mode="self", PUT /api/auth/me) als auch
// vom Trainer im Athletenprofile-Tab fuer ein fremdes Profil genutzt
// (mode="trainer", PUT /api/trainer/athletes/{athleteId}). Die Profilinfo-
// Felder (Bild/Name/E-Mail) werden nur im mode="self" angezeigt/gesendet -
// ein Trainer soll nicht ueber dieses Formular Bild/Login-Daten eines
// fremden Accounts aendern koennen. Die athletenspezifischen Abschnitte
// (Wettkampfzeiten, Physiologische Messwerte, Ziele) werden nur gezeigt,
// wenn isAthlete gesetzt ist - fuer das eigene Profil eines Trainers (der
// nicht selbst trainiert wird) bleibt nur der Profilinformationen-
// Abschnitt. Die Formeln zur Trainingslastberechnung (TRIMP/Pace-
// Kostenfunktion) werden bewusst NICHT hier, sondern im eigenen Profil des
// Trainers gepflegt (siehe components/LoadFormulaSettings.tsx) - dort mit
// Athletenauswahl statt als Teil des Athletenprofils, und serverseitig
// ohnehin auf Trainer beschraenkt (TRAINER_ONLY_FIELDS in
// services/user_profile.py), damit ein Athlet seine eigene Trainingslast
// nicht durch Anpassen der Formel schoenrechnen kann.
export function AthleteProfileForm({
  user,
  mode,
  athleteId,
  isAthlete = true,
  onSaved,
}: {
  // Trainer-Sicht (mode="trainer") liefert zusaetzlich die aus den
  // Bestzeiten berechneten Critical Speed/D'/Riegel-Koeffizient b (siehe
  // schemas/user.py:AthleteProfileOut) - fuer die Selbstansicht
  // (mode="self") bleiben diese Felder undefined, siehe Abschnitt
  // "Physiologische Messwerte" unten. Der Athlet selbst soll den
  // Riegel-Koeffizienten laut Vorgabe nicht einsehen koennen.
  user: User & { critical_speed_mps?: number | null; d_prime_m?: number | null; riegel_b?: number | null };
  mode: "self" | "trainer";
  athleteId?: number;
  isAthlete?: boolean;
  onSaved?: (user: User) => void;
}) {
  const { token, setUser } = useAuth();

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [avatar, setAvatar] = useState<string | null>(user.avatar);
  const [birthDate, setBirthDate] = useState(user.birth_date ?? "");
  const [gender, setGender] = useState<Gender | "">(user.gender ?? "");
  const [heightCm, setHeightCm] = useState(user.height_cm?.toString() ?? "");
  const [weightKg, setWeightKg] = useState(user.weight_kg?.toString() ?? "");
  const [weekdayNotes, setWeekdayNotes] = useState<WeekdayNotes>(parseWeekdayNotes(user.weekly_rhythm_note ?? null));
  const [hrRest, setHrRest] = useState(user.hr_rest?.toString() ?? "");
  const [hrMax, setHrMax] = useState(user.hr_max?.toString() ?? "");
  const [vlt3Pace, setVlt3Pace] = useState(formatRaceTime(user.vlt3_pace_sec_per_km));
  const [vlaMax, setVlaMax] = useState(user.vla_max?.toString() ?? "");
  const [vo2maxMeasured, setVo2maxMeasured] = useState(user.vo2max_measured?.toString() ?? "");
  // FTP wird nicht mehr hier, sondern direkt in der Wattzonentabelle
  // gepflegt (siehe WattZoneTable.tsx) - analog zu den Jack-Daniels-Zonen,
  // die ebenfalls direkt in ihrer Tabelle editierbar sind.
  const [warmupPace, setWarmupPace] = useState(formatRaceTime(user.warmup_pace_sec_per_km));
  const [cooldownPace, setCooldownPace] = useState(formatRaceTime(user.cooldown_pace_sec_per_km));
  const [warmupWatts, setWarmupWatts] = useState(user.warmup_watts?.toString() ?? "");
  const [cooldownWatts, setCooldownWatts] = useState(user.cooldown_watts?.toString() ?? "");
  const [race100, setRace100] = useState(formatRaceTime(user.race_100m_time_s));
  const [race400, setRace400] = useState(formatRaceTime(user.race_400m_time_s));
  const [race800, setRace800] = useState(formatRaceTime(user.race_800m_time_s));
  const [race1500, setRace1500] = useState(formatRaceTime(user.race_1500m_time_s));
  const [race5k, setRace5k] = useState(formatRaceTime(user.race_5k_time_s));
  const [race10k, setRace10k] = useState(formatRaceTime(user.race_10k_time_s));
  const [raceHm, setRaceHm] = useState(formatRaceTime(user.race_hm_time_s));
  const [raceMarathon, setRaceMarathon] = useState(formatRaceTime(user.race_marathon_time_s));
  const [goalRaceName, setGoalRaceName] = useState(user.goal_race_name ?? "");
  const [goalRaceDate, setGoalRaceDate] = useState(user.goal_race_date ?? "");
  const [goalTime, setGoalTime] = useState(formatRaceTime(user.goal_time_s));
  const [notes, setNotes] = useState(user.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Standardmaessig nur Anzeige der eigenen/betrachteten Daten - Bearbeiten
  // erst nach explizitem Klick auf "Profil bearbeiten" (siehe readOnly
  // unten). Die Aufwaerm-/Cooldown-Vorgaben (nur fuer den Trainer sichtbar,
  // mode==="trainer") bleiben davon unberuehrt und sind immer als Eingabe-
  // felder editierbar, siehe Abschnitt weiter unten - kein Athlet sieht
  // diesen Abschnitt ueberhaupt (mode==="self" zeigt ihn nicht).
  const [editMode, setEditMode] = useState(false);
  const readOnly = !editMode;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSaved(false);
    setSubmitting(true);
    try {
      const payload: UserProfileUpdate = {
        ...(mode === "self" ? { name, email, avatar } : {}),
        ...(isAthlete
          ? {
              birth_date: birthDate || null,
              gender: gender || null,
              height_cm: heightCm ? Number(heightCm) : null,
              weight_kg: weightKg ? Number(weightKg) : null,
              weekly_rhythm_note: serializeWeekdayNotes(weekdayNotes),
              hr_rest: hrRest ? Number(hrRest) : null,
              hr_max: hrMax ? Number(hrMax) : null,
              vlt3_pace_sec_per_km: parseRaceTime(vlt3Pace),
              vla_max: vlaMax ? Number(vlaMax) : null,
              vo2max_measured: vo2maxMeasured ? Number(vo2maxMeasured) : null,
              race_100m_time_s: parseRaceTime(race100),
              race_400m_time_s: parseRaceTime(race400),
              race_800m_time_s: parseRaceTime(race800),
              race_1500m_time_s: parseRaceTime(race1500),
              race_5k_time_s: parseRaceTime(race5k),
              race_10k_time_s: parseRaceTime(race10k),
              race_hm_time_s: parseRaceTime(raceHm),
              race_marathon_time_s: parseRaceTime(raceMarathon),
              goal_race_name: goalRaceName || null,
              goal_race_date: goalRaceDate || null,
              goal_time_s: parseRaceTime(goalTime),
              notes: notes || null,
            }
          : {}),
        ...(mode === "trainer" && isAthlete
          ? {
              warmup_pace_sec_per_km: parseRaceTime(warmupPace),
              cooldown_pace_sec_per_km: parseRaceTime(cooldownPace),
              warmup_watts: warmupWatts ? Number(warmupWatts) : null,
              cooldown_watts: cooldownWatts ? Number(cooldownWatts) : null,
            }
          : {}),
      };
      const updated =
        mode === "trainer" && athleteId
          ? await updateAthleteProfile(athleteId, payload, token)
          : await updateProfile(payload, token);
      if (mode === "self") setUser(updated);
      onSaved?.(updated);
      setSaved(true);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Profil konnte nicht gespeichert werden");
    } finally {
      setSubmitting(false);
    }
  }

  // Ein Feld, das je nach `readOnly` (siehe editMode oben) entweder als
  // reiner Text (wie die bereits vorhandene "Rolle"-Anzeige) oder als
  // editierbares Eingabefeld erscheint - vermeidet, fuer jedes der rund 20
  // Formularfelder eine eigene Anzeige-/Bearbeiten-Fallunterscheidung zu
  // schreiben.
  function Field({
    label,
    value,
    onChange,
    type = "text",
    placeholder,
    min,
    step,
    required,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    type?: "text" | "number" | "date" | "email";
    placeholder?: string;
    min?: number;
    step?: string;
    required?: boolean;
  }) {
    return (
      <div>
        <label className="label">{label}</label>
        {readOnly ? (
          <p className="input flex items-center bg-mist/5 text-mist">{value || "–"}</p>
        ) : (
          <input
            type={type}
            className="input"
            placeholder={placeholder}
            min={min}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={required}
          />
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-ink">{mode === "self" ? "Mein Profil" : "Athletenprofil"}</h3>
        <button type="button" onClick={() => setEditMode((v) => !v)} className="btn-outline text-xs">
          {editMode ? "Bearbeitung beenden" : "Profil bearbeiten"}
        </button>
      </div>

      {mode === "self" && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink">Profilinformationen</h3>
          {!readOnly && (
            <div className="mb-3">
              <AvatarEditor name={user.name} value={avatar} onChange={setAvatar} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" value={name} onChange={setName} required />
            <Field label="E-Mail" type="email" value={email} onChange={setEmail} required />
            <div>
              {/* Rolle ist reine Anzeige - nur ein Admin kann sie aendern
                  (Kontenverwaltung), nicht der Account selbst, siehe
                  backend/app/schemas/user.py:UserProfileUpdate (kein
                  role-Feld dort). */}
              <label className="label">Rolle</label>
              <input className="input bg-mist/5 text-mist" value={ROLE_LABELS[user.role]} disabled readOnly />
            </div>
          </div>
        </div>
      )}

      {isAthlete && (
        <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label="Geburtsdatum" type="date" value={birthDate} onChange={setBirthDate} />
        <div>
          <label className="label">Geschlecht</label>
          {readOnly ? (
            <p className="input flex items-center bg-mist/5 text-mist">
              {GENDER_OPTIONS.find((o) => o.value === gender)?.label ?? "–"}
            </p>
          ) : (
            <select className="input" value={gender} onChange={(e) => setGender(e.target.value as Gender | "")}>
              {GENDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
        <Field label="Größe (cm)" type="number" min={0} value={heightCm} onChange={setHeightCm} />
        <Field label="Körpergewicht (kg)" type="number" min={0} step="0.1" value={weightKg} onChange={setWeightKg} />
      </div>

      <div>
        <label className="label">Wochenrhythmus</label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday}>
              <label className="mb-1 block text-xs text-mist">{weekday}</label>
              {readOnly ? (
                <p className="input flex items-center bg-mist/5 text-mist">{weekdayNotes[weekday] || "–"}</p>
              ) : (
                <input
                  type="text"
                  className="input"
                  value={weekdayNotes[weekday]}
                  onChange={(e) => setWeekdayNotes({ ...weekdayNotes, [weekday]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-ink">Wettkampfzeiten</h3>
        <p className="mb-3 text-xs text-mist">
          Aus den Wettkampfzeiten werden Schwellen-/VO2max-Pace sowie die Zonentabelle unten automatisch
          abgeleitet. Die Tempozonen selbst (inkl. manueller Überschreibung je Zone) werden in der
          Trainingsbereichtabelle (Jack Daniels) weiter unten gepflegt.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="100m-Zeit (mm:ss)" placeholder="0:12" value={race100} onChange={setRace100} />
          <Field label="400m-Zeit (mm:ss)" placeholder="0:55" value={race400} onChange={setRace400} />
          <Field label="800m-Zeit (mm:ss)" placeholder="2:15" value={race800} onChange={setRace800} />
          <Field label="1500m-Zeit (mm:ss)" placeholder="4:30" value={race1500} onChange={setRace1500} />
          <Field label="5km-Zeit (mm:ss)" placeholder="18:30" value={race5k} onChange={setRace5k} />
          <Field label="10km-Zeit (mm:ss)" placeholder="38:00" value={race10k} onChange={setRace10k} />
          <Field label="Halbmarathon-Zeit (h:mm:ss)" placeholder="1:25:00" value={raceHm} onChange={setRaceHm} />
          <Field label="Marathon-Zeit (h:mm:ss)" placeholder="3:10:00" value={raceMarathon} onChange={setRaceMarathon} />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium text-ink">Physiologische Messwerte</h3>
        <p className="mb-2 text-xs text-mist">
          Ruhe-/Maximalpuls werden für die HF-basierte Belastungsberechnung benötigt. vLT3/VLaMax/VO2max stammen
          i.d.R. aus einem Laktatstufentest, sofern vorhanden - sie ergänzen die aus den Wettkampfzeiten
          abgeleiteten Tempozonen um individuelle Diagnostikwerte.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Ruhepuls (bpm)" type="number" min={0} value={hrRest} onChange={setHrRest} />
          <Field label="Maximalpuls (bpm)" type="number" min={0} value={hrMax} onChange={setHrMax} />
          <Field label="vLT3-Pace (mm:ss/km)" placeholder="4:10" value={vlt3Pace} onChange={setVlt3Pace} />
          <Field label="VLaMax (mmol/l/s)" type="number" min={0} step="0.01" value={vlaMax} onChange={setVlaMax} />
          <Field
            label="VO2max, gemessen (ml/kg/min)"
            type="number"
            min={0}
            step="0.1"
            value={vo2maxMeasured}
            onChange={setVo2maxMeasured}
          />
          {mode === "trainer" && (
            <>
              {/* Reine Anzeige: aus den Wettkampfzeiten (800m-5000m)
                  berechnet (services/training_load.py:critical_speed_model),
                  nicht direkt editierbar. Nur fuer den Trainer sichtbar -
                  der Athlet selbst bekommt diese Werte serverseitig gar
                  nicht erst mitgeliefert (siehe schemas/user.py:UserOut vs.
                  AthleteProfileOut). */}
              <div>
                <label className="label">Critical Speed</label>
                <p className="input flex items-center bg-mist/5 text-mist">
                  {user.critical_speed_mps != null ? formatPaceValue(1000 / user.critical_speed_mps) + " min/km" : "—"}
                </p>
              </div>
              <div>
                <label className="label">D&apos; (anaerobe Kapazität)</label>
                <p className="input flex items-center bg-mist/5 text-mist">
                  {user.d_prime_m != null ? `${Math.round(user.d_prime_m)} m` : "—"}
                </p>
              </div>
              {/* Riegel-Koeffizient b aus dem Ermuedungs-Fit (3000m-Marathon,
                  siehe services/training_load.py:riegel_exponent) - bestimmt
                  indirekt den Kostenexponenten K der Pace-Kostenfunktion
                  (k_from_riegel_exponent). Ebenfalls nur fuer den Trainer
                  sichtbar, aus demselben Grund wie CS/D' oben. */}
              <div>
                <label className="label">Riegel-Koeffizient b</label>
                <p className="input flex items-center bg-mist/5 text-mist">
                  {user.riegel_b != null ? user.riegel_b.toFixed(3) : "—"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Aufwaerm-/Cooldown-Vorgaben sieht und bearbeitet nur der Trainer -
          fuer mode="self" (der Athlet selbst) bleibt der Abschnitt
          ausgeblendet, siehe auch die serverseitige Absicherung in
          backend/app/api/auth.py (UserProfileUpdate ignoriert diese Felder
          bei PUT /api/auth/me). */}
      {mode === "trainer" && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink">Aufwärmen &amp; Cooldown</h3>
          <p className="mb-2 text-xs text-mist">
            Feste Vorgaben statt der automatischen Schätzung - werden beim Anlegen neuer Einheiten als Auto-Vorschlag
            übernommen (weiterhin pro Segment überschreibbar). Leer gelassen, bleibt die bisherige Schätzung aktiv
            (Easy-Pace ± Offset beim Laufen, GA1-Wattschätzung beim Radfahren; die FTP dafür wird in der
            Wattzonentabelle weiter unten gepflegt).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Pace Aufwärmen (mm:ss/km)</label>
              <input
                type="text"
                placeholder="5:30"
                className="input"
                value={warmupPace}
                onChange={(e) => setWarmupPace(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Pace Cooldown (mm:ss/km)</label>
              <input
                type="text"
                placeholder="6:00"
                className="input"
                value={cooldownPace}
                onChange={(e) => setCooldownPace(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Watt Aufwärmen (Radfahren)</label>
              <input
                type="number"
                min={0}
                className="input"
                value={warmupWatts}
                onChange={(e) => setWarmupWatts(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Watt Cooldown (Radfahren)</label>
              <input
                type="number"
                min={0}
                className="input"
                value={cooldownWatts}
                onChange={(e) => setCooldownWatts(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium text-ink">Ziele</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Zielwettkampf" placeholder="z.B. Berlin-Marathon" value={goalRaceName} onChange={setGoalRaceName} />
          <Field label="Zieldatum" type="date" value={goalRaceDate} onChange={setGoalRaceDate} />
          <Field label="Zielzeit (h:mm:ss)" placeholder="3:30:00" value={goalTime} onChange={setGoalTime} />
        </div>
      </div>

      <div>
        <label className="label">Sonstige Anmerkungen</label>
        {readOnly ? (
          <p className="input min-h-[4.5rem] whitespace-pre-wrap bg-mist/5 text-mist">{notes || "–"}</p>
        ) : (
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </div>
        </>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-moss">Gespeichert.</p>}

      {/* Immer sichtbar (nicht nur im Bearbeiten-Modus) - die Aufwaerm-/
          Cooldown-Vorgaben oben sind fuer den Trainer auch ausserhalb von
          editMode aenderbar und brauchen unabhaengig vom allgemeinen
          Bearbeiten-Umschalter eine Speichern-Moeglichkeit. */}
      <button type="submit" disabled={submitting} className="btn-primary w-full">
        Speichern
      </button>
    </form>
  );
}
