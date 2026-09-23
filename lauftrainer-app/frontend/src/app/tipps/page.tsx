"use client";

import { RouteGuard } from "@/components/RouteGuard";
import { RUNNING_TIPS } from "@/lib/tips";

// Statische Sammlung von Lauf-Tipps, inhaltlich vom Trainer gepflegt (siehe
// lib/tips.ts) - anders als Glossar (app/glossar/page.tsx) bewusst ohne
// Suchfeld, da die Liste voraussichtlich ueberschaubar bleibt.
function TippsContent() {
  return (
    <main className="page max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Tipps &amp; Tricks</h1>

      {RUNNING_TIPS.length === 0 ? (
        <p className="text-sm text-mist">Hier stehen bald Tipps &amp; Tricks rund ums Laufen.</p>
      ) : (
        <div className="card divide-y divide-mist/10">
          {RUNNING_TIPS.map((tip) => (
            <div key={tip.title} className="py-3 first:pt-0 last:pb-0">
              <h2 className="text-sm font-medium text-ink">{tip.title}</h2>
              <p className="mt-1 text-sm text-mist">{tip.body}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default function TippsPage() {
  return (
    <RouteGuard role={["athlete", "trainer"]}>
      <TippsContent />
    </RouteGuard>
  );
}
