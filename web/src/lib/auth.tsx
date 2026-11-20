"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, clearTokens, hasToken, saveTokens } from "./api";
import type { TokenResponse, User } from "./types";

type AuthState = {
  user: User | null;
  ready: boolean;
  signIn: (t: TokenResponse) => void;
  signOut: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const refreshUser = useCallback(async () => {
    if (!hasToken()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>("/auth/me/"));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const me = hasToken() ? await api<User>("/auth/me/").catch(() => null) : null;
      if (alive) {
        setUser(me);
        setReady(true);
      }
    })();
    const onLogout = () => setUser(null);
    window.addEventListener("careslot:logout", onLogout);
    return () => {
      alive = false;
      window.removeEventListener("careslot:logout", onLogout);
    };
  }, []);

  const signIn = useCallback(
    (t: TokenResponse) => {
      saveTokens(t.access, t.refresh);
      setUser(t.user);
      qc.invalidateQueries();
    },
    [qc],
  );

  const signOut = useCallback(() => {
    clearTokens();
    setUser(null);
    qc.clear();
  }, [qc]);

  const value = useMemo(() => ({ user, ready, signIn, signOut, refreshUser }), [user, ready, signIn, signOut, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
