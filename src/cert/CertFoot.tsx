/* The signature line and seal at the bottom of a certificate. Shared by the printable
   certificate and the live preview in the exam editor. Sizes use cqw, so the parent must be
   an inline-size container (.cert-sheet, or .cert-mini in the editor). */
import type { CSSProperties } from "react";
import { initialsOf, SEAL_COLORS, validMark } from "../lib/cert";
import type { CertSettings } from "../types";
import "../styles/certfoot.css";

export function CertFoot({ cert, org, product }: { cert?: CertSettings; org: string; product: string }) {
  const c = cert || ({} as Partial<CertSettings>);
  const col = SEAL_COLORS[c.sealColor || "ink"] || SEAL_COLORS.ink;
  const role = [c.signRole, org].filter(Boolean).join(" · ");
  return (
    <footer className="cert-foot">
      <div className="cert-sign">
        <span className="cert-line">
          {validMark(c.signImg) ? (
            <img className="cert-sig-img" src={c.signImg} alt={c.signName ? `Signature of ${c.signName}` : "Signature"} />
          ) : c.signName ? (
            <span className="cert-sig-typed" aria-hidden="true">{c.signName}</span>
          ) : null}
        </span>
        {c.signName && <b className="cert-sig-name">{c.signName}</b>}
        <span>{c.signName ? role : `Authorised signatory · ${org}`}</span>
      </div>
      {validMark(c.sealImg) ? (
        <img className="cert-stamp" src={c.sealImg} alt={`${org} seal`} />
      ) : (
        <div className="cert-seal" aria-hidden="true" style={{ "--seal-bg": col.bg, "--seal-ring": col.ring, "--seal-ink": col.text } as CSSProperties}>
          <span>{c.sealText || initialsOf(product)}</span>
          <small>{c.sealLabel || "Certified"}</small>
        </div>
      )}
    </footer>
  );
}
