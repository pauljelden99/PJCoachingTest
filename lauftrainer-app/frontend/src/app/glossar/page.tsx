"use client";

import { useState } from "react";

import { RouteGuard } from "@/components/RouteGuard";
import { GLOSSARY } from "@/lib/glossary";

function GlossarContent() {
  const [query, setQuery] = useState("");

  const filtered = GLOSSARY.filter((entry) =>
    `${entry.term} ${entry.definition}`.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <main className="page max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Glossar</h1>
      <input
        type="text"
        placeholder="Begriff suchen…"
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="card divide-y divide-mist/10">
        {filtered.map((entry) => (
          <div key={entry.term} className="py-3 first:pt-0 last:pb-0">
            <h2 className="text-sm font-medium text-ink">{entry.term}</h2>
            <p className="mt-1 text-sm text-mist">{entry.definition}</p>
            <a
              href={entry.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-moss transition-colors hover:underline"
            >
              Quelle: {entry.sourceLabel} ↗
            </a>
          </div>
        ))}
        {filtered.length === 0 && <p className="py-4 text-center text-sm text-mist">Kein Treffer.</p>}
      </div>
    </main>
  );
}

export default function GlossarPage() {
  return (
    <RouteGuard role={["athlete", "trainer", "admin"]}>
      <GlossarContent />
    </RouteGuard>
  );
}
