import type { Game, Labels, OrgConfig, Player, Run, UnitType } from "../types";
import { runKey } from "../types";
import { maskId, publicName } from "../lib/security";
import { Chibi } from "../components/Chibi";
import { Icon } from "../components/ui";
import { useApp } from "../app/ctx";

/** How other players see someone (privacy settings applied). */
export function pubName(p: Player | undefined, cfg: OrgConfig) {
  if (!p) return "Former player";
  return publicName(p.name, cfg.lastInitialOnly);
}
export function pubId(p: Player | undefined, cfg: OrgConfig) {
  if (!p) return "";
  return cfg.maskIds ? maskId(p.empId) : p.empId;
}
export const firstName = (name?: string) => (name || "").trim().split(/\s+/)[0] || "";

/** "Branch" / "Department" (or whatever this company calls them). */
export const unitLabel = (labels: Labels, t: UnitType) => (t === "dept" ? labels.dept : labels.branch);

export function Avatar({ p, size = 44, mood }: { p?: Player; size?: number; mood?: "idle" | "happy" }) {
  return <Chibi look={p?.look ?? 0} equipped={p?.equipped} size={size} mood={mood ?? "idle"} still={!mood} />;
}

export function TopBar({ title, back, right }: { title: string; back?: () => void; right?: React.ReactNode }) {
  return (
    <div className="topbar">
      {back ? (
        <button type="button" className="icon-btn" aria-label="Back" onClick={back}>
          <Icon.back />
        </button>
      ) : (
        <span style={{ width: 44 }} />
      )}
      <span className="title">{title}</span>
      {right ?? <span style={{ width: 44 }} />}
    </div>
  );
}

export function CoinPill() {
  const { me, stats, features } = useApp();
  if (!features.coins) return <span style={{ width: 44 }} />;
  const s = me ? stats[me.uid] : undefined;
  return (
    <span className="pill num" data-coin-target title="Coins">
      <span className="coin-ic" />
      {(s?.coins ?? 0).toLocaleString()}
    </span>
  );
}

/* ---------------- certification helpers ---------------- */
export interface CertInfo {
  runs: Run[]; // attempts in order (1…n)
  latest?: Run;
  attempt: number; // number of the latest attempt (0 = none yet)
  max: number;
  left: number; // attempts not started yet
  passed?: Run;
  playing?: Run;
  best: number; // best score %
  validUntil?: number;
  expired: boolean;
}

export function certInfo(me: Player | undefined, g: Game): CertInfo {
  const runs: Run[] = [];
  for (let n = 1; n <= 20; n++) {
    const r = me?.runs?.[runKey(g.id, n)];
    if (!r) break;
    runs.push(r);
  }
  const max = Math.max(1, g.cert?.attempts || 1);
  const latest = runs[runs.length - 1];
  const passed = runs.find((r) => r.status === "done" && r.passed);
  const validUntil = passed?.finishedAt && g.cert?.validMonths ? addMonths(passed.finishedAt, g.cert.validMonths) : undefined;
  const best = Math.max(0, ...runs.filter((r) => r.status === "done").map((r) => scorePct(r)));
  return {
    runs, latest, attempt: runs.length, max, left: Math.max(0, max - runs.length), passed,
    playing: latest?.status === "playing" ? latest : undefined, best, validUntil, expired: !!validUntil && validUntil < Date.now(),
  };
}
export const scorePct = (r: Run) => (r.total ? Math.round((r.correct / r.total) * 100) : 0);
export function addMonths(t: number, m: number) {
  const d = new Date(t);
  d.setMonth(d.getMonth() + m);
  return d.getTime();
}
export const fmtLongDate = (t?: number) => (t ? new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");
export const certHref = (slug: string, gid: string, attempt?: number) => `#/t/${slug}/cert/${gid}${attempt && attempt > 1 ? "/" + attempt : ""}`;

/** The result of the last finishRun, kept so the scorecard shows at once (and the exam key, when allowed). */
export const finishCache = new Map<string, { run: Run; key?: Record<string, string> }>();
