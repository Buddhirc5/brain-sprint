/* Live quiz — the player's phone. PIN → company brand → join as your player card
   (or a nickname when the host allows guests) → a big-button controller that follows
   the host's screen. Correctness is only shown once the host reveals the answer. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useApi, errMsg } from "../app/ApiCtx";
import { useTenantPub } from "../pages/useTenantPub";
import { href, nav } from "../app/router";
import { isDemo } from "../api/demo/guard";
import { ApiError } from "../api/Api";
import { Chibi, Sprinty } from "../components/Chibi";
import { CountUp, Icon, confetti } from "../components/ui";
import { Loading } from "../App";
import type { LivePlayer, LiveSession, Player, TenantPublic } from "../types";
import { Shape, TILES, fmtPts, optionsOf, ordinal, remainingMs, tileOf, useNow } from "./common";
import "../styles/live.css";

type Found = { sessionId: string; tenantId: string; slug: string; title: string; guests: boolean; pin: string };
const MINE = "bs.live.me"; // this tab's live player per session (survives reloads)

function readMine(sid: string): string | null {
  try {
    const m = JSON.parse(sessionStorage.getItem(MINE) || "{}") as Record<string, string>;
    return m[sid] || null;
  } catch {
    return null;
  }
}
function saveMine(sid: string, lpid: string | null) {
  try {
    const m = JSON.parse(sessionStorage.getItem(MINE) || "{}") as Record<string, string>;
    if (lpid) m[sid] = lpid;
    else delete m[sid];
    sessionStorage.setItem(MINE, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function JoinPage({ pin }: { pin?: string }) {
  const { api, user } = useApi();
  const [ready, setReady] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // identity: players join anonymously unless already signed in. ?fresh=1 (demo) = a separate player per tab.
  useEffect(() => {
    let live = true;
    (async () => {
      const fresh = /[?&]fresh=1/.test(location.hash);
      let done = false;
      try {
        done = sessionStorage.getItem("bs.live.fresh") === "1";
      } catch {
        /* ignore */
      }
      if (fresh && isDemo(api) && !done) {
        await api.demoFreshTab();
        try {
          sessionStorage.setItem("bs.live.fresh", "1");
        } catch {
          /* ignore */
        }
      } else if (!api.user()) await api.signInAnonymous();
      if (live) setReady(true);
    })().catch((e) => live && (setErr(errMsg(e)), setReady(true)));
    return () => {
      live = false;
    };
  }, [api]);

  const find = useCallback(
    async (p: string) => {
      setErr("");
      setBusy(true);
      try {
        const f = await api.liveFind(p);
        if (!f) setErr("We couldn't find a game with that PIN. Check the big screen and try again.");
        else setFound({ ...f, pin: p });
      } catch (e) {
        setErr(errMsg(e));
      }
      setBusy(false);
    },
    [api],
  );
  useEffect(() => {
    if (ready && pin && /^\d{6}$/.test(pin) && !found) void find(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pin]);

  if (!ready || (pin && busy && !found)) return <Loading text="Finding your game…" />;
  if (found && user) return <Joined found={found} onLeave={() => (setFound(null), nav({ r: "join" }))} />;
  return <PinEntry initial={pin} err={err} busy={busy} onSubmit={(p) => void find(p)} />;
}

function PinEntry({ initial, err, busy, onSubmit }: { initial?: string; err: string; busy: boolean; onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState(initial && /^\d{0,6}$/.test(initial) ? initial : "");
  return (
    <div className="lv-phone lv-enter">
      <form
        className="lv-pinform"
        onSubmit={(e) => {
          e.preventDefault();
          if (pin.length === 6) onSubmit(pin);
        }}
      >
        <Sprinty mood="happy" size={120} />
        <h1>Join a live game</h1>
        <label className="sr" htmlFor="lv-pin">
          Game PIN
        </label>
        <input
          id="lv-pin"
          className="lv-pininput num"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          placeholder="Game PIN"
          value={pin}
          autoFocus
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <button className="btn primary block lv-big" disabled={pin.length !== 6 || busy}>
          {busy ? "Looking…" : "Enter"}
        </button>
        <p className="fine">The 6-digit PIN is on the host's screen.</p>
      </form>
      <a className="link" href="#/">
        Home
      </a>
    </div>
  );
}

/* ---------------- after the PIN: brand + identity ---------------- */
function Joined({ found, onLeave }: { found: Found; onLeave: () => void }) {
  const { pub, error } = useTenantPub(found.slug, "Live");
  if (error) return <Msg title="Can't load" text={error} />;
  if (pub === undefined) return <Loading text="Loading…" />;
  if (!pub) return <Msg title="Game not found" text="This game's company isn't available." />;
  return <JoinFlow found={found} pub={pub} onLeave={onLeave} />;
}

function Msg({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="lv-phone">
      <div className="card stack" style={{ textAlign: "center", justifyItems: "center" }}>
        <Sprinty mood="sad" size={110} />
        <h2>{title}</h2>
        <p className="fine">{text}</p>
        {children}
      </div>
    </div>
  );
}

function JoinFlow({ found, pub, onLeave }: { found: Found; pub: TenantPublic; onLeave: () => void }) {
  const { api } = useApi();
  const [card, setCard] = useState<Player | null | undefined>(undefined);
  const [lpid, setLpid] = useState<string | null>(() => readMine(found.sessionId));
  const [nick, setNick] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.myPlayer(found.tenantId).then(
      (p) => live && setCard(p),
      () => live && setCard(null),
    );
    return () => {
      live = false;
    };
  }, [api, found.tenantId]);

  const join = async (n?: string) => {
    setErr("");
    setBusy(true);
    try {
      const r = await api.liveJoin(found.sessionId, n);
      saveMine(found.sessionId, r.livePlayerId);
      setLpid(r.livePlayerId);
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  };

  if (lpid)
    return (
      <Controller
        found={found}
        pub={pub}
        lpid={lpid}
        onGone={() => {
          saveMine(found.sessionId, null);
          setLpid(null);
        }}
        onLeave={onLeave}
      />
    );
  if (card === undefined) return <Loading text="Checking who you are…" />;

  const head = (
    <div className="lv-joinhead">
      {pub.branding.logo && <img src={pub.branding.logo} alt="" />}
      <span className="lv-lbl">{pub.branding.productName}</span>
      <h1>{found.title}</h1>
    </div>
  );

  if (card)
    return (
      <div className="lv-phone lv-enter">
        {head}
        <div className="lv-meCard">
          <Chibi look={card.look} equipped={card.equipped} variant="full" size={170} mood="cheer" />
          <b>{card.name}</b>
          <span className="fine">
            {card.unit} · playing with your player card
          </span>
        </div>
        {err && (
          <p className="err" role="alert">
            {err}
          </p>
        )}
        <button type="button" className="btn lime block lv-big" disabled={busy} onClick={() => void join()}>
          {busy ? "Joining…" : "Let's go!"}
        </button>
        <button type="button" className="link" onClick={onLeave}>
          Not this game
        </button>
      </div>
    );

  if (found.guests)
    return (
      <div className="lv-phone lv-enter">
        {head}
        <form
          className="lv-pinform"
          onSubmit={(e) => {
            e.preventDefault();
            void join(nick.trim());
          }}
        >
          <label className="lv-lbl" htmlFor="lv-nick">
            Pick a nickname
          </label>
          <input id="lv-nick" className="lv-pininput" maxLength={16} autoComplete="nickname" placeholder="Nickname" value={nick} autoFocus onChange={(e) => setNick(e.target.value)} />
          {err && (
            <p className="err" role="alert">
              {err}
            </p>
          )}
          <button className="btn primary block lv-big" disabled={busy || nick.trim().length < 2}>
            {busy ? "Joining…" : "OK, go!"}
          </button>
          <p className="fine">
            Keep it friendly — everyone sees it on the big screen. Have a {pub.branding.productName} player card?{" "}
            <a className="link" href={href({ r: "tenant", slug: pub.slug })}>
              Sign in
            </a>{" "}
            first to play as yourself.
          </p>
        </form>
      </div>
    );

  return (
    <div className="lv-phone lv-enter">
      {head}
      <div className="card stack" style={{ textAlign: "center", justifyItems: "center" }}>
        <Sprinty mood="think" size={110} />
        <h2>Sign in to {pub.branding.productName} first</h2>
        <p className="fine">
          This game is for {pub.name} players. Sign in with your player card, then come back here — the PIN is <b className="num">{found.pin}</b>.
        </p>
        <a className="btn primary block" href={href({ r: "tenant", slug: pub.slug })}>
          Sign in to {pub.branding.productName}
        </a>
        <button type="button" className="link" onClick={onLeave}>
          Use a different PIN
        </button>
      </div>
    </div>
  );
}

/* ---------------- the controller ---------------- */
type PView = { session: LiveSession; me: LivePlayer | null; rank: number; count: number; answered: boolean; lastOk: boolean | null; ahead?: { nick: string; score: number } | null };

function Controller({ found, pub, lpid, onGone, onLeave }: { found: Found; pub: TenantPublic; lpid: string; onGone: () => void; onLeave: () => void }) {
  const { api, toast } = useApi();
  const [v, setV] = useState<PView | null>(null);
  const [picked, setPicked] = useState<{ q: number; c: string } | null>(null);
  const [late, setLate] = useState(-1); // qIndex we were too late for
  const [sending, setSending] = useState(false);
  const everMe = useRef(false);

  useEffect(() => {
    document.body.classList.add("lv-body");
    return () => document.body.classList.remove("lv-body");
  }, []);
  useEffect(() => api.watchLivePlayer(found.sessionId, lpid, setV), [api, found.sessionId, lpid]);
  if (v?.me) everMe.current = true;

  const s = v?.session;
  const now = useNow(s?.state === "question", 100);
  const left = remainingMs(s, now);
  const q = s?.question;

  // local memory of my pick for this question (survives reloads within the tab)
  useEffect(() => {
    if (!s) return;
    try {
      const raw = sessionStorage.getItem(`bs.live.pick.${s.id}`);
      if (raw) {
        const p = JSON.parse(raw) as { q: number; c: string };
        if (p.q === s.qIndex) setPicked(p);
      }
    } catch {
      /* ignore */
    }
  }, [s?.id, s?.qIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = async (c: string) => {
    if (!s || sending) return;
    const qi = s.qIndex;
    setSending(true);
    setPicked({ q: qi, c });
    try {
      sessionStorage.setItem(`bs.live.pick.${s.id}`, JSON.stringify({ q: qi, c }));
    } catch {
      /* ignore */
    }
    try {
      navigator.vibrate?.(30);
    } catch {
      /* ignore */
    }
    try {
      await api.liveAnswer(found.sessionId, lpid, qi, c);
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") {
        /* already answered (e.g. a double tap) — keep the lock */
      } else {
        setPicked(null);
        if (e instanceof ApiError && e.code === "closed") setLate(qi);
        else toast(errMsg(e));
      }
    }
    setSending(false);
  };

  // reveal feedback: buzz + confetti for a right answer
  const revealKey = s && (s.state === "reveal" ? `r${s.qIndex}` : s.state === "ended" ? "end" : "");
  useEffect(() => {
    if (!v || !revealKey) return;
    if (revealKey === "end") {
      if (v.rank > 0 && v.rank <= 3) confetti(v.rank === 1 ? 220 : 140);
      return;
    }
    if (v.lastOk) {
      try {
        navigator.vibrate?.([40, 40, 80]);
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  if (!v || !s) return <Loading text="Connecting…" />;

  // removed by the host (or the game was reset)
  if (!v.me && s.state !== "ended")
    return (
      <Msg title={everMe.current ? "You were removed" : "Not in this game yet"} text={everMe.current ? "The host removed you from this game." : "Join again to play."}>
        <button type="button" className="btn primary" onClick={onGone}>
          Join again
        </button>
      </Msg>
    );
  const me = v.me;
  const top = (
    <header className="lv-ptop">
      <span className="lv-pbrand">
        {pub.branding.logo && <img src={pub.branding.logo} alt="" />}
        {s.state === "lobby" || s.state === "ended" ? pub.branding.productName : `${s.qIndex + 1} of ${s.total}`}
      </span>
      <span className="lv-pscore num">{me ? fmtPts(me.score) : ""}</span>
    </header>
  );
  const foot = me && (
    <footer className="lv-pfoot">
      <Chibi look={me.look} size={36} still />
      <b>{me.nick}</b>
      {me.streak >= 2 && (s.state !== "question" || !v.answered) && (
        <span className="lv-streak sm">
          <Icon.fire /> {me.streak}
        </span>
      )}
    </footer>
  );

  let body: JSX.Element;
  let tone = "ink";
  if (s.state === "lobby") {
    tone = "brand";
    body = (
      <div className="lv-pmsg">
        {me && <Chibi look={me.look} variant="full" size={200} mood="cheer" />}
        <h1>You're in!</h1>
        <p>See your name on the screen? Get ready…</p>
      </div>
    );
  } else if (s.state === "question") {
    const opts = optionsOf(q);
    const locked = v.answered || (picked && picked.q === s.qIndex);
    const timeUp = left <= 0 || late === s.qIndex;
    if (locked) {
      const pi = picked && picked.q === s.qIndex ? opts.findIndex((o) => o.choice === picked.c) : -1;
      body = (
        <div className="lv-pmsg">
          {pi >= 0 ? (
            <span className="lv-mypick" style={{ background: TILES[tileOf(q, pi)].color }}>
              <Shape i={tileOf(q, pi)} size={56} />
            </span>
          ) : (
            <Sprinty mood="think" size={120} />
          )}
          <h1>Answer locked in</h1>
          <p>Fingers crossed… wait for the big screen.</p>
        </div>
      );
    } else if (timeUp) {
      body = (
        <div className="lv-pmsg">
          <Sprinty mood="sad" size={120} />
          <h1>Time's up!</h1>
          <p>Be quicker on the next one.</p>
        </div>
      );
    } else {
      body = (
        <div className="lv-pq">
          <div className="lv-pbar" aria-hidden="true">
            <span style={{ transform: `scaleX(${s.qSeconds ? left / (s.qSeconds * 1000) : 0})` }} />
          </div>
          <p className="lv-pqtext">{q?.q}</p>
          <div className={`lv-pads n${opts.length}`}>
            {opts.map((o, i) => {
              const t = tileOf(q, i);
              return (
                <button key={o.choice} type="button" className="lv-pad" style={{ background: TILES[t].color }} disabled={sending} onClick={() => void answer(o.choice)} aria-label={`${TILES[t].name}: ${o.label}`}>
                  <Shape i={t} size={64} />
                  <span className="tx">{o.label}</span>
                </button>
              );
            })}
          </div>
          <span className="lv-psecs num" aria-live="off">
            {Math.ceil(left / 1000)}s
          </span>
        </div>
      );
    }
  } else if (s.state === "reveal" || s.state === "board") {
    const ok = v.lastOk === true;
    const answeredIt = v.answered;
    tone = s.state === "board" ? "ink" : ok ? "good" : "bad";
    body =
      s.state === "reveal" ? (
        <div className="lv-pmsg lv-verdict">
          <span className="lv-vicon">{ok ? <Icon.check /> : <Icon.close />}</span>
          <h1>{ok ? "Correct!" : answeredIt ? "Not this time" : "Time's up"}</h1>
          {ok ? (
            <>
              <b className="lv-pts num">
                +<CountUp to={me?.lastPts || 0} ms={700} />
              </b>
              {(me?.streak || 0) >= 2 && (
                <span className="lv-streak big">
                  <Icon.fire /> Answer streak {me?.streak}
                </span>
              )}
            </>
          ) : (
            <p>{answeredIt ? "Shake it off — the next one's yours." : "No answer this time."}</p>
          )}
          <p className="lv-prank">{v.rank > 0 && `You're in ${ordinal(v.rank)} place`}</p>
        </div>
      ) : (
        <div className="lv-pmsg">
          {me && <Chibi look={me.look} variant="full" size={160} mood={v.rank <= 3 ? "cheer" : "idle"} />}
          <h1>You're {ordinal(v.rank)}</h1>
          <p>
            {v.rank === 1 ? "Top of the board — hold on to it!" : v.ahead && me ? `${Math.max(0, v.ahead.score - me.score).toLocaleString()} behind ${v.ahead.nick} — keep going!` : `Out of ${v.count} players. Keep going!`}
          </p>
          <b className="lv-pts sm num">{me ? fmtPts(me.score) : 0} pts</b>
        </div>
      );
  } else {
    // ended
    tone = v.rank > 0 && v.rank <= 3 ? "brand" : "ink";
    body = (
      <div className="lv-pmsg">
        {me && <Chibi look={me.look} variant="full" size={180} mood={v.rank <= 3 ? "cheer" : "happy"} />}
        <h1>{me ? (v.rank === 1 ? "You won!" : v.rank <= 3 ? `${ordinal(v.rank)} place!` : `${ordinal(v.rank)} place`) : "Game over"}</h1>
        {me && (
          <p>
            <b className="num">{fmtPts(me.score)}</b> points · {v.count} players
          </p>
        )}
        <div className="lv-endbtns">
          <a className="btn white" href={href({ r: "tenant", slug: pub.slug })}>
            Open {pub.branding.productName}
          </a>
          <button type="button" className="link" onClick={onLeave}>
            Join another game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`lv-player tone-${tone} st-${s.state}`}>
      {top}
      <main className="lv-pmain" key={`${s.state}-${s.qIndex}`}>
        {body}
      </main>
      {foot}
    </div>
  );
}
