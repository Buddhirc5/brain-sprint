/* Profile quiz: take it (one question per screen, no timer, no right answers), then the reveal.
   The result is private: only this player and the company's admins see it. */
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { errMsg } from "../app/ApiCtx";
import { ProfileIcon, TRAIT_COLORS, iconPath } from "../components/ProfileIcon";
import { typeOf, whyLines } from "../lib/profile";
import type { Game, ProfileMeta, ProfileResult } from "../types";
import { TopBar } from "./common";

export function ProfilePlay({ gid }: { gid: string }) {
  const { d, api, tid, go } = useApp();
  const g = d.games[gid];
  const [mine, setMine] = useState<ProfileResult | null | undefined>(undefined);
  useEffect(() => {
    api.profileMine(tid).then((m) => setMine(m[gid] || null), () => setMine(null));
  }, [api, tid, gid]);
  if (!g || g.kind !== "profile" || !g.profile) {
    return (
      <div className="phone">
        <TopBar title="Profile" back={() => go({ v: "lobby" })} />
        <div className="empty">This quiz isn&apos;t available.</div>
      </div>
    );
  }
  if (mine === undefined) return <div className="phone"><TopBar title={g.title} back={() => go({ v: "lobby" })} /></div>;
  return mine ? <ProfileResultView g={g} r={mine} /> : <Taker g={g} onDone={setMine} />;
}

function Taker({ g, onDone }: { g: Game; onDone: (r: ProfileResult) => void }) {
  const { api, tid, go, toast } = useApp();
  const meta = g.profile!;
  const [step, setStep] = useState(-1); // -1 = intro
  const [picks, setPicks] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const n = g.questions.length;
  const q = g.questions[step];

  const choose = async (k: number) => {
    const next = [...picks];
    next[step] = k;
    setPicks(next);
    if (step < n - 1) return void setTimeout(() => setStep(step + 1), 180);
    setBusy(true);
    try {
      const [r] = await Promise.all([api.profileSubmit(tid, g.id, next), new Promise((res) => setTimeout(res, 1600))]); // let the "reading you" moment play
      onDone(r);
    } catch (e) {
      toast(errMsg(e));
      setBusy(false);
    }
  };

  if (busy) return <Reading meta={meta} />;
  if (step < 0) {
    return (
      <div className="phone pf">
        <TopBar title="Profile" back={() => go({ v: "lobby" })} />
        <section className="pf-intro">
          <Orbit meta={meta} />
          <h1>{g.title}</h1>
          <p>{meta.intro || g.desc || "No right or wrong answers. Go with your first instinct."}</p>
          <ul className="pf-facts">
            <li><b className="num">{n}</b> questions</li>
            <li><b className="num">{Math.max(2, Math.round(n * 0.15))}</b> minutes</li>
            <li><b>One</b> try</li>
          </ul>
          <p className="fine">Only you and your admins see your result.</p>
          <button type="button" className="btn primary block" onClick={() => setStep(0)}>
            Start
          </button>
        </section>
      </div>
    );
  }
  return (
    <div className="phone pf">
      <div className="pf-top">
        <button type="button" className="icon-btn" aria-label={step ? "Previous question" : "Back to intro"} onClick={() => setStep(step - 1)}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <div className="pf-dots" role="progressbar" aria-valuemin={1} aria-valuemax={n} aria-valuenow={step + 1} aria-label={`Question ${step + 1} of ${n}`}>
          {g.questions.map((x, i) => <i key={x.id} className={i < step ? "done" : i === step ? "now" : ""} />)}
        </div>
        <span className="pf-count num">{step + 1}/{n}</span>
      </div>
      <section className="pf-q" key={q.id}>
        <h2>{q.q}</h2>
        <div className={`pf-opts ${q.options!.length === 5 && q.options![0] === "Strongly disagree" ? "scale" : ""}`}>
          {q.options!.map((o, k) => (
            <button type="button" key={k} className={`pf-opt ${picks[step] === k ? "on" : ""}`} onClick={() => choose(k)} style={{ animationDelay: `${k * 50}ms` }}>
              <span className="pf-letter">{"ABCDEF"[k]}</span>
              <span>{o}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/** Trait icons circling the centre (intro and the "reading you" moment). */
function Orbit({ meta, spin }: { meta: ProfileMeta; spin?: boolean }) {
  const n = meta.traits.length;
  return (
    <div className={`pf-orbit ${spin ? "spin" : ""}`} aria-hidden="true">
      <span className="pf-core" />
      {meta.traits.map((t, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return (
          <span key={t.name} className="pf-sat" style={{ left: `${50 + Math.cos(a) * 40}%`, top: `${50 + Math.sin(a) * 40}%`, color: TRAIT_COLORS[i % 6], animationDelay: `${i * 90}ms` }}>
            <ProfileIcon name={t.icon} size={22} />
          </span>
        );
      })}
    </div>
  );
}

function Reading({ meta }: { meta: ProfileMeta }) {
  return (
    <div className="phone pf">
      <section className="pf-reading" role="status">
        <Orbit meta={meta} spin />
        <h2>Reading your answers…</h2>
        <p className="fine">Weighing {meta.traits.map((t) => t.name).join(", ")}</p>
      </section>
    </div>
  );
}

/** Radar chart of the traits. */
function Radar({ meta, r }: { meta: ProfileMeta; r: ProfileResult }) {
  const n = meta.traits.length;
  const pt = (i: number, v: number) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [100 + Math.cos(a) * v * 0.78, 100 + Math.sin(a) * v * 0.78];
  };
  // scaled to the strongest trait so the shape fills the chart (the bars below show the true percentages)
  const top = Math.max(1, ...r.pct);
  const sc = (v: number) => Math.max(8, (v / top) * 100);
  const shape = r.pct.map((v, i) => pt(i, sc(v)).join(",")).join(" ");
  return (
    <svg className="pf-radar" viewBox="0 0 200 200" role="img" aria-label={meta.traits.map((t, i) => `${t.name} ${r.pct[i]}%`).join(", ")}>
      {[100, 66, 33].map((v) => <polygon key={v} points={meta.traits.map((_, i) => pt(i, v).join(",")).join(" ")} className="pf-ring" />)}
      {meta.traits.map((_, i) => <line key={i} x1="100" y1="100" x2={pt(i, 100)[0]} y2={pt(i, 100)[1]} className="pf-spoke" />)}
      <polygon points={shape} className="pf-shape" />
      {r.pct.map((v, i) => {
        const [x, y] = pt(i, sc(v));
        return <circle key={i} cx={x} cy={y} r={r.top.includes(i) ? 5 : 3.5} fill={TRAIT_COLORS[i % 6]} />;
      })}
      {meta.traits.map((t, i) => {
        const [x, y] = pt(i, 122);
        return (
          <g key={t.name} transform={`translate(${x - 10} ${y - 10})`} color={TRAIT_COLORS[i % 6]}>
            <circle cx="10" cy="10" r="13" fill="#fff" />
            <svg x="0" y="0" width="20" height="20" viewBox="0 0 24 24"><path d={iconPath(t.icon)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </g>
        );
      })}
    </svg>
  );
}

export function ProfileResultView({ g, r, admin }: { g: Game; r: ProfileResult; admin?: { name: string; onClose: () => void } }) {
  const { go, pub, me } = useApp();
  const meta = g.profile!;
  const t = typeOf(meta, r);
  const [a, b] = r.top;
  const why = useMemo(() => whyLines(meta, r), [meta, r]);
  const order = r.pct.map((_, i) => i).sort((x, y) => r.pct[y] - r.pct[x]);
  const [shareMsg, setShareMsg] = useState("");
  const share = async (dl: boolean) => {
    const m = await import("../lib/profileCard");
    const c = await m.drawProfileCard({ g, r, name: admin?.name || me?.name || "", company: pub.name, branding: pub.branding });
    const file = `${t.name}.png`.replace(/[^a-z0-9.]+/gi, "-").toLowerCase();
    const aw = await import("../lib/awardCard");
    if (dl || !(await aw.shareCard(c, file, `I'm ${t.name} — ${g.title}`))) {
      await aw.downloadCard(c, file);
      if (!dl) setShareMsg("Sharing isn't available here, so the card was downloaded.");
    }
  };
  return (
    <div className="phone pf">
      <TopBar title={admin ? admin.name : "Your profile"} back={admin ? admin.onClose : () => go({ v: "lobby" })} />
      <section className="pf-hero" style={{ ["--ca" as string]: TRAIT_COLORS[a % 6], ["--cb" as string]: TRAIT_COLORS[b % 6] }}>
        <div className="pf-badges" aria-hidden="true">
          <span className="pf-badge a"><ProfileIcon name={meta.traits[a].icon} size={34} /></span>
          <span className="pf-badge b"><ProfileIcon name={meta.traits[b].icon} size={30} /></span>
        </div>
        <small className="pf-kicker">{admin ? `${admin.name} is` : "You're"}</small>
        <h1>{t.name}</h1>
        <p className="pf-role">Like a <b>{t.role}</b></p>
        <p className="pf-line">{t.line}</p>
        <div className="pf-pair">
          <span><ProfileIcon name={meta.traits[a].icon} size={16} /> {meta.traits[a].name}</span>
          <i>+</i>
          <span><ProfileIcon name={meta.traits[b].icon} size={16} /> {meta.traits[b].name}</span>
        </div>
      </section>

      <section className="pf-card">
        <h3>Your shape</h3>
        <Radar meta={meta} r={r} />
        <div className="pf-bars">
          {order.map((i, k) => (
            <div key={i} className={`pf-bar ${r.top.includes(i) ? "top" : ""}`} style={{ ["--c" as string]: TRAIT_COLORS[i % 6] }}>
              <span className="pf-bi"><ProfileIcon name={meta.traits[i].icon} size={18} /></span>
              <div className="pf-bt">
                <div className="pf-bn"><b>{meta.traits[i].name}</b><span className="num">{r.pct[i]}%</span></div>
                <div className="pf-track"><span style={{ width: `${r.pct[i]}%`, animationDelay: `${k * 90}ms` }} /></div>
                <small>{meta.traits[i].desc}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pf-card">
        <h3>How we worked it out</h3>
        <ol className="pf-why">
          {why.map((l, i) => (
            <li key={i} className={i === why.length - 1 ? (r.mixed ? "warn" : "ok") : ""}>{l}</li>
          ))}
        </ol>
        <p className="fine">Each answer adds weight to one or two traits. Your two strongest traits decide your profile.</p>
      </section>

      {(t.strengths?.length || t.watch?.length || t.work?.length) && (
        <section className="pf-trio">
          {t.strengths?.length ? <Notes title="Strengths" tone="good" items={t.strengths} /> : null}
          {t.watch?.length ? <Notes title="Watch out for" tone="warn" items={t.watch} /> : null}
          {t.work?.length ? <Notes title={admin ? "How to work with them" : "How to work with you"} tone="info" items={t.work} /> : null}
        </section>
      )}

      {!admin && (
        <div className="row pf-share">
          <button type="button" className="btn primary grow" onClick={() => void share(false)}>Share my card</button>
          <button type="button" className="btn ghost grow" onClick={() => void share(true)}>Download</button>
        </div>
      )}
      {shareMsg && <p className="fine">{shareMsg}</p>}
      <p className="fine pf-note">A self-reflection tool for growth and teamwork, not a clinical or hiring test.</p>
    </div>
  );
}

function Notes({ title, tone, items }: { title: string; tone: "good" | "warn" | "info"; items: string[] }) {
  return (
    <div className={`pf-notes ${tone}`}>
      <h4>{title}</h4>
      <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
