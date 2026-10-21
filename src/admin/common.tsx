/* Small pieces shared by the admin tabs. */
import { useApp } from "../app/ctx";
import type { Branding, Labels, QuizKind, Role, Tenant, UnitType } from "../types";

/** The company as it is NOW. `pub` is loaded once when the portal opens; the live
 *  tenant row (sent with every data update) wins, so brand/label edits show at once. */
export function useLiveTenant(): { tenant: Tenant | undefined; labels: Labels; branding: Branding } {
  const { d, pub, labels } = useApp();
  const tenant = (d as unknown as { tenant?: Tenant }).tenant;
  return { tenant, labels: tenant?.labels || labels, branding: tenant?.branding || pub.branding };
}

export const unitWord = (l: Labels, t: UnitType | string) => (t === "dept" ? l.dept : l.branch);
export const unitsWord = (l: Labels, t: UnitType | string) => (t === "dept" ? l.depts : l.branches);

export const KIND: Record<QuizKind, { label: string; short: string; text: string; feature: "sprint" | "cert" | "live" }> = {
  sprint: { label: "Daily sprint", short: "Sprint", text: "A short self-paced quiz players open from their phone. Points, coins and streaks.", feature: "sprint" },
  cert: { label: "Certification", short: "Cert", text: "A graded exam with a pass mark, limited attempts and a printable certificate.", feature: "cert" },
  live: { label: "Live quiz", short: "Live", text: "A game show you host on a big screen. Everyone answers on their phone at the same time.", feature: "live" },
  story: { label: "Story Mode", short: "Story", text: "A comic-book case study: scenes with characters, a reply to pick in each, and an ending. No timer.", feature: "sprint" },
};

export const ROLES: Role[] = ["viewer", "host", "editor", "admin", "owner"];
export const ROLE_INFO: Record<Role, { label: string; text: string }> = {
  viewer: { label: "Viewer", text: "Dashboards & results, read-only" },
  host: { label: "Host", text: "Run live games & polls" },
  editor: { label: "Editor", text: "Create quizzes & polls" },
  admin: { label: "Admin", text: "Players, settings, branding, admins" },
  owner: { label: "Owner", text: "Everything, including owners" },
};

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" disabled={disabled} onClick={() => onChange(!on)} />;
}

/** A labelled on/off row: title, plain-language description, switch. */
export function SwitchRow({ title, text, on, onChange, disabled, children }: { title: string; text: React.ReactNode; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <div className="sw-row">
      <div>
        <b>{title}</b>
        <span className="fine">{text}</span>
        {children}
      </div>
      <Toggle on={on} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "export";
