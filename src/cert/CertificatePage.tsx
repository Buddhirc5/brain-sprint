/* Printable certificate: #/t/:slug/cert/:gid[/:attempt]
   Only the signed-in player can see their own certificate (their card is loaded through the
   normal player session). "Download PDF / Print" uses the browser's print dialog with an
   A4-landscape print stylesheet (see styles/cert.css). */
import { useEffect, useState } from "react";
import { useApp, TenantProvider } from "../app/ctx";
import { Sprinty } from "../components/Chibi";
import { Icon } from "../components/ui";
import { sha256 } from "../lib/security";
import { useTenantPub } from "../pages/useTenantPub";
import { Loading } from "../App";
import { addMonths, fmtLongDate, scorePct } from "../player/common";
import { runKey } from "../types";
import "../styles/cert.css";

export function CertificatePage({ slug, gid, attempt }: { slug: string; gid: string; attempt?: number }) {
  const { pub, error } = useTenantPub(slug, "Certificate");
  if (error) return <Msg title="Can't load" text={error} slug="" />;
  if (pub === undefined) return <Loading text="Loading…" />;
  if (!pub) return <Msg title="Company not found" text="Check the link you were given." slug="" />;
  if (pub.status !== "active") return <Msg title="Paused" text={`${pub.branding.productName} is paused for ${pub.name}.`} slug="" />;
  return (
    <TenantProvider pub={pub} area="player" role={null}>
      <Certificate gid={gid} attempt={attempt && attempt > 1 ? attempt : 1} />
    </TenantProvider>
  );
}

function Msg({ title, text, slug, action }: { title: string; text: string; slug: string; action?: string }) {
  return (
    <div className="phone" style={{ paddingTop: 40 }}>
      <div className="card stack" style={{ textAlign: "center", justifyItems: "center" }}>
        <Sprinty mood="think" size={110} />
        <h2>{title}</h2>
        <p className="fine">{text}</p>
        <a className="btn primary" href={slug ? `#/t/${slug}` : "#/"}>
          {action || "Go back"}
        </a>
      </div>
    </div>
  );
}

/** A short, stable ID for this certificate: XXXX-XXXX-XXXX from a hash of company, player, exam and attempt. */
function useCertId(parts: string[] | null) {
  const [id, setId] = useState("");
  const k = parts?.join("|") || "";
  useEffect(() => {
    if (!k) return;
    let live = true;
    sha256("cert|" + k).then((h) => {
      if (live) setId(h.slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, "$1-"));
    });
    return () => {
      live = false;
    };
  }, [k]);
  return id;
}

function Certificate({ gid, attempt }: { gid: string; attempt: number }) {
  const { me, d, pub, tid, slug } = useApp();
  const g = d.games[gid];
  const run = me?.runs?.[runKey(gid, attempt)];
  const certId = useCertId(me && run?.passed ? [tid, me.uid, gid, String(attempt)] : null);

  if (!me) return <Msg title="Sign in to see your certificate" text={`Certificates are only shown to the person who earned them. Sign in to ${pub.branding.productName} first, then open this link again.`} slug={slug} action="Sign in" />;
  if (!d.loaded) return <Loading text="Loading your certificate…" />;
  if (!g || g.kind !== "cert") return <Msg title="Certificate not found" text="This exam doesn't exist any more, or the link is wrong." slug={slug} action="Back to the app" />;
  if (!run || run.status !== "done" || !run.passed)
    return <Msg title="No certificate yet" text={`Pass "${g.title}" to earn this certificate.`} slug={slug} action="Back to the app" />;

  const b = pub.branding;
  const title = g.cert?.certTitle || g.title;
  const validUntil = g.cert?.validMonths && run.finishedAt ? addMonths(run.finishedAt, g.cert.validMonths) : undefined;
  const expired = !!validUntil && validUntil < Date.now();
  const initials =
    b.productName
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "✓";

  return (
    <div className="cert-page">
      <div className="cert-bar no-print">
        <a className="btn ghost small" href={`#/t/${slug}`}>
          <Icon.back /> Back
        </a>
        <span className="grow" />
        <button type="button" className="btn primary small" onClick={() => window.print()}>
          Download PDF / Print
        </button>
      </div>
      <p className="fine no-print cert-tip">Tip: in the print dialog choose “Save as PDF” and landscape.</p>
      {expired && (
        <div className="banner red no-print">
          This certificate expired on {fmtLongDate(validUntil)}. Ask your admin about renewing it.
        </div>
      )}

      <article className="cert-sheet" aria-label={`Certificate: ${title}`}>
        <div className="cert-frame">
          <header className="cert-head">
            {b.logo ? <img className="cert-logo" src={b.logo} alt={pub.name} /> : <span className="cert-mark">{initials}</span>}
            <div>
              <div className="cert-org">{pub.name}</div>
              <div className="cert-prod">{b.productName}</div>
            </div>
          </header>

          <div className="cert-body">
            <div className="cert-kicker">Certificate of achievement</div>
            <p className="cert-this">This certifies that</p>
            <h1 className="cert-name">{me.name}</h1>
            <p className="cert-this">has successfully passed the exam</p>
            <h2 className="cert-title">{title}</h2>
            {g.cert?.certTitle && g.cert.certTitle !== g.title && <p className="cert-exam">{g.title}</p>}
          </div>

          <dl className="cert-meta">
            <div>
              <dt>Date passed</dt>
              <dd>{fmtLongDate(run.finishedAt)}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd>
                {scorePct(run)}% <small>(pass {g.cert?.passPct ?? 80}%)</small>
              </dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd>{validUntil ? fmtLongDate(validUntil) : "No expiry"}</dd>
            </div>
            <div>
              <dt>Certificate ID</dt>
              <dd className="cert-id">{certId || "…"}</dd>
            </div>
          </dl>

          <footer className="cert-foot">
            <div className="cert-sign">
              <span className="cert-line" />
              <span>Authorised signatory · {pub.name}</span>
            </div>
            <div className="cert-seal" aria-hidden="true">
              <span>{initials}</span>
              <small>Certified</small>
            </div>
          </footer>
        </div>
      </article>
    </div>
  );
}
