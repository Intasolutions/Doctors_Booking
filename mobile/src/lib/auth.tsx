import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, clearTokens, hasToken, onSignedOut, saveTokens } from "./api";
import type { TokenResponse, User } from "./types";

type AuthState = {
  user: User | null;
  ready: boolean;
  signIn: (t: TokenResponse) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    let alive = true;
    (async () => {
      const me = (await hasToken()) ? await api<User>("/auth/me/").catch(() => null) : null;
      if (alive) {
        setUser(me);
        setReady(true);
      }
    })();
    const off = onSignedOut(() => setUser(null));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const signIn = useCallback(
    async (t: TokenResponse) => {
      await saveTokens(t.access, t.refresh);
      setUser(t.user);
      qc.invalidateQueries();
    },
    [qc],
  );

  const signOut = useCallback(async () => {
    await clearTokens();
    setUser(null);
    qc.clear();
  }, [qc]);

  const refreshUser = useCallback(async () => {
    setUser(await api<User>("/auth/me/").catch(() => null));
  }, []);

  const value = useMemo(() => ({ user, ready, signIn, signOut, refreshUser }), [user, ready, signIn, signOut, refreshUser]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
