import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, type Api, type AuthUser } from "../api/Api";
import { trackApi } from "../lib/busy";
import { Busy } from "../components/Busy";

interface Ctx {
  api: Api;
  user: AuthUser | null;
  toast: (msg: string) => void;
  /** Runs an async action and shows its error as a toast. Returns undefined on failure. */
  run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | undefined>;
}
const C = createContext<Ctx>(null as unknown as Ctx);
export const useApi = () => useContext(C);

export const errMsg = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? (/fetch|network/i.test(e.message) ? "Can't reach the server. Check your connection." : e.message) : "Something went wrong.";

export function ApiProvider({ api: raw, children }: { api: Api; children: ReactNode }) {
  const api = useMemo(() => trackApi(raw), [raw]); // admin writes show the loader
  const [user, setUser] = useState<AuthUser | null>(api.user());
  const [msg, setMsg] = useState("");
  const t = useRef<number>();
  useEffect(() => {
    setUser(api.user());
    return api.onAuth(setUser);
  }, [api]);
  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(""), 3600);
  }, []);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, ok?: string) => {
      try {
        const r = await fn();
        if (ok) toast(ok);
        return r;
      } catch (e) {
        toast(errMsg(e));
        return undefined;
      }
    },
    [toast],
  );
  return (
    <C.Provider value={{ api, user, toast, run }}>
      {children}
      <Busy />
      <div className={`toast ${msg ? "on" : ""}`} role="status" aria-live="polite">
        {msg}
      </div>
    </C.Provider>
  );
}
