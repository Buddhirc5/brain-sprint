/* Shared bits for the super admin console. */
import { createContext, useContext, useState } from "react";
import type { Tenant, TenantUsage } from "../types";
import { SLUG_RE } from "../api/Api";

export type TenantRow = Tenant & { usage: TenantUsage };

export interface SuperCtx {
  tenants: TenantRow[] | null;
  reload: () => Promise<void>;
  /** call when an API call says the console is locked */
  recheck: () => void;
  go: (tab: string) => void;
}
const C = createContext<SuperCtx>(null as unknown as SuperCtx);
export const SuperProvider = C.Provider;
export const useSuper = () => useContext(C);

export const RESERVED = ["super", "join", "vote", "admin", "api", "www", "app"];

/** "Acme Bank PLC" → "acme-bank-plc" (fits SLUG_RE). */
export function slugify(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
  return s.length >= 3 ? s : s ? (s + "-co").slice(0, 32) : "";
}

export function slugProblem(slug: string, taken: string[] = []): string | null {
  if (!slug) return "Enter a web address.";
  if (slug.length < 3 || slug.length > 32) return "Use 3–32 characters.";
  if (!SLUG_RE.test(slug)) return "Lowercase letters, numbers and dashes only — start and end with a letter or number.";
  if (RESERVED.includes(slug)) return "That address is reserved.";
  if (taken.includes(slug)) return "Another company already uses this address.";
  return null;
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function ago(t: number): string {
  if (!t) return "never";
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const t = document.createElement("textarea");
      t.value = value;
      document.body.appendChild(t);
      t.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <div className="su-copy">
      <span className="label">{label}</span>
      <div className="su-copy-row">
        <code>{value}</code>
        <button type="button" className="btn tiny white" onClick={copy}>
          {done ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="toggle" onClick={() => onChange(!on)} />;
}

/* small line icons not in components/ui */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
export const SI = {
  building: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 21V5l8-2v18M12 8l8 2v11M3 21h18M7.5 8h1M7.5 12h1M7.5 16h1M15.5 13h1M15.5 17h1" /></svg>),
  plus: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 5v14M5 12h14" /></svg>),
  book: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z" /><path d="M8 7h7M8 11h5" /></svg>),
  chart: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3M20 16V6" /></svg>),
  list: () => (<svg viewBox="0 0 24 24" {...P}><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>),
  search: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>),
  ext: () => (<svg viewBox="0 0 24 24" {...P}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>),
  trash: () => (<svg viewBox="0 0 24 24" {...P}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>),
  upload: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>),
  download: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>),
  key: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></svg>),
  pause: () => (<svg viewBox="0 0 24 24" {...P}><path d="M9 5v14M15 5v14" /></svg>),
  play: () => (<svg viewBox="0 0 24 24" {...P}><path d="M7 4l13 8-13 8z" /></svg>),
  users: () => (<svg viewBox="0 0 24 24" {...P}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></svg>),
  palette: () => (<svg viewBox="0 0 24 24" {...P}><path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-1.2-1-1.5-1-2.7 0-1 .8-1.5 1.8-1.5H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></svg>),
  toggles: () => (<svg viewBox="0 0 24 24" {...P}><rect x="3" y="5" width="18" height="6" rx="3" /><rect x="3" y="13" width="18" height="6" rx="3" /><circle cx="16" cy="8" r="1.5" /><circle cx="8" cy="16" r="1.5" /></svg>),
};
