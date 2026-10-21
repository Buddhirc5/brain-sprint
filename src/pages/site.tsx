/* Shared chrome for the public marketing pages (#/, #/experience, #/signin). */
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import "../styles/home.css";
import { useApi } from "../app/ApiCtx";
import { useRoute } from "../app/router";
import { HAS_LIVE_BACKEND, enterSandbox } from "../app/sandbox";
import { Logo } from "../components/Logo";

export const CONTACT_EMAIL = (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) || "";

/** In-page scroll (plain #anchors would be taken by the hash router). */
export function jump(id: string, focus?: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (focus) setTimeout(() => document.getElementById(focus)?.focus({ preventScroll: true }), 350);
}

/** True while this browser runs the in-browser demo (the sandbox on a live site, or a demo-only build). */
export function useInDemo() {
  const { api } = useApi();
  return api.mode === "demo";
}

/**
 * A link into the demo companies. On a live site outside the sandbox it first switches
 * this browser to the local demo, so trying things never writes to the real database.
 */
export function DemoHref({ href, className, children, newTab }: { href: string; className?: string; children: ReactNode; newTab?: boolean }) {
  const inDemo = useInDemo();
  const needsSwitch = HAS_LIVE_BACKEND && !inDemo;
  const onClick = (e: MouseEvent) => {
    if (!needsSwitch) return;
    e.preventDefault();
    enterSandbox(href);
  };
  return (
    <a className={className} href={href} onClick={onClick} {...(newTab && !needsSwitch ? { target: "_blank", rel: "noopener" } : {})}>
      {children}
    </a>
  );
}

const NAV: [string, string][] = [
  ["#/features", "Features"],
  ["#/how-it-works", "How it works"],
  ["#/experience", "Live demo"],
  ["#/faq", "FAQ"],
];

export function SiteHeader() {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    if (!open) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [open]);
  const here = (h: string) => {
    if (h === "#/experience") return route.r === "experience";
    return route.r === "home" && route.section === h.replace("#/", "");
  };
  return (
    <header className={`h-top ${open ? "open" : ""}`}>
      <a className="h-logo" href="#/">
        <Logo size={44} />
      </a>
      <nav className="h-topnav" aria-label="Main">
        {NAV.map(([h, l]) => (
          <a key={h} href={h} className={here(h) ? "on" : ""} aria-current={here(h) ? "page" : undefined}>
            {l}
          </a>
        ))}
      </nav>
      <div className="h-topcta">
        <a className={`h-signin ${route.r === "signin" ? "on" : ""}`} href="#/signin">Sign in</a>
        <a className="btn lime small h-trybtn" href="#/experience">Try it free</a>
        <button type="button" className="h-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="h-mobnav" onClick={() => setOpen(!open)}>
          <span />
          <span />
          <span />
        </button>
      </div>
      {open && (
        <nav className="h-mobnav" id="h-mobnav" aria-label="Menu">
          <a href="#/" onClick={() => setOpen(false)}>Home</a>
          {NAV.map(([h, l]) => (
            <a key={h} href={h} onClick={() => setOpen(false)}>{l}</a>
          ))}
          <a href="#/security" onClick={() => setOpen(false)}>Security</a>
          <span className="h-mobnav-sep" />
          <a href="#/join" onClick={() => setOpen(false)}>Join a live game</a>
          <a href="#/vote" onClick={() => setOpen(false)}>Vote in a poll</a>
          <a href="#/signin" onClick={() => setOpen(false)}>Sign in</a>
          <a className="btn lime block" href="#/experience" onClick={() => setOpen(false)}>Try it free</a>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const cols: [string, [string, string][]][] = [
    // real addresses (not #/…) so search engines can follow them to each section's own page
    ["Product", [["/features", "Features"], ["/how-it-works", "How it works"], ["/use-cases", "Who it's for"], ["/security", "Security"], ["/faq", "FAQ"]]],
    ["Try it", [["#/experience", "Live demo"], ["#/join", "Join a live game"], ["#/vote", "Vote in a poll"]]],
    ["Account", [["#/signin", "Sign in"], ["#/signin", "Company admin sign-in"], ["#/super", "Super admin"]]],
  ];
  return (
    <footer className="h-foot">
      <div className="h-foot-col h-foot-about">
        <a className="h-foot-brand" href="#/">
          <Logo size={56} />
        </a>
        <span>Learning your team actually plays. Daily quiz sprints, live quiz games, polls and certification — under your own brand.</span>
      </div>
      {cols.map(([t, links]) => (
        <nav key={t} className="h-foot-links" aria-label={t}>
          <b>{t}</b>
          {links.map(([h, l]) => (
            <a key={l} href={h}>{l}</a>
          ))}
          {t === "Account" && CONTACT_EMAIL && <a href="#/contact">Contact sales</a>}
        </nav>
      ))}
      <div className="h-foot-copy">
        <span>© {new Date().getFullYear()} Ant Arena · Made for teams that like to play</span>
        <button type="button" className="h-totop" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Back to top ↑</button>
      </div>
    </footer>
  );
}
