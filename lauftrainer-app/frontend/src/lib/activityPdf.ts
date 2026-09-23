import type jsPDFType from "jspdf";

import { formatDuration } from "@/lib/format";
import { formatDateDMY, formatSegment, isNotableMethod, shortWeekdayLabel } from "@/lib/plan";
import type { Activity } from "@/types/training";

const SOURCE_LABEL: Record<string, string> = {
  strava: "Strava",
  manual: "Manuell",
};

// Durchschnittspace "mm:ss/km" aus Distanz+Dauer - identisch zur Ableitung,
// die sonst ueber PlanSessionFields/SegmentEditor laeuft, hier direkt auf
// Basis der protokollierten Gesamtwerte, da fuer den PDF-Export keine
// Segment-/Zonenaufschluesselung noetig ist.
function averagePace(distanceM: number | null, durationS: number): string | null {
  if (!distanceM || distanceM <= 0) return null;
  const secPerKm = durationS / (distanceM / 1000);
  const minutes = Math.floor(secPerKm / 60);
  const seconds = Math.round(secPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}/km`;
}

function activityDetails(activity: Activity): string {
  const parts: string[] = [];
  if (activity.description) parts.push(activity.description);
  for (const segment of activity.segments) parts.push(`• ${formatSegment(segment)}`);
  return parts.join("\n") || "–";
}

// PDF-Export des Trainingsprotokolls, clientseitig via jsPDF/autoTable
// (kein Server-Roundtrip noetig, die Aktivitaeten sind ohnehin schon
// geladen) - aus ActivityList.tsx herausgeloest, damit sowohl die
// klassische Aktivitaetenliste als auch die Tageszeilen-Ansicht
// (PlanProtokollDayRows, siehe app/training-plan/page.tsx) denselben
// Export anbieten koennen.
//
// Zeigt je Einheit alle relevanten Details (Zone/Typ, Distanz, Dauer,
// Pace, Puls, Last, Notiz, Segmente) statt nur der vier Kernwerte, damit
// das Protokoll auch ohne die App nachvollziehbar ist - inkl.
// zusammenfassender Fusszeile (Gesamtkilometer/-dauer/-last) und
// Seitenzahlen fuer laengere Zeitraeume.
export async function exportActivitiesPdf(activities: Activity[], subjectName?: string) {
  // jsPDF + autoTable werden erst beim Klick nachgeladen (dynamisches
  // import()) statt im Seiten-Bundle mitgeliefert: zusammen sind die beiden
  // Bibliotheken groesser als der gesamte uebrige Seitencode, werden aber
  // nur fuer diesen einen Export gebraucht. Dashboard und Plan-/Protokoll-
  // Seite laden dadurch deutlich weniger JavaScript, bevor ueberhaupt etwas
  // angezeigt wird. Webpack legt beide in einen eigenen Chunk.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const title = subjectName ? `Trainingsprotokoll – ${subjectName}` : "Trainingsprotokoll";

  const sorted = [...activities].sort((a, b) => a.day.localeCompare(b.day));

  doc.setFontSize(16);
  doc.setTextColor(31, 39, 35);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Erstellt am ${new Date().toLocaleDateString("de-DE")}`, 14, 24);
  if (sorted.length > 0) {
    doc.text(`Zeitraum: ${formatDateDMY(sorted[0].day)} – ${formatDateDMY(sorted[sorted.length - 1].day)}`, 14, 29);
  }

  autoTable(doc, {
    startY: 34,
    head: [["Datum", "Einheit", "Typ", "Distanz", "Dauer", "Ø Pace", "Ø Puls", "Last", "Details"]],
    body: sorted.map((a) => [
      `${shortWeekdayLabel(a.day)} ${formatDateDMY(a.day)}`,
      a.title || SOURCE_LABEL[a.source] || a.source,
      a.target_zone ? `${a.target_zone}${isNotableMethod(a.target_zone, a.method) ? ` (${a.method})` : ""}` : "–",
      a.distance_m != null ? `${(a.distance_m / 1000).toFixed(1)} km` : "–",
      formatDuration(a.duration_s),
      averagePace(a.distance_m, a.duration_s) ?? "–",
      a.avg_hr != null ? `${Math.round(a.avg_hr)} bpm` : "–",
      Math.round(a.daily_load).toString(),
      activityDetails(a),
    ]),
    headStyles: { fillColor: [76, 128, 92], fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 2, valign: "top", overflow: "linebreak" },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 24 },
      2: { cellWidth: 18 },
      3: { cellWidth: 16 },
      4: { cellWidth: 16 },
      5: { cellWidth: 16 },
      6: { cellWidth: 16 },
      7: { cellWidth: 12 },
      8: { cellWidth: "auto" },
    },
    alternateRowStyles: { fillColor: [245, 247, 245] },
    didDrawPage: () => {
      const pageCount = doc.internal.pages.length - 1;
      const pageNumber = (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } })
        .getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Seite ${pageNumber} von ${pageCount}`, pageWidth - 14, doc.internal.pageSize.getHeight() - 10, {
        align: "right",
      });
    },
  });

  const totalKm = sorted.reduce((sum, a) => sum + (a.distance_m ?? 0), 0) / 1000;
  const totalDurationS = sorted.reduce((sum, a) => sum + a.duration_s, 0);
  const totalLoad = sorted.reduce((sum, a) => sum + a.daily_load, 0);

  const finalY: number = (doc as jsPDFType & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  doc.setFontSize(9);
  doc.setTextColor(31, 39, 35);
  doc.text(
    `Gesamt: ${sorted.length} Einheiten · ${totalKm.toFixed(1)} km · ${formatDuration(totalDurationS)} · Last ${Math.round(totalLoad)}`,
    14,
    finalY + 8
  );

  const fileNameSuffix = subjectName ? `-${subjectName.trim().replace(/\s+/g, "_")}` : "";
  doc.save(`trainingsprotokoll${fileNameSuffix}.pdf`);
}
