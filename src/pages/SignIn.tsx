/* =====================================================================
   Sign in (#/signin): join a live game, vote in a poll, or open your
   company's player app / admin portal.
   ===================================================================== */
import { useState } from "react";
import { nav } from "../app/router";
import { Chibi } from "../components/Chibi";
import { Icon } from "../components/ui";
import { SiteFooter, SiteHeader, useInDemo } from "./site";

const SLUG_OK = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Accepts "acme-bank", "/t/acme-bank" or a full pasted link. */
function slugFrom(s: string): string {
  const v = s.trim().toLowerCase();
  const m = v.match(/#\/t\/([a-z0-9-]+)/) || v.match(/(?:^|\/)t\/([a-z0-9-]+)/);
  return (m ? m[1] : v).replace(/[^a-z0-9-]/g, "");
}

export function SignIn() {
  const inDemo = useInDemo();
  return (
    <div className="home">
      <SiteHeader />
      <section className="h-signin-hero">
        <div>
          <span className="h-tag">Welcome back</span>
          <h1 className="h-page-title">Jump in.</h1>
          <p className="h-sub">Got a game PIN or a poll code? Type it below. Playing today's sprint or managing your team? Open your company.</p>
          {inDemo && (
            <p className="banner blue" style={{ marginTop: 12 }}>
              You're in the demo. Try the company address <b>harbor</b> or <b>northwind</b>.
            </p>
          )}
        </div>
        <div className="h-signin-art" aria-hidden="true">
          <Chibi look={5} variant="full" mood="cheer" size={150} />
          <Chibi look={10} variant="full" mood="happy" size={150} />
        </div>
      </section>
      <Actions />
      <SiteFooter />
    </div>
  );
}

function Actions() {
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [co, setCo] = useState("");
  const [coErr, setCoErr] = useState("");
  const slug = slugFrom(co);
  const goCo = (admin: boolean) => {
    if (!SLUG_OK.test(slug)) return setCoErr("Type your company's web address, like acme-bank.");
    setCoErr("");
    nav(admin ? { r: "admin", slug } : { r: "tenant", slug });
  };
  return (
    <section className="h-actions" aria-label="Sign in">
      <form
        id="company-box"
        className="h-act h-act-co"
        onSubmit={(e) => {
          e.preventDefault();
          goCo(false);
        }}
        noValidate
      >
        <ActHead n="1" title="Your company" sub="Play today's sprint, see your leaderboard, or manage your team." />
        <label className="h-co-lbl" htmlFor="h-co">Company web address</label>
        <div className="h-co">
          <span>/t/</span>
          <input
            id="h-co"
            autoCapitalize="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="your-company"
            value={co}
            onChange={(e) => {
              setCo(e.target.value);
              setCoErr("");
            }}
          />
        </div>
        {coErr && <p className="err" role="alert">{coErr}</p>}
        <div className="h-co-btns">
          <button className="btn primary">Player sign-in</button>
          <button type="button" className="btn ghost" onClick={() => goCo(true)}>
            <Icon.lock /> Admin sign-in
          </button>
        </div>
      </form>

      <form
        id="join-box"
        className="h-act h-act-join"
        onSubmit={(e) => {
          e.preventDefault();
          if (pin.length === 6) nav({ r: "join", pin });
        }}
      >
        <ActHead n="2" title="Join a live game" sub="Got a game PIN on the big screen? Type it here." />
        <label className="sr" htmlFor="h-pin">Game PIN</label>
        <input
          id="h-pin"
          className="h-pin num"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000000"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <button className="btn lime block" disabled={pin.length !== 6}>Enter game</button>
      </form>

      <form
        className="h-act h-act-vote"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === 6) nav({ r: "vote", code });
        }}
      >
        <ActHead n="3" title="Vote in a poll" sub="Town hall or training? Enter the poll code to have your say." />
        <label className="sr" htmlFor="h-code">Poll code</label>
        <input
          id="h-code"
          className="h-pin num"
          inputMode="numeric"
          autoComplete="off"
          placeholder="000000"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        <button className="btn white block" disabled={code.length !== 6}>Vote now</button>
      </form>
    </section>
  );
}

function ActHead({ n, title, sub }: { n: string; title: string; sub: string }) {
  return (
    <div className="h-act-h">
      <span className="h-act-n">{n}</span>
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
  );
}
