"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, deleteAccount } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function DeleteAccountForm() {
  const { token, logout } = useAuth();
  const router = useRouter();

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!window.confirm("Konto wirklich endgültig löschen? Diese Aktion kann nicht rückgängig gemacht werden.")) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await deleteAccount({ password }, token);
      logout();
      router.replace("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Konto konnte nicht gelöscht werden");
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <div className="card space-y-3 border border-danger/30">
        <h2 className="text-base font-medium text-ink">Konto löschen</h2>
        <p className="text-xs text-mist">
          Das Löschen des Kontos ist unwiderruflich und entfernt alle zugehörigen Aktivitäten, Trainingspläne und
          Wearable-Verbindungen.
        </p>
        <button type="button" onClick={() => setConfirming(true)} className="btn-outline-danger">
          Konto löschen
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4 border border-danger/30">
      <h2 className="text-base font-medium text-ink">Konto wirklich löschen?</h2>
      <p className="text-xs text-mist">
        Bitte bestätige mit deinem Passwort. Diese Aktion kann nicht rückgängig gemacht werden.
      </p>
      <div>
        <label className="label">Passwort</label>
        <input
          type="password"
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={submitting} className="btn bg-danger text-paper shadow-sm hover:brightness-110">
          Konto endgültig löschen
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setPassword("");
            setError(null);
          }}
          className="text-sm text-mist transition-colors hover:text-ink"
        >
          Abbrechen
        </button>
      </div>
    </form>
  );
}
