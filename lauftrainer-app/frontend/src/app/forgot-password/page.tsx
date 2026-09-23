"use client";

import Link from "next/link";
import { useState } from "react";

import { requestPasswordReset } from "@/lib/api";

// Absichtlich keine Fehlermeldung bei unbekannter E-Mail (siehe
// backend/app/api/auth.py:forgot_password) - sonst liesse sich darueber
// ausspaehen, welche E-Mails registriert sind. Der Erfolgstext ist daher
// immer derselbe, unabhaengig davon, ob ein Konto existiert.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
    } finally {
      setSubmitting(false);
      setDone(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-[85vh] max-w-sm flex-col justify-center p-6">
      <div className="card">
        <h1 className="mb-1 text-xl font-medium text-ink">Passwort vergessen</h1>
        <p className="mb-6 text-sm text-mist">
          Gib deine E-Mail-Adresse ein - wir schicken dir einen Link zum Zurücksetzen des Passworts.
        </p>

        {done ? (
          <p className="text-sm text-moss">
            Falls ein Konto mit dieser E-Mail existiert, haben wir dir einen Link zum Zurücksetzen geschickt.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">E-Mail</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              Link anfordern
            </button>
          </form>
        )}

        <p className="mt-4 text-sm text-mist">
          <Link href="/login" className="text-moss transition-colors hover:underline">
            Zurück zum Login
          </Link>
        </p>
      </div>
    </main>
  );
}
