"use client";

import { useState } from "react";

import { ActivityCard, SOURCE_LABEL } from "@/components/ActivityCard";
import { ActivityEditForm } from "@/components/ActivityEditForm";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ApiError, deleteActivity } from "@/lib/api";
import { exportActivitiesPdf } from "@/lib/activityPdf";
import { useAuth } from "@/lib/auth-context";
import { formatDateDMY, groupByDay, shortWeekdayLabel } from "@/lib/plan";
import type { SegmentZoneInput } from "@/lib/paceZones";
import type { WattZoneInput } from "@/lib/wattZones";
import type { Activity } from "@/types/training";

// Bearbeiten ist bewusst sowohl dem Trainer als auch dem Athleten selbst
// erlaubt (siehe backend/app/api/activities.py:update_activity) - die
// Zugriffspruefung passiert serverseitig, hier reicht ein `onChanged`,
// damit die aufrufende Seite (Dashboard/Trainingsplan) neu laedt.
export function ActivityList({
  activities,
  onChanged,
  subjectName,
  athleteZones = null,
  athleteWattZones = null,
}: {
  activities: Activity[];
  onChanged?: () => void;
  subjectName?: string;
  athleteZones?: SegmentZoneInput | null;
  athleteWattZones?: WattZoneInput | null;
}) {
  const { token } = useAuth();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Activity | null>(null);
  // Aufklapp-Zustand pro Tag statt pro Aktivitaet, da mehrere Aktivitaeten
  // eines Tages gemeinsam in einem Kasten stecken (siehe groupByDay) und
  // mit ihm gemeinsam auf- und zugeklappt werden.
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  function toggleDay(day: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function handleDelete(a: Activity) {
    if (!token) return;
    setDeletingId(a.id);
    setError(null);
    try {
      await deleteActivity(a.id, token);
      if (editingId === a.id) setEditingId(null);
      onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Aktivität konnte nicht gelöscht werden");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-medium text-ink">Letzte Aktivitäten</h2>
        {activities.length > 0 && (
          <button
            type="button"
            // exportActivitiesPdf laedt jsPDF erst beim Klick nach (siehe
            // lib/activityPdf.ts) und ist daher asynchron - ein
            // fehlgeschlagener Nachladeversuch (z.B. Verbindungsabbruch)
            // soll sichtbar werden statt als unbehandelte Promise zu enden.
            onClick={() => {
              setError(null);
              exportActivitiesPdf(activities, subjectName).catch(() => setError("PDF-Export konnte nicht geladen werden"));
            }}
            className="text-xs text-moss transition-colors hover:underline"
          >
            Als PDF exportieren
          </button>
        )}
      </div>
      {error && editingId === null && <p className="mb-3 text-sm text-danger">{error}</p>}
      {activities.length === 0 ? (
        <p className="py-4 text-center text-sm text-mist">Noch keine Aktivitäten.</p>
      ) : (
        <div className="space-y-2">
          {groupByDay(activities).map((group) => {
            const expanded = expandedDays.has(group.day);
            const dayKm = group.items.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 1000;
            return (
              <div key={group.day} className="rounded-xl border border-mist/15 bg-paper p-3">
                <button
                  type="button"
                  onClick={() => toggleDay(group.day)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="shrink-0 text-xs text-mist">
                      {shortWeekdayLabel(group.day)} {formatDateDMY(group.day)}
                    </span>
                    <span className="truncate text-sm font-medium text-ink">
                      {group.items.map((a) => a.title || SOURCE_LABEL[a.source] || a.source).join(" · ")}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 text-xs text-mist">
                    {dayKm > 0 && <span>{dayKm.toFixed(1)} km</span>}
                    <span>{expanded ? "▲" : "▼"}</span>
                  </div>
                </button>

                {expanded && (
                  <div className="mt-2 space-y-2 border-t border-mist/10 pt-2">
                    {group.items.map((a) =>
                      editingId === a.id ? (
                        <ActivityEditForm
                          key={a.id}
                          activity={a}
                          athleteZones={athleteZones}
                          athleteWattZones={athleteWattZones}
                          onSaved={() => {
                            setEditingId(null);
                            onChanged?.();
                          }}
                          onCancel={() => setEditingId(null)}
                        />
                      ) : (
                        <ActivityCard
                          key={a.id}
                          activity={a}
                          onEdit={onChanged ? () => setEditingId(a.id) : undefined}
                          onDelete={onChanged ? () => setPendingDelete(a) : undefined}
                          deleting={deletingId === a.id}
                        />
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        message={
          pendingDelete
            ? `${pendingDelete.title || SOURCE_LABEL[pendingDelete.source] || pendingDelete.source} vom ${formatDateDMY(pendingDelete.day)} wirklich unwiderruflich löschen?`
            : ""
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const a = pendingDelete;
          setPendingDelete(null);
          if (a) handleDelete(a);
        }}
      />
    </div>
  );
}
