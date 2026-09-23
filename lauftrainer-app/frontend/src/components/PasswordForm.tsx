"use client";

import { useState } from "react";

import { ApiError, changePassword } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export function PasswordForm() {
  const { token } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setSaved(false);

    if (newPassword !== confirmPassword) {
      setError("Die neuen Passwörter stimmen nicht überein");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ current_password: currentPassword, new_password: newPassword }, token);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Passwort konnte nicht geändert werden");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-4">
      <h2 className="text-base font-medium text-ink">Passwort ändern</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Aktuelles Passwort</label>
          <input
            type="password"
            className="input"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label">Neues Passwort</label>
          <input
            type="password"
            className="input"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div>
          <label className="label">Neues Passwort bestätigen</label>
          <input
            type="password"
            className="input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && !error && <p className="text-sm text-moss">Passwort geändert.</p>}

      <button type="submit" disabled={submitting} className="btn-primary w-full">
        Passwort ändern
      </button>
    </form>
  );
}
