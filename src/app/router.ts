/* Tiny hash router. Hash URLs work on Vercel, any static host and straight from disk.
   Routes:
     #/                         product landing page
     #/features|how-it-works|use-cases|security|faq   landing page, scrolled to that section
     #/experience               try it: guided demo sandbox
     #/signin                   join a game, vote, company & admin sign-in
     #/join[/:pin]              live quiz — players
     #/vote[/:code]             live poll — audience
     #/t/:slug                  company player app
     #/t/:slug/admin            company admin portal
     #/t/:slug/host/:sessionId  live quiz host screen
     #/t/:slug/present/:pollId  poll presenter screen
     #/t/:slug/cert/:gid        printable certificate
     #/super                    super admin console */
import { useEffect, useState } from "react";

export type Route =
  | { r: "home"; section?: Section }
  | { r: "experience" }
  | { r: "signin" }
  | { r: "contact" }
  | { r: "join"; pin?: string }
  | { r: "vote"; code?: string }
  | { r: "tenant"; slug: string; key?: string }
  | { r: "admin"; slug: string; tab?: string }
  | { r: "host"; slug: string; id: string }
  | { r: "present"; slug: string; id: string }
  | { r: "cert"; slug: string; gid: string; attempt?: number }
  | { r: "super"; tab?: string }
  | { r: "notfound" };

/** Landing-page sections that have their own shareable link (#/features …). */
export const SECTIONS = ["features", "how-it-works", "use-cases", "security", "faq"] as const;
export type Section = (typeof SECTIONS)[number];
/** Friendly aliases people type or link to. */
const ALIAS: Record<string, string> = {
  login: "signin", "sign-in": "signin", signup: "experience", "sign-up": "experience", demo: "experience", try: "experience",
  tour: "experience", sales: "contact", "contact-sales": "contact", play: "join", pin: "join", poll: "vote", admin: "signin", home: "", pricing: "faq", how: "how-it-works",
};

export function parse(hash: string): Route {
  const [path] = hash.replace(/^#/, "").split("?");
  const p = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (p.length && p[0].toLowerCase() in ALIAS) {
    const a = ALIAS[p[0].toLowerCase()];
    p.splice(0, 1, ...(a ? [a] : []));
  }
  if (p[0]) p[0] = p[0].toLowerCase();
  if (!p.length) return { r: "home" };
  if ((SECTIONS as readonly string[]).includes(p[0]) && p.length === 1) return { r: "home", section: p[0] as Section };
  if (p[0] === "experience") return { r: "experience" };
  if (p[0] === "signin") return { r: "signin" };
  if (p[0] === "contact") return { r: "contact" };
  if (p[0] === "join") return { r: "join", pin: p[1] };
  if (p[0] === "vote") return { r: "vote", code: p[1] };
  if (p[0] === "super") return { r: "super", tab: p[1] };
  if (p[0] === "t" && p[1]) {
    const slug = p[1].toLowerCase();
    if (!p[2]) return { r: "tenant", slug };
    if (p[2] === "k" && p[3]) return { r: "tenant", slug, key: p[3] };
    if (p[2] === "admin") return { r: "admin", slug, tab: p[3] };
    if (p[2] === "host" && p[3]) return { r: "host", slug, id: p[3] };
    if (p[2] === "present" && p[3]) return { r: "present", slug, id: p[3] };
    if (p[2] === "cert" && p[3]) return { r: "cert", slug, gid: p[3], attempt: p[4] ? Number(p[4]) : undefined };
  }
  return { r: "notfound" };
}

export function href(r: Route): string {
  switch (r.r) {
    case "home": return "#/" + (r.section || "");
    case "experience": return "#/experience";
    case "signin": return "#/signin";
    case "contact": return "#/contact";
    case "join": return "#/join" + (r.pin ? "/" + r.pin : "");
    case "vote": return "#/vote" + (r.code ? "/" + r.code : "");
    case "tenant": return `#/t/${r.slug}` + (r.key ? `/k/${r.key}` : "");
    case "admin": return `#/t/${r.slug}/admin` + (r.tab ? "/" + r.tab : "");
    case "host": return `#/t/${r.slug}/host/${r.id}`;
    case "present": return `#/t/${r.slug}/present/${r.id}`;
    case "cert": return `#/t/${r.slug}/cert/${r.gid}` + (r.attempt && r.attempt > 1 ? "/" + r.attempt : "");
    case "super": return "#/super" + (r.tab ? "/" + r.tab : "");
    default: return "#/";
  }
}

/** Absolute link for sharing (QR codes, emails). */
export function absUrl(r: Route): string {
  const base = (import.meta.env.VITE_APP_URL as string | undefined) || location.href.split("#")[0];
  return base.replace(/\/$/, location.protocol === "file:" ? "" : "/").replace(/\/+$/, "/") + href(r);
}

export function nav(r: Route, replace = false) {
  const h = href(r);
  if (replace) history.replaceState(null, "", h);
  else location.hash = h;
  if (replace) window.dispatchEvent(new HashChangeEvent("hashchange"));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(typeof location === "undefined" ? "" : location.hash));
  useEffect(() => {
    const f = () => setRoute(parse(location.hash));
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return route;
}

/** Plain paths (/signin, /t/acme) — e.g. typed or shared without the # — become hash routes.
 *  vercel.json rewrites every path to index.html so this runs instead of a 404. */
export function pathToHash() {
  if (typeof location === "undefined" || location.protocol === "file:") return;
  const path = location.pathname.replace(/\/index\.html$/, "/");
  if (path === "/" || path === "") return;
  const hash = location.hash && location.hash !== "#" && location.hash !== "#/" ? location.hash : "#" + path.replace(/\/+$/, "");
  history.replaceState(null, "", "/" + location.search + hash);
}
