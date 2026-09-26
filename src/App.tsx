import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Api } from "./api/Api";
import { createApi } from "./api";
import { ApiProvider } from "./app/ApiCtx";
import { useRoute, type Route } from "./app/router";
import { applyBranding, setTitle } from "./app/theme";
import { Sprinty } from "./components/Chibi";
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
          <Sprinty mood="sad" size={110} />
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

const SITE_PAGES = new Set(["home", "experience", "signin", "super", "notfound"]);

function Router({ route }: { route: Route }) {
  // pages outside a company use the default Brain Sprint look
  useEffect(() => {
    if (SITE_PAGES.has(route.r)) {
      applyBranding(undefined);
      setTitle(
        route.r === "super" ? "Brain Sprint · Super admin"
        : route.r === "experience" ? "Brain Sprint · Experience"
        : route.r === "signin" ? "Brain Sprint · Sign in"
        : "Brain Sprint · Learning your team actually plays",
      );
    }
  }, [route.r]);
  let el: JSX.Element;
  switch (route.r) {
    case "home":
      el = <Home />;
      break;
    case "experience":
      el = <Experience />;
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
      el = <TenantApp slug={route.slug} />;
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
      el = (
        <div className="phone" style={{ paddingTop: 40 }}>
          <div className="card stack" style={{ textAlign: "center", justifyItems: "center" }}>
            <Sprinty mood="sad" size={110} />
            <h2>Page not found</h2>
            <a className="btn primary" href="#/">Go home</a>
          </div>
        </div>
      );
  }
  return <Suspense fallback={<Loading text="Loading…" />}>{el}</Suspense>;
}
