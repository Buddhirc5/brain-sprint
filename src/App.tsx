import { lazy, Suspense, useEffect, useState } from "react";
import type { Api } from "./api/Api";
import { createApi } from "./api";
import { ApiProvider } from "./app/ApiCtx";
import { useRoute } from "./app/router";
import { applyBranding, setTitle } from "./app/theme";
import { Sprinty } from "./components/Chibi";
import { Home } from "./pages/Home";
import { TenantApp } from "./pages/TenantApp";
import { HAS_LIVE_BACKEND, exitSandbox, sandboxOn } from "./app/sandbox";

// Big screens load on demand so a player's phone only downloads what it needs.
const AdminApp = lazy(() => import("./pages/AdminApp").then((m) => ({ default: m.AdminApp })));
const HostScreen = lazy(() => import("./live/HostScreen").then((m) => ({ default: m.HostScreen })));
const JoinPage = lazy(() => import("./live/JoinPage").then((m) => ({ default: m.JoinPage })));
const Presenter = lazy(() => import("./polls/Presenter").then((m) => ({ default: m.Presenter })));
const VotePage = lazy(() => import("./polls/VotePage").then((m) => ({ default: m.VotePage })));
const CertificatePage = lazy(() => import("./cert/CertificatePage").then((m) => ({ default: m.CertificatePage })));
const Experience = lazy(() => import("./pages/Experience").then((m) => ({ default: m.Experience })));
const SignIn = lazy(() => import("./pages/SignIn").then((m) => ({ default: m.SignIn })));
const WorldPage = lazy(() => import("./world/WorldPage").then((m) => ({ default: m.WorldPage })));
const SuperApp = lazy(() => import("./super/SuperApp").then((m) => ({ default: m.SuperApp })));

export default function App() {
  const [api, setApi] = useState<Api | null>(null);
  const [fail, setFail] = useState("");
  useEffect(() => {
    createApi(HAS_LIVE_BACKEND && sandboxOn()).then(setApi, (e) => setFail(String(e?.message || e)));
  }, []);
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
  if (!api) return <Loading text="Warming up…" />;
  return (
    <ApiProvider api={api}>
      <Router />
      {HAS_LIVE_BACKEND && api.mode === "demo" && <SandboxBar />}
    </ApiProvider>
  );
}

export function Loading({ text }: { text: string }) {
  return (
    <div className="phone" style={{ justifyItems: "center", paddingTop: 60, textAlign: "center" }}>
      <Sprinty mood="think" size={120} />
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

const SITE_PAGES = new Set(["home", "experience", "signin", "world", "super", "notfound"]);

function Router() {
  const route = useRoute();
  // pages outside a company use the default Brain Sprint look
  useEffect(() => {
    if (SITE_PAGES.has(route.r)) {
      applyBranding(undefined);
      setTitle(
        route.r === "super" ? "Brain Sprint · Super admin"
        : route.r === "experience" ? "Brain Sprint · Experience"
        : route.r === "signin" ? "Brain Sprint · Sign in"
        : route.r === "world" ? "Brain Sprint · Knowledge World"
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
    case "world":
      el = <WorldPage />;
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
