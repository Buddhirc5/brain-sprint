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
  ["#/", "Product"],
  ["#/experience", "Experience"],
];

export function SiteHeader() {
  const route = useRoute();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route.r]);
  const here = (h: string) => (h === "#/" ? route.r === "home" : h === "#/experience" ? route.r === "experience" : false);
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
        <a className="h-signin" href="#/signin">Sign in</a>
        <a className="btn lime small h-trybtn" href="#/experience">Try it free</a>
        <button type="button" className="h-burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          <span />
          <span />
          <span />
        </button>
      </div>
      {open && (
        <nav className="h-mobnav" aria-label="Menu">
          {NAV.map(([h, l]) => (
            <a key={h} href={h} onClick={() => setOpen(false)}>{l}</a>
          ))}
          <a href="#/signin" onClick={() => setOpen(false)}>Sign in</a>
          <a className="btn lime block" href="#/experience" onClick={() => setOpen(false)}>Try it free</a>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="h-foot">
      <div className="h-foot-col">
        <a className="h-foot-brand" href="#/">
          <Logo size={56} />
        </a>
        <span>Learning your team actually plays.</span>
      </div>
      <nav className="h-foot-links" aria-label="Footer">
        <a href="#/">Product</a>
        <a href="#/experience">Experience</a>
        <a href="#/signin">Sign in</a>
        <a href="#/join">Join a game</a>
        <a href="#/vote">Vote</a>
        {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>Contact sales</a>}
        <a className="h-super" href="#/super">Super admin</a>
      </nav>
      <span className="h-foot-copy">© {new Date().getFullYear()} Brain Sprint</span>
    </footer>
  );
}
