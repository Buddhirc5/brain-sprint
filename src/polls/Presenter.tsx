/* Projector view for a live poll: join instructions + QR, the current slide's
   results live, and presenter controls (keyboard: ←/→ slides, L lock, P phones,
   H hide results, F fullscreen, Q big QR). Hosts and above only. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApi } from "../app/ApiCtx";
import { absUrl, href } from "../app/router";
import { qrDataUrl } from "../lib/qr";
import { Icon } from "../components/ui";
import { Mascot } from "../components/Chibi";
import { Loading } from "../App";
import { useTenantPub } from "../pages/useTenantPub";
import type { Poll, PollResponse, Role, TenantPublic } from "../types";
import { Ico, Results, SlideImage, TYPE_META, TypeIcon, fmtCode, stageVars, useResults } from "./shared";
import { isContentSlide } from "../api/engine";
import { StageModeToggle, useStageMode } from "../app/stageTheme";

const RANK: Record<Role, number> = { viewer: 0, host: 1, editor: 2, admin: 3, owner: 4 };

export function Presenter({ slug, pollId }: { slug: string; pollId: string }) {
  const { api, user } = useApi();
  const { pub, error } = useTenantPub(slug, "Present");
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!pub) return;
    if (!user || user.anonymous) return setAllowed(false);
    let live = true;
    setAllowed(undefined);
    api.access(pub.id).then(
      (a) => live && setAllowed(!!a.role && RANK[a.role] >= RANK.host),
      () => live && setAllowed(false),
    );
    return () => {
      live = false;
    };
  }, [api, pub, user]);

  if (error) return <Gate title="Can't load" text={error} />;
  if (pub === undefined || (pub && allowed === undefined)) return <Loading text="Opening the presenter…" />;
  if (!pub) return <Gate title="Company not found" text="Check the link you were given." />;
  if (!allowed)
    return (
      <Gate title="Sign in to present" text={`Presenting polls needs a Host (or higher) admin account at ${pub.name}.`}>
        <a className="btn primary" href={href({ r: "admin", slug, tab: "polls" })}>
          Sign in to the admin portal
        </a>
      </Gate>
    );
  return <Stage pub={pub} pollId={pollId} />;
}

function Gate({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="phone" style={{ paddingTop: 40 }}>
      <div className="card stack" style={{ textAlign: "center", justifyItems: "center" }}>
        <Mascot mood="think" size={110} />
        <h2>{title}</h2>
        <p className="fine">{text}</p>
        {children}
      </div>
    </div>
  );
}

function Stage({ pub, pollId }: { pub: TenantPublic; pollId: string }) {
  const { api, run, toast } = useApi();
  const [poll, setPoll] = useState<Poll | null | undefined>(undefined);
  const [hideRes, setHideRes] = useState(false);
  const [bigQr, setBigQr] = useState(false);
  const [fs, setFs] = useState(!!document.fullscreenElement);
  const [undo, setUndo] = useState<PollResponse | null>(null);

  useEffect(() => {
    let got = false;
    const un = api.watchPoll(pollId, (p) => {
      got = true;
      setPoll(p);
    });
    const t = setTimeout(() => !got && setPoll(null), 6000);
    return () => {
      un();
      clearTimeout(t);
    };
  }, [api, pollId]);

  useEffect(() => {
    const f = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const slide = poll?.slides[poll.current];
  const r = useResults(api, poll?.id, slide && !isContentSlide(slide.type) ? slide.id : undefined);
  const [mode, toggleMode] = useStageMode();
  const vars = useMemo(() => stageVars(pub.branding, mode), [pub.branding, mode]);

  const ctl = useCallback((patch: Parameters<typeof api.pollControl>[1]) => void run(() => api.pollControl(pollId, patch)), [api, pollId, run]);
  const go = useCallback(
    (d: number) => {
      if (!poll) return;
      const n = poll.current + d;
      if (n < 0 || n >= poll.slides.length) return;
      ctl({ current: n });
    },
    [poll, ctl],
  );
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => toast("Full screen isn't available in this browser."));
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!poll || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const k = e.key;
      if (k === "ArrowRight" || k === "PageDown" || (k === " " && t.tagName !== "BUTTON")) {
        e.preventDefault();
        go(1);
      } else if (k === "ArrowLeft" || k === "PageUp") {
        e.preventDefault();
        go(-1);
      } else if (k === "l" || k === "L") ctl({ locked: !poll.locked });
      else if (k === "p" || k === "P") ctl({ showResults: !poll.showResults });
      else if (k === "h" || k === "H") setHideRes((v) => !v);
      else if (k === "f" || k === "F") toggleFs();
      else if (k === "q" || k === "Q") setBigQr((v) => !v);
      else if (k === "t" || k === "T") toggleMode();
      else if (k === "Escape") setBigQr(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [poll, go, ctl, toggleFs, toggleMode]);

  if (poll === undefined) return <Loading text="Loading poll…" />;
  if (!poll)
    return <Gate title="Poll not found" text="It may have been deleted." />;

  const joinUrl = absUrl({ r: "vote", code: poll.code }) + `?t=${encodeURIComponent(pub.slug)}`;
  const shortUrl = absUrl({ r: "vote" }).replace(/^https?:\/\//, "");
  const open = poll.status === "open";
  const n = r?.n ?? 0;
  const moderate = {
    onAnswered: (q: PollResponse) => void run(() => api.qaModerate(poll.id, q.id, { answered: !q.answered })),
    onHide: async (q: PollResponse) => {
      const ok = await run(async () => {
        await api.qaModerate(poll.id, q.id, { hidden: true });
        return true;
      });
      if (ok) setUndo(q);
    },
  };

  return (
    <div className={`pl-stage pl-st ${mode}`} style={vars}>
      <header className="pl-top">
        <div className="pl-brand">
          {pub.branding.logo ? <img src={pub.branding.logo} alt="" /> : null}
          <span>{pub.branding.productName}</span>
        </div>
        <div className="pl-join" aria-live="polite">
          {open ? (
            <>
              Go to <b>{shortUrl}</b> and enter <b className="code num">{fmtCode(poll.code)}</b>
            </>
          ) : (
            <span className="closed">
              {poll.status === "draft" ? "Not started — the audience can't join yet" : "Poll closed — voting is off"}
              <button type="button" className="btn lime small" onClick={() => ctl({ status: "open" })}>
                <Ico.play /> Open voting
              </button>
            </span>
          )}
        </div>
        <button type="button" className="pl-qr" onClick={() => setBigQr(true)} aria-label="Show a large QR code" title="Show a large QR code (Q)">
          <img src={qrDataUrl(joinUrl, 4, 1)} alt="" />
        </button>
      </header>

      <main className="pl-main">
        {!slide ? (
          <div className="pl-empty">
            <Mascot mood="think" size={140} />
            <b>This poll has no slides yet.</b>
          </div>
        ) : (
          <>
            <div className="pl-kind">
              <TypeIcon t={slide.type} />
              {TYPE_META[slide.type].label}
              {slide.type === "rank" ? " · Borda points (1st place = most)" : ""}
              {slide.type === "mc" && slide.multi ? " · multiple answers allowed" : ""}
              {slide.type === "guess" && slide.numAnswer != null && !poll.locked ? " · lock voting (L) to reveal the answer" : ""}
            </div>
            <div className="pl-qrow">
              <h1 className={`pl-prompt ${slide.prompt.length > 90 ? "long" : ""} ${slide.type === "text" ? "big" : ""}`}>{slide.prompt}</h1>
              <SlideImage slide={slide} className="pl-qimg" />
            </div>
            <div className={`pl-res t-${slide.type}`} key={slide.id}>
              {hideRes && slide.type !== "qa" && !isContentSlide(slide.type) ? (
                <div className="pl-hidden">
                  <span className="big num">{n}</span>
                  <span>{n === 1 ? "response" : "responses"} so far — results hidden</span>
                </div>
              ) : (
                <Results slide={slide} r={r} qa={slide.type === "qa" ? moderate : undefined} spotlight reveal={poll.locked} />
              )}
            </div>
          </>
        )}
      </main>

      <footer className="pl-bar">
        <div className="grp">
          <button type="button" className="pl-btn" onClick={() => go(-1)} disabled={poll.current <= 0} aria-label="Previous slide (←)" title="Previous slide (←)">
            <Ico.prev />
          </button>
          <div className="pl-dots" aria-label={`Slide ${poll.current + 1} of ${poll.slides.length}`}>
            {poll.slides.map((s, i) => (
              <button key={s.id} type="button" className={i === poll.current ? "on" : ""} onClick={() => ctl({ current: i })} title={`${i + 1}. ${s.prompt}`} aria-label={`Go to slide ${i + 1}`}>
                <TypeIcon t={s.type} />
              </button>
            ))}
          </div>
          <button type="button" className="pl-btn" onClick={() => go(1)} disabled={poll.current >= poll.slides.length - 1} aria-label="Next slide (→)" title="Next slide (→)">
            <Ico.next />
          </button>
          <span className="pl-count num" title="People who answered this slide">
            <Icon.user /> {n}
          </span>
        </div>
        <div className="grp">
          <Toggle on={poll.locked} onClick={() => ctl({ locked: !poll.locked })} label={poll.locked ? "Voting locked" : "Lock voting"} hint="L" icon={poll.locked ? <Icon.lock /> : <Icon.unlock />} />
          <Toggle on={poll.showResults} onClick={() => ctl({ showResults: !poll.showResults })} label={poll.showResults ? "Results on phones" : "Phones: hidden"} hint="P" icon={<Ico.phone />} />
          <Toggle on={hideRes} onClick={() => setHideRes(!hideRes)} label={hideRes ? "Results hidden" : "Hide results"} hint="H" icon={hideRes ? <Ico.eyeOff /> : <Icon.eye />} />
          {open ? (
            <button type="button" className="pl-tg danger" onClick={() => ctl({ status: "closed" })}>
              <Ico.stop /> <span>Close poll</span>
            </button>
          ) : (
            <button type="button" className="pl-tg on" onClick={() => ctl({ status: "open" })}>
              <Ico.play /> <span>Open poll</span>
            </button>
          )}
          <StageModeToggle mode={mode} onToggle={toggleMode} className="pl-btn" />
          <button type="button" className="pl-btn" onClick={toggleFs} aria-label={fs ? "Exit full screen (F)" : "Full screen (F)"} title={fs ? "Exit full screen (F)" : "Full screen (F)"}>
            <Icon.full />
          </button>
          <a className="pl-btn" href={href({ r: "admin", slug: pub.slug, tab: "polls" })} aria-label="Exit presenter" title="Exit presenter">
            <Icon.close />
          </a>
        </div>
      </footer>

      {undo && (
        <div className="pl-undo" role="status">
          Question hidden.
          <button
            type="button"
            onClick={() => {
              const q = undo;
              setUndo(null);
              void run(() => api.qaModerate(poll.id, q.id, { hidden: false }));
            }}
          >
            Undo
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => setUndo(null)}>
            <Icon.close />
          </button>
        </div>
      )}

      {bigQr && (
        <div className="pl-qrbig" onClick={() => setBigQr(false)} role="dialog" aria-label="Join with this QR code">
          <div className="box" onClick={(e) => e.stopPropagation()}>
            <img src={qrDataUrl(joinUrl, 10, 2)} alt={`QR code for ${joinUrl}`} />
            <div className="txt">
              <span>Scan, or go to</span>
              <b>{shortUrl}</b>
              <span>and enter</span>
              <b className="code num">{fmtCode(poll.code)}</b>
              <button type="button" className="btn white small" onClick={() => setBigQr(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, label, hint, icon }: { on: boolean; onClick: () => void; label: string; hint: string; icon: JSX.Element }) {
  return (
    <button type="button" className={`pl-tg ${on ? "on" : ""}`} aria-pressed={on} onClick={onClick} title={`${label} (${hint})`}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
