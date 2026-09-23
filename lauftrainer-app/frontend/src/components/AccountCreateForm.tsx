"use client";

import { useState } from "react";

import { ApiError } from "@/lib/api";

// Konto-Anlage-Formular fuer Athleten/Trainer - genutzt sowohl auf /admin
// (reine Admin-Accounts) als auch im Trainerprofil (siehe
// app/profile/page.tsx), da Trainer inzwischen dieselben Konten anlegen
// duerfen wie Admins (siehe backend/app/core/deps.py:require_admin).
export function AccountCreateForm({
  role,
  title,
  submitLabel,
  onSubmit,
}: {
  role: "trainer" | "athlete";
  title: string;
  submitLabel: string;
  onSubmit: (payload: {
    name: string;
    email: string;
    password: string;
    is_admin: boolean;
  }) => Promise<{ name: string; email: string }>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const created = await onSubmit({ name, email, password, is_admin: isAdmin });
      setSuccess(
        `${role === "trainer" ? "Trainer" : "Athleten"}-Konto für ${created.name} (${created.email}) angelegt.`
      );
      setName("");
      setEmail("");
      setPassword("");
      setIsAdmin(false);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : `${role === "trainer" ? "Trainer" : "Athleten"}-Konto konnte nicht angelegt werden`
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // autoComplete="off" plus die data-*ignore-Attribute an den Feldern
    // unten verhindern, dass Passwortmanager/Browser dieses Formular als
    // Login-Formular erkennen und Name/E-Mail/Passwort aus gespeicherten
    // Zugangsdaten vorausfuellen - die Felder sollen bei jedem Seitenaufruf
    // leer starten, nicht nur beim ersten Mount.
    <form onSubmit={handleSubmit} autoComplete="off" className="card max-w-sm space-y-4">
      <h2 className="text-base font-medium text-ink">{title}</h2>
      <div>
        <label className="label">Name</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          required
        />
      </div>
      <div>
        <label className="label">E-Mail</label>
        <input
          type="email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          required
        />
      </div>
      <div>
        <label className="label">Passwort</label>
        <input
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          autoComplete="new-password"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          required
        />
      </div>

      {role === "trainer" && (
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="accent-moss"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Adminrechte geben (darf selbst Trainer-/Athletenkonten anlegen)
        </label>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {success && !error && <p className="text-sm text-moss">{success}</p>}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        {submitLabel}
      </button>
    </form>
  );
}
