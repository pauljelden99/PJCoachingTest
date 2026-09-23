"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { ApiError, confirmPasswordReset } from "@/lib/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Passwort konnte nicht zurückgesetzt werden");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[85vh] max-w-sm flex-col justify-center p-6">
      <div className="card">
        <h1 className="mb-1 text-xl font-medium text-ink">Neues Passwort vergeben</h1>

        {!token ? (
          <p className="text-sm text-danger">
            Dieser Link ist unvollständig. Bitte fordere einen neuen Reset-Link an.
          </p>
        ) : done ? (
          <>
            <p className="mb-4 text-sm text-moss">Dein Passwort wurde geändert.</p>
            <button type="button" onClick={() => router.push("/login")} className="btn-primary w-full">
              Zum Login
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Neues Passwort</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={submitting} className="btn-primary w-full">
              Passwort speichern
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="p-6 text-mist">Lädt...</main>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
