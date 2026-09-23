"use client";

import { createContext, useContext, useEffect, useState } from "react";

import * as api from "@/lib/api";
import type { AuthResponse, User } from "@/types/training";

const TOKEN_STORAGE_KEY = "lt_token";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResponse>;
  logout: () => void;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!stored) {
      setLoading(false);
      return;
    }
    api
      .getMe(stored)
      .then((me) => {
        setToken(stored);
        setUser(me);
      })
      .catch(() => {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  function applyAuth(response: { access_token: string; user: User }) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
    setToken(response.access_token);
    setUser(response.user);
  }

  async function login(email: string, password: string) {
    const response = await api.login(email, password);
    applyAuth(response);
    return response;
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth muss innerhalb von <AuthProvider> verwendet werden");
  }
  return ctx;
}
