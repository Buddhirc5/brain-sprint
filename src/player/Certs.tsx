import { useMemo } from "react";
import { useApp } from "../app/ctx";
import { Mascot } from "../components/Chibi";
import { Icon } from "../components/ui";
import { isOpen, isScheduled, sortGames } from "../lib/games";
import { limitMs } from "../lib/scoring";
import { fmtDate, fmtMin } from "../lib/util";
import type { Game } from "../types";
import { certHref, certInfo, fmtLongDate, TopBar } from "./common";

/** Certification exams: status, attempts, and a link to each certificate earned. */
export function Certs() {
  const { d, go, features } = useApp();
  const certs = useMemo(
    () => sortGames(Object.values(d.games)).filter((g) => g.kind === "cert" && (g.status === "live" || g.status === "closed")),
    [d.games],
  );
  return (
    <div className="phone">
      <TopBar title="Certifications" back={() => go({ v: "lobby" })} />
      <section className="certs-hero">
        <div>
          <h1>Get certified</h1>
          <p>Timed exams with a pass mark. Answers stay hidden until you finish. Pass to earn a certificate you can download.</p>
        </div>
        <Mascot mood="think" size={96} />
      </section>
      {!features.cert ? (
        <div className="empty">Certifications are turned off.</div>
      ) : certs.length ? (
        <div className="games">
          {certs.map((g) => (
            <CertCard key={g.id} g={g} />
          ))}
        </div>
      ) : (
        <div className="empty">No certification exams yet.</div>
      )}
    </div>
  );
}

function CertCard({ g }: { g: Game }) {
  const { me, go, slug } = useApp();
  const info = certInfo(me, g);
  const c = g.cert;
  const open = isOpen(g);
  const n = g.questions.length;
  let status: { cls: string; text: string };
  if (info.passed && info.expired) status = { cls: "warn", text: `Expired ${fmtLongDate(info.validUntil)}` };
  else if (info.passed) status = { cls: "good", text: `Passed ${fmtLongDate(info.passed.finishedAt)}` };
  else if (info.playing) status = { cls: "info", text: "In progress" };
  else if (info.attempt && !info.left) status = { cls: "bad", text: "No attempts left" };
  else if (info.attempt) status = { cls: "warn", text: `Not passed yet · best ${info.best}%` };
  else if (isScheduled(g)) status = { cls: "none", text: `Opens ${fmtDate(g.date)}` };
  else if (!open) status = { cls: "none", text: "Closed" };
  else status = { cls: "none", text: "Not started" };
  const passedN = info.passed ? info.runs.indexOf(info.passed) + 1 : 0;

  return (
    <article className="cert-card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <h3>{g.title}</h3>
        <span className={`sev ${status.cls}`}>{status.text}</span>
      </div>
      {c?.certTitle && <p className="fine">Earns: {c.certTitle}</p>}
      {g.desc && <p className="desc">{g.desc}</p>}
      <div className="meta">
        <span className="chip">
          {n} question{n > 1 ? "s" : ""}
        </span>
        <span className="chip">{fmtMin(limitMs(g) / 60000)}</span>
        <span className="chip">Pass {c?.passPct ?? 80}%</span>
        <span className="chip">
          {info.attempt}/{info.max} attempt{info.max > 1 ? "s" : ""} used
        </span>
        {c?.validMonths ? <span className="chip">Valid {c.validMonths} months</span> : null}
        {g.until && <span className="chip">Closes {fmtDate(g.until)}</span>}
      </div>
      <div className="row">
        {info.passed ? (
          <>
            <a className="btn primary small" href={certHref(slug, g.id, passedN)}>
              <Icon.trophy /> Certificate
            </a>
            <button type="button" className="btn ghost small" onClick={() => go({ v: "results", gid: g.id })}>
              Result
            </button>
          </>
        ) : info.playing && open ? (
          <button type="button" className="btn primary" onClick={() => go({ v: "play", gid: g.id })}>
            Continue exam
          </button>
        ) : open && info.left > 0 ? (
          <>
            <button type="button" className="btn primary" onClick={() => go({ v: "play", gid: g.id })} aria-label={`${info.attempt ? "Retake" : "Start"} ${g.title}`}>
              {info.attempt ? `Try again (${info.left} left)` : "Start exam"}
            </button>
            {info.attempt > 0 && (
              <button type="button" className="btn ghost small" onClick={() => go({ v: "results", gid: g.id })}>
                Last result
              </button>
            )}
          </>
        ) : info.attempt ? (
          <button type="button" className="btn ghost small" onClick={() => go({ v: "results", gid: g.id })}>
            See result
          </button>
        ) : null}
      </div>
      {!info.attempt && open && <p className="fine">The clock runs for the whole exam once you start, and keeps running if you leave.</p>}
    </article>
  );
}
