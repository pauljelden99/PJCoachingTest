"use client";

import { computeBakkenZones } from "@/lib/bakkenZones";
import type { User } from "@/types/training";

export function BakkenZoneTable({ user }: { user: User }) {
  const rows = computeBakkenZones(user);

  return (
    <div className="card">
      <h2 className="text-base font-medium text-ink">Schwellenintervall-Tempo (Bakken)</h2>
      <p className="mt-1 text-xs text-mist">
        Tempobereiche für Schwellenintervalle nach Intervalldauer, gestaffelt um die Schwellenpace herum ("Golden
        Zone"-Ansatz): kürzere Wiederholungen laufen nahe an der Schwellenpace, längere zunehmend langsamer. Bakken,
        M.: VDOT-Rechner,{" "}
        <a
          href="https://mariusbakken.com/vdot.html"
          target="_blank"
          rel="noopener noreferrer"
          className="link-action"
        >
          mariusbakken.com/vdot.html
        </a>
        .
      </p>

      {!rows ? (
        <p className="mt-3 text-xs text-mist">
          Noch keine Wettkampfzeit hinterlegt - trage oben mindestens eine Distanz ein, um die Schwellenpace zu
          berechnen.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-mist">
                <th className="py-2 font-normal">Intervalldauer</th>
                <th className="py-2 font-normal">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.duration} className="border-t border-mist/10 transition-colors hover:bg-mist/5">
                  <td className="py-2 text-ink">{row.duration}</td>
                  <td className="py-2">{row.pace}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
