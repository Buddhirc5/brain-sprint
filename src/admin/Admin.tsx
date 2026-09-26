/* Company admin portal shell: tabs (shown per role), exports, sign-out. */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useApp } from "../app/ctx";
import { useApi } from "../app/ApiCtx";
import { Icon } from "../components/ui";
import { toCSV, onIdle } from "../lib/security";
import { watermark } from "../lib/reports";
import { nav } from "../app/router";
import type { Role } from "../types";
import { Dashboard } from "./Dashboard";
import { Quizzes, Editor } from "./Quizzes";
import { Users } from "./Users";
import { ResultsAdmin } from "./ResultsAdmin";
import { Rewards } from "./Rewards";
import { Security } from "./Security";
import { Settings } from "./Settings";
import { Team } from "./Team";
import { Brand } from "./Brand";
import { useLiveTenant } from "./common";
import { applyBranding, setTitle } from "../app/theme";
import { LiveTab } from "../live/LiveTab";
import { PollsTab } from "../polls/PollsTab";

export type ATab = "dash" | "games" | "edit" | "live" | "polls" | "users" | "results" | "rewards" | "security" | "team" | "brand" | "settings";

interface ACtx {
  tab: ATab;
  setTab: (t: ATab, param?: string) => void;
  param: string | undefined;
  exportCSV: (file: string, what: string, rows: (string | number)[][]) => void;
}
const AC = createContext<ACtx>(null as unknown as ACtx);
export const useAdmin = () => useContext(AC);

/** Tab → minimum role to see it, and the feature it needs (if any). */
const TABS: { k: ATab; label: string; min: Role; feature?: "live" | "polls" | "rewards" }[] = [
  { k: "dash", label: "Dashboard", min: "viewer" },
  { k: "games", label: "Quizzes", min: "editor" },
  { k: "live", label: "Live quiz", min: "host", feature: "live" },
  { k: "polls", label: "Polls", min: "host", feature: "polls" },
  { k: "users", label: "Players", min: "admin" },
  { k: "results", label: "Results", min: "viewer" },
  { k: "rewards", label: "Rewards", min: "admin", feature: "rewards" },
  { k: "security", label: "Security", min: "admin" },
  { k: "team", label: "Admins", min: "admin" },
  { k: "brand", label: "Branding", min: "admin" },
  { k: "settings", label: "Settings", min: "admin" },
];

const TAB_KEYS = new Set<string>(TABS.map((t) => t.k).concat("edit"));

export function Admin({ tab: routeTab }: { tab?: string }) {
  const { d, can, role, slug, pub, api, approve, features, tid } = useApp();
  const { user, toast } = useApi();
  // brand edits (here or by a super admin) re-theme the portal without a reload
  const { branding } = useLiveTenant();
  const brandKey = JSON.stringify(branding);
  useEffect(() => {
    applyBranding(branding);
    setTitle(`${branding.productName} · Admin`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandKey]);
  const visible = TABS.filter((t) => can(t.min) && (!t.feature || features[t.feature]));
  const first = visible[0]?.k || "dash";
  const [tab, setTabRaw] = useState<ATab>(routeTab && TAB_KEYS.has(routeTab) ? (routeTab as ATab) : first);
  const [param, setParam] = useState<string>();

  const setTab = useCallback(
    (t: ATab, p?: string) => {
      setTabRaw(t);
      setParam(p);
      if (t !== "edit") nav({ r: "admin", slug, tab: t }, true);
      window.scrollTo(0, 0);
    },
    [slug],
  );
  useEffect(() => {
    if (routeTab && TAB_KEYS.has(routeTab) && routeTab !== tab && tab !== "edit") setTabRaw(routeTab as ATab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeTab]);

  // company setting: sign out after N idle minutes
  useEffect(() => {
    if (!d.loaded) return;
    return onIdle(d.cfg.adminIdleMin * 60_000, () => {
      void api.audit(tid, { action: "Admin signed out (idle)", detail: `${d.cfg.adminIdleMin} min` });
      void api.signOut();
      toast(`Signed out after ${d.cfg.adminIdleMin} minutes without activity.`);
    });
  }, [d.loaded, d.cfg.adminIdleMin, api, tid, toast]);

  const exportCSV = useCallback(
    (file: string, what: string, rows: (string | number)[][]) => {
      approve({
        label: `Export ${what}. Exports contain staff data — keep the file inside ${pub.name}.`,
        yes: "Export",
        run: async () => {
          const who = user?.email || "admin";
          api.download(file, "﻿" + toCSV(watermark(rows, who, pub.name)));
          await api.audit(tid, { action: "Exported data", target: what, detail: `${rows.length} rows · ${file}${d.cfg.exportMask ? " · IDs masked" : ""}` });
        },
      });
    },
    [approve, api, user, tid, pub.name, d.cfg.exportMask],
  );

  const cur: ATab = tab === "edit" ? "games" : tab;
  const allowed = tab === "edit" ? can("editor") : visible.some((t) => t.k === tab);

  return (
    <AC.Provider value={{ tab, setTab, param, exportCSV }}>
      <div className="adm">
        <nav className="adm-nav" aria-label="Admin">
          <div className="adm-brand">
            {branding.logo && <img src={branding.logo} alt="" className="adm-logo" />}
            <span className="adm-name">{branding.productName}</span>
          </div>
          <div className="adm-tabs">
            {visible.map((t) => (
              <button key={t.k} className={cur === t.k ? "on" : ""} onClick={() => setTab(t.k)}>
                {t.label}
              </button>
            ))}
          </div>
          <span className="sess" title={user?.email}>
            <span className="dot" />
            {role}
          </span>
          <button className="icon-btn" aria-label="Full screen" title="Full screen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
            <Icon.full />
          </button>
          <a className="btn lime small" href={`#/t/${slug}`}>
            Player view
          </a>
          <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={() => void api.signOut()}>
            <Icon.logout />
          </button>
        </nav>
        {!d.loaded ? (
          <div className="card">Loading {pub.name}…</div>
        ) : !allowed ? (
          <div className="card">Your role ({role}) can't open this page.</div>
        ) : (
          <>
            {tab === "dash" && <Dashboard />}
            {tab === "games" && <Quizzes />}
            {tab === "edit" && <Editor gid={param} />}
            {tab === "live" && <LiveTab />}
            {tab === "polls" && <PollsTab />}
            {tab === "users" && <Users />}
            {tab === "results" && <ResultsAdmin />}
            {tab === "rewards" && <Rewards />}
            {tab === "security" && <Security />}
            {tab === "team" && <Team />}
            {tab === "brand" && <Brand />}
            {tab === "settings" && <Settings />}
          </>
        )}
      </div>
    </AC.Provider>
  );
}
