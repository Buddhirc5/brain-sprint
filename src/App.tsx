import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Api } from "./api/Api";
import { createApi } from "./api";
import { ApiProvider } from "./app/ApiCtx";
import { href, parse, useRoute, type Route } from "./app/router";
import { applyBranding, setTitle } from "./app/theme";
import { Mascot } from "./components/Chibi";
import { LogoMark } from "./components/Logo";
import { Home } from "./pages/Home";
import { HAS_LIVE_BACKEND, exitSandbox, sandboxOn } from "./app/sandbox";

// Everything except the landing page loads on demand, so the first visit only downloads what it shows.
const TenantApp = lazy(() => import("./pages/TenantApp").then((m) => ({ default: m.TenantApp })));
const AdminApp = lazy(() => import("./pages/AdminApp").then((m) => ({ default: m.AdminApp })));
const HostScreen = lazy(() => import("./live/HostScreen").then((m) => ({ default: m.HostScreen })));
const JoinPage = lazy(() => import("./live/JoinPage").then((m) => ({ default: m.JoinPage })));
const Presenter = lazy(() => import("./polls/Presenter").then((m) => ({ default: m.Presenter })));
const VotePage = lazy(() => import("./polls/VotePage").then((m) => ({ default: m.VotePage })));
const CertificatePage = lazy(() => import("./cert/CertificatePage").then((m) => ({ default: m.CertificatePage })));
const Experience = lazy(() => import("./pages/Experience").then((m) => ({ default: m.Experience })));
const Contact = lazy(() => import("./pages/Contact").then((m) => ({ default: m.Contact })));
const SignIn = lazy(() => import("./pages/SignIn").then((m) => ({ default: m.SignIn })));
const SuperApp = lazy(() => import("./super/SuperApp").then((m) => ({ default: m.SuperApp })));

/** Stand-in while the real backend starts: the landing page needs no data. */
const STUB = { mode: "supabase", user: () => null, onAuth: () => () => undefined } as unknown as Api;

export default function App() {
  const route = useRoute();
  const [api, setApi] = useState<Api | null>(null);
  const [fail, setFail] = useState("");
  const started = useRef(false);
  useEffect(() => {
    const start = () => {
      if (started.current) return;
      started.current = true;
      createApi(HAS_LIVE_BACKEND && sandboxOn()).then(setApi, (e) => setFail(String(e?.message || e)));
    };
    if (route.r !== "home") return start();
    // landing page: paint first, start the backend when the browser is idle
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(start, { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(start, 1200);
    return () => window.clearTimeout(t);
  }, [route.r]);
  if (fail)
    return (
      <div className="phone" style={{ paddingTop: 40 }}>
        <div className="card stack" style={{ textAlign: "center", justifyItems: "center" }}>
          <Mascot mood="sad" size={110} />
          <h2>Can't start</h2>
          <p className="fine">{fail}</p>
        </div>
      </div>
    );
  if (!api && route.r !== "home") return <Loading text="Warming up…" />;
  return (
    <ApiProvider api={api ?? STUB}>
      <Router route={route} />
      {HAS_LIVE_BACKEND && api?.mode === "demo" && <SandboxBar />}
    </ApiProvider>
  );
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="phone" style={{ justifyItems: "center", paddingTop: 60, textAlign: "center" }}>
      <LogoMark size={96} />
      <p style={{ fontWeight: 800 }}>{text}</p>
    </div>
  );
}

/** Always visible while a visitor is in the demo sandbox on a live site. */
function SandboxBar() {
  return (
    <div className="sandbox-bar" role="status">
      <span className="sandbox-dot" aria-hidden="true" />
      <span>
        <b>Demo sandbox</b> <span className="sandbox-sub">· saved in this browser only</span>
      </span>
      <button type="button" onClick={() => exitSandbox()}>Exit demo</button>
    </div>
  );
}

/** Pages outside a company: default Ant Arena look + their own tab title. */
const SITE_TITLES: Partial<Record<Route["r"], string>> = {
  home: "Ant Arena — Gamified employee training: daily quizzes, live quiz games & polls",
  experience: "Try Ant Arena free — interactive demo",
  signin: "Sign in · Ant Arena",
  contact: "Contact sales · Ant Arena",
  join: "Join a live quiz game · Ant Arena",
  super: "Super admin · Ant Arena",
  notfound: "Page not found · Ant Arena",
};

function Router({ route }: { route: Route }) {
  useEffect(() => {
    const t = SITE_TITLES[route.r];
    if (t) {
      applyBranding(undefined);
      setTitle(t);
    }
  }, [route.r]);
  // a link to the page you're already on scrolls to its top (or to its section) instead of doing nothing
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const norm = (h: string) => (h === "" || h === "#" ? "#/" : h.toLowerCase());
      if (norm(a.getAttribute("href") || "") !== norm(location.hash)) return;
      e.preventDefault();
      const r = parse(location.hash);
      const el = r.r === "home" && r.section ? document.getElementById(r.section) : null;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  // new page → start at the top (section links scroll themselves)
  const pageKey = route.r === "home" ? "home" : href(route);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (route.r !== "home" || !route.section) window.scrollTo({ top: 0, behavior: "auto" });
  }, [pageKey]); // eslint-disable-line react-hooks/exhaustive-deps
  let el: JSX.Element;
  switch (route.r) {
    case "home":
      el = <Home section={route.section} />;
      break;
    case "experience":
      el = <Experience />;
      break;
    case "contact":
      el = <Contact />;
      break;
    case "signin":
      el = <SignIn />;
      break;
    case "join":
      el = <JoinPage pin={route.pin} />;
      break;
    case "vote":
      el = <VotePage code={route.code} />;
      break;
    case "tenant":
      el = <TenantApp slug={route.slug} joinKey={route.key} />;
      break;
    case "admin":
      el = <AdminApp slug={route.slug} tab={route.tab} />;
      break;
    case "host":
      el = <HostScreen slug={route.slug} sessionId={route.id} />;
      break;
    case "present":
      el = <Presenter slug={route.slug} pollId={route.id} />;
      break;
    case "cert":
      el = <CertificatePage slug={route.slug} gid={route.gid} attempt={route.attempt} />;
      break;
    case "super":
      el = <SuperApp tab={route.tab} />;
      break;
    default:
      el = <NotFound />;
  }
  return <Suspense fallback={<Loading text="Loading…" />}>{el}</Suspense>;
}

function NotFound() {
  return (
    <div className="phone nf" style={{ paddingTop: 40 }}>
      <div className="card stack" style={{ textAlign: "center", justifyItems: "center" }}>
        <a href="#/" aria-label="Ant Arena home"><LogoMark size={64} /></a>
        <Mascot mood="sad" size={110} />
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Page not found</h1>
        <p className="fine">That link doesn't lead anywhere. Here are some places that do:</p>
        <a className="btn primary block" href="#/">Home</a>
        <div className="row" style={{ justifyContent: "center" }}>
          <a className="btn ghost small" href="#/join">Join a game</a>
          <a className="btn ghost small" href="#/vote">Vote in a poll</a>
        </div>
      </div>
    </div>
  );
}
