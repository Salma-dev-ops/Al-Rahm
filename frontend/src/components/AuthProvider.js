"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";

const AuthContext = createContext(null);

/** The signed-in user, or null. */
async function fetchMe() {
  if (!getToken()) return null;
  try {
    return await api("/me");
  } catch (err) {
    // An expired or revoked session: forget it. Network errors keep the token for a retry.
    if (err.status === 401) setToken(null);
    return null;
  }
}

/** Holds the signed-in user (or null) for the whole app. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
    setLoading(false);
    return me;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((me) => {
      if (cancelled) return;
      setUser(me);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      refresh,
      setUser,
      async login(email, password) {
        const { user: me, token } = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
        setToken(token);
        setUser(me);
        return me;
      },
      async signup(details) {
        const { user: me, token } = await api("/auth/signup", { method: "POST", body: JSON.stringify(details) });
        setToken(token);
        setUser(me);
        return me;
      },
      async logout() {
        await api("/auth/logout", { method: "POST" }).catch(() => {});
        setToken(null);
        setUser(null);
      },
    }),
    [user, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
