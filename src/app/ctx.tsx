/* Company (tenant) context: public brand info, live data, the signed-in player,
   the admin's role, and helpers shared by the player app and the admin portal. */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Api, TenantData } from "../api/Api";
import { normalizeCfg } from "../api/engine";
import type { Features, Labels, OrgConfig, Player, Role, Tenant, TenantPublic } from "../types";
import { statsOf, type Stats } from "../lib/scoring";
import { Modal } from "../components/ui";
import { useApi, errMsg } from "./ApiCtx";
import { LS, randHex } from "../lib/util";

export type PView =
  | { v: "welcome" }
  | { v: "setup"; editing?: boolean }
  | { v: "lobby" }
  | { v: "play"; gid: string }
  | { v: "results"; gid: string; fresh?: boolean }
  | { v: "board" }
  | { v: "store" }
  | { v: "guide" }
  | { v: "login" }
  | { v: "email" }
  | { v: "certs" };

export interface ConfirmReq {
  label: string;
  yes?: string;
  danger?: boolean;
  run: () => void | Promise<void>;
}

export interface Data extends Omit<TenantData, "tenant"> {
  tenant: Tenant | null; // live copy (brand/labels edits show without a reload); null until loaded
  cfg: OrgConfig;
  loaded: boolean;
}

interface Ctx {
  api: Api;
  pub: TenantPublic;
  tid: string;
  slug: string;
  labels: Labels;
  features: Features;
  d: Data;
  me: Player | undefined;
  players: Player[];
  stats: Record<string, Stats>;
  view: PView;
  go: (v: PView) => void;
  toast: (msg: string) => void;
  run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | undefined>;
  /** Confirmation dialog for destructive or sensitive actions. */
  approve: (req: ConfirmReq) => void;
  /* identity */
  role: Role | null; // admin role in this company (admin portal only)
  can: (min: Role) => boolean;
  superUser: boolean; // a super admin: can approve their own changes (maker-checker)
  area: "player" | "admin";
  setMe: (p: Player | null) => void;
  signOut: (msg?: string) => Promise<void>;
  refresh: () => void;
  download: (filename: string, text: string, mime?: string) => void;
}

const C = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(C);
const RANK: Record<Role, number> = { viewer: 0, host: 1, editor: 2, admin: 3, owner: 4 };

function emptyData(pub: TenantPublic): Data {
  return {
    tenant: null,
    cfg: normalizeCfg({ ...pub.pubCfg, features: pub.features, signIn: pub.signIn }, pub.template),
    games: {}, players: {}, gifts: {}, dq: { runs: {} }, keys: {}, roster: null, audit: [], admins: [], polls: {}, live: [], loaded: false,
  };
}

export function TenantProvider({ pub, area, role, superUser = false, children }: { pub: TenantPublic; area: "player" | "admin"; role: Role | null; superUser?: boolean; children: ReactNode }) {
  const { api, toast, run } = useApi();
  const [d, setD] = useState<Data>(() => emptyData(pub));
  const [meUid, setMeUid] = useState<string | null>(null);
  const [meCard, setMeCard] = useState<Player | null>(null);
  const meRef = useRef<string | null>(null);
  const [checked, setChecked] = useState(area === "admin");
  const [view, setView] = useState<PView>({ v: "lobby" });
  const [confirm, setConfirm] = useState<ConfirmReq | null>(null);
  const tid = pub.id;

  // who am I in this company (players)?
  useEffect(() => {
    if (area !== "player") return;
    let live = true;
    const check = () =>
      api.myPlayer(tid).then(
        (p) => {
          if (!live) return;
          if (meRef.current && !p) toast("You were signed in on another device, or an admin signed you out.");
          meRef.current = p?.uid || null;
          setMeUid(p?.uid || null);
          setMeCard(p);
          setChecked(true);
        },
        () => live && setChecked(true),
      );
    check();
    // one device at a time: re-check every 20 s and whenever the tab comes back
    const t = setInterval(check, 20_000);
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    const un = api.onAuth(() => check());
    return () => {
      live = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      un();
    };
  }, [api, tid, area, toast]);

  // live data once there's someone to show it to
  const canWatch = area === "admin" ? !!role : !!meUid;
  useEffect(() => {
    if (!canWatch) {
      setD(emptyData(pub));
      return;
    }
    return api.watchTenant(
      tid,
      (td) => setD({ ...td, cfg: td.tenant.cfg, loaded: true }),
      (e) => toast(errMsg(e)),
    );
  }, [api, tid, canWatch, pub, toast]);

  const players = useMemo(() => Object.values(d.players), [d.players]);
  const stats = useMemo(() => Object.fromEntries(players.map((p) => [p.uid, statsOf(p, d.dq)])), [players, d.dq]);
  const me = meUid ? d.players[meUid] || (meCard ?? undefined) : undefined;

  const go = useCallback((v: PView) => {
    setView(v);
    window.scrollTo(0, 0);
  }, []);
  const approve = useCallback((req: ConfirmReq) => setConfirm(req), []);
  const can = useCallback((min: Role) => !!role && RANK[role] >= RANK[min], [role]);
  const setMe = useCallback((p: Player | null) => {
    meRef.current = p?.uid || null;
    setMeUid(p?.uid || null);
    setMeCard(p);
  }, []);
  const signOut = useCallback(
    async (msg?: string) => {
      await api.signOut().catch(() => undefined);
      meRef.current = null;
      setMeUid(null);
      setMeCard(null);
      setView({ v: "welcome" });
      if (msg) toast(msg);
    },
    [api, toast],
  );
  const refresh = useCallback(() => api.refresh(tid), [api, tid]);
  const download = useCallback((f: string, t: string, m?: string) => api.download(f, t, m), [api]);

  // keep brand, labels and sign-in settings current when an admin edits them
  const livePub: TenantPublic = useMemo(
    () => (d.tenant ? { ...pub, name: d.tenant.name, branding: d.tenant.branding, labels: d.tenant.labels, features: d.cfg.features, signIn: d.cfg.signIn } : pub),
    [pub, d.tenant, d.cfg],
  );
  const value: Ctx = {
    api, pub: livePub, tid, slug: pub.slug, labels: livePub.labels, features: d.loaded ? d.cfg.features : pub.features, d, me, players, stats, view, go, toast, run, approve,
    role, can, superUser, area, setMe, signOut, refresh, download,
  };
  if (!checked) return null;
  return (
    <C.Provider value={value}>
      {children}
      {confirm && <ConfirmModal req={confirm} onDone={() => setConfirm(null)} />}
    </C.Provider>
  );
}

function ConfirmModal({ req, onDone }: { req: ConfirmReq; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useApi();
  const go = async () => {
    setBusy(true);
    try {
      await req.run();
      onDone();
    } catch (e) {
      toast(errMsg(e));
      setBusy(false);
    }
  };
  return (
    <Modal label="Please confirm" onClose={onDone}>
      <div className="stack">
        <h3>Are you sure?</h3>
        <p>{req.label}</p>
        <div className="row end">
          <button type="button" className="btn ghost small" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className={`btn ${req.danger ? "orange" : "primary"} small`} data-autofocus disabled={busy} onClick={go}>
            {busy ? "Working…" : req.yes || "Confirm"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** "Chrome on Windows · 3fa1" — a readable label plus a random id for this browser. */
export function deviceLabel(): string {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const o = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "device";
  let id = LS.get("bs.dev");
  if (!id) {
    id = randHex(2);
    LS.set("bs.dev", id);
  }
  return `${b} on ${o} · ${id}`;
}

/** Hook for components that just need a ref to stay mounted (avoids setState after unmount). */
export function useMounted() {
  const m = useRef(true);
  useEffect(() => () => void (m.current = false), []);
  return m;
}
