import "../styles/admin.css";
import { useApp, TenantProvider } from "../app/ctx";
import { Mascot } from "../components/Chibi";
import { LogoMark } from "../components/Logo";
import { Welcome, Setup } from "../player/Setup";
import { Lobby } from "../player/Lobby";
import { Play } from "../player/Play";
import { Results } from "../player/Results";
import { Board } from "../player/Board";
import { Store } from "../player/Store";
import { Guide } from "../player/Guide";
import { Login, EmailLogin } from "../player/Login";
import { Certs } from "../player/Certs";
import { ArenaMap } from "../player/ArenaMap";
import { Loading } from "../App";
import { useTenantPub } from "./useTenantPub";
import { useApi } from "../app/ApiCtx";
import { isDemo } from "../api/demo/guard";
import { useEffect } from "react";
import { nav } from "../app/router";
import { cleanJoinKey, setJoinKey } from "../app/joinKey";
import { takeReturnTo } from "../app/returnTo";

export function Gone({ title, text }: { title: string; text: string }) {
  return (
    <div className="phone" style={{ paddingTop: 40 }}>
      <div className="card stack" style={{ textAlign: "center", justifyItems: "center" }}>
        <Mascot mood="sad" size={110} />
        <h2>{title}</h2>
        <p className="fine">{text}</p>
        <a className="btn ghost small" href="#/">Home</a>
      </div>
    </div>
  );
}

export function TenantApp({ slug, joinKey }: { slug: string; joinKey?: string }) {
  // private invite link: remember the key on this device, then drop it from the address bar
  useEffect(() => {
    if (!joinKey) return;
    setJoinKey(slug, cleanJoinKey(joinKey));
    nav({ r: "tenant", slug }, true);
  }, [slug, joinKey]);
  const { pub, error } = useTenantPub(slug);
  if (error) return <Gone title="Can't load" text={error} />;
  if (pub === undefined) return <Loading text="Loading…" />;
  if (!pub) return <Gone title="Company not found" text="Check the link you were given." />;
  if (pub.status !== "active") return <Gone title="Paused" text={`${pub.branding.productName} is paused for ${pub.name}. Please contact your admin.`} />;
  return (
    <TenantProvider pub={pub} area="player" role={null}>
      <PlayerShell />
    </TenantProvider>
  );
}

function PlayerShell() {
  const { d, me, view, pub } = useApp();
  const { api } = useApi();
  // came here from a live game (QR / PIN) to sign in or register: go back to the game once the card exists
  useEffect(() => {
    if (!me) return;
    const to = takeReturnTo(pub.slug);
    if (to) location.hash = to;
  }, [me, pub.slug]);
  let screen: JSX.Element;
  if (!me) {
    if (view.v === "setup") screen = <Setup />;
    else if (view.v === "guide") screen = <Guide />;
    else if (view.v === "login" && pub.signIn.empId) screen = <Login />;
    else if (view.v === "email") screen = <EmailLogin />;
    else screen = <Welcome />;
  } else if (!d.loaded) {
    screen = <Loading text="Loading today's sprint…" />;
  } else {
    switch (view.v) {
      case "setup":
        screen = <Setup editing />;
        break;
      case "play":
        screen = <Play key={view.gid} gid={view.gid} />;
        break;
      case "results":
        screen = <Results gid={view.gid} fresh={view.fresh} />;
        break;
      case "board":
        screen = <Board />;
        break;
      case "store":
        screen = <Store />;
        break;
      case "guide":
        screen = <Guide />;
        break;
      case "certs":
        screen = <Certs />;
        break;
      case "map":
        screen = <ArenaMap />;
        break;
      default:
        screen = <Lobby />;
    }
  }
  return (
    <>
      {isDemo(api) && view.v !== "play" && (
        <div className="phone" style={{ marginBottom: 12 }}>
          <div className="banner blue">
            <b>Demo</b> — everything is saved in this browser only. {me ? "" : "Try Employee ID DEMO-101."}{" "}
            <a className="link" href="#/experience">Demo tour</a>
          </div>
        </div>
      )}
      {screen}
      {view.v !== "play" && (
        <div className="phone" style={{ marginTop: 24, justifyItems: "center" }}>
          <p className="fine" style={{ textAlign: "center" }}>
            {pub.name} · <span className="powered"><LogoMark size={18} still /> powered by Ant Arena</span>
          </p>
        </div>
      )}
    </>
  );
}
