"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.role === "admin") router.replace("/admin");
    else router.replace("/training-plan");
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Etwas ist schiefgelaufen");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[85vh] max-w-sm flex-col justify-center p-6">
      <div className="mb-8 flex flex-col items-center gap-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-moss shadow-lg shadow-moss/30">
          <span className="h-3 w-3 rounded-full bg-paper" />
        </span>
        <h1 className="text-lg font-semibold tracking-tight text-ink">Lauftrainer</h1>
        <p className="text-sm text-mist">Trainingspläne, Protokolle und Belastungsanalyse</p>
      </div>

      <div className="card">
        <h2 className="mb-1 text-xl font-medium text-ink">Anmelden</h2>
        <p className="mb-6 text-sm text-mist">Schön, dich wiederzusehen.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">E-Mail</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              required
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            Anmelden
          </button>
        </form>

        <p className="mt-4 text-sm text-mist">
          <Link href="/forgot-password" className="text-moss transition-colors hover:underline">
            Passwort vergessen?
          </Link>
        </p>
        <p className="mt-2 text-sm text-mist">Konten werden ausschließlich vom Admin angelegt.</p>
      </div>
    </main>
  );
}
