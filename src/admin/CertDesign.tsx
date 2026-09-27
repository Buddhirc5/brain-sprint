/* Exam editor: who signs the certificate, and what the seal looks like — with a live preview. */
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useApp } from "../app/ctx";
import { CertFoot } from "../cert/CertFoot";
import { MAX_MARK_CHARS, SEAL_COLORS, initialsOf } from "../lib/cert";
import { compressImage } from "../lib/image";
import type { CertSettings, SealColor } from "../types";

export function CertDesign({ cert, setCert }: { cert: CertSettings; setCert: (p: Partial<CertSettings>) => void }) {
  const { pub } = useApp();
  const [drawing, setDrawing] = useState(false);
  return (
    <section className="panel">
      <div className="panel-h">
        <div>
          <h2>Signature &amp; seal</h2>
          <p>Printed at the bottom of every certificate from this exam</p>
        </div>
      </div>

      <div className="cert-mini" aria-label="Preview of the certificate signature and seal">
        <CertFoot cert={cert} org={pub.name} product={pub.branding.productName} />
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="cSignName">Signed by</label>
          <input className="inp" id="cSignName" value={cert.signName || ""} maxLength={60} onChange={(e) => setCert({ signName: e.target.value })} placeholder="e.g. Jane Perera" />
        </div>
        <div className="field">
          <label htmlFor="cSignRole">Job title</label>
          <input className="inp" id="cSignRole" value={cert.signRole || ""} maxLength={60} onChange={(e) => setCert({ signRole: e.target.value })} placeholder="e.g. Head of Learning" />
        </div>
      </div>

      <div className="field">
        <span className="flabel">Signature</span>
        {drawing ? (
          <SignPad
            onDone={(img) => {
              if (img) setCert({ signImg: img });
              setDrawing(false);
            }}
          />
        ) : (
          <div className="row">
            <button type="button" className="btn ghost tiny" onClick={() => setDrawing(true)}>✍️ Draw signature</button>
            <ImagePick label={cert.signImg ? "Replace with an image" : "Upload signature image"} maxDim={600} onPick={(signImg) => setCert({ signImg })} />
            {cert.signImg && <button type="button" className="link danger" onClick={() => setCert({ signImg: undefined })}>Remove signature</button>}
          </div>
        )}
        <span className="fine">{cert.signImg ? "Using your signature image." : cert.signName ? "No image yet — the name is written in a handwriting style." : "Tip: a PNG with a transparent background looks best."}</span>
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="cSealText">Seal letters</label>
          <input className="inp" id="cSealText" value={cert.sealText || ""} maxLength={4} onChange={(e) => setCert({ sealText: e.target.value.toUpperCase() })} placeholder={initialsOf(pub.branding.productName)} disabled={!!cert.sealImg} />
        </div>
        <div className="field">
          <label htmlFor="cSealLabel">Seal wording</label>
          <input className="inp" id="cSealLabel" value={cert.sealLabel || ""} maxLength={18} onChange={(e) => setCert({ sealLabel: e.target.value })} placeholder="Certified" disabled={!!cert.sealImg} />
        </div>
      </div>
      {!cert.sealImg && (
        <div className="field">
          <span className="flabel">Seal colour</span>
          <div className="seal-swatches" role="radiogroup" aria-label="Seal colour">
            {(Object.keys(SEAL_COLORS) as SealColor[]).map((k) => {
              const c = SEAL_COLORS[k];
              const on = (cert.sealColor || "ink") === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} className={`seal-sw ${on ? "on" : ""}`} onClick={() => setCert({ sealColor: k })} title={c.label}>
                  <i style={{ background: c.bg, boxShadow: `inset 0 0 0 3px ${c.ring}` }} />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="field">
        <span className="flabel">Company stamp (optional)</span>
        <div className="row">
          <ImagePick label={cert.sealImg ? "Replace stamp" : "Upload your own stamp"} maxDim={500} onPick={(sealImg) => setCert({ sealImg })} />
          {cert.sealImg && <button type="button" className="link danger" onClick={() => setCert({ sealImg: undefined })}>Use the drawn seal instead</button>}
        </div>
        <span className="fine">Replaces the drawn seal. Use a round PNG with a transparent background.</span>
      </div>
    </section>
  );
}

function ImagePick({ label, maxDim, onPick }: { label: string; maxDim: number; onPick: (img: string) => void }) {
  const { toast } = useApp();
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onPick(await compressImage(file, maxDim, { alpha: true, maxChars: MAX_MARK_CHARS }));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add that image.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr" tabIndex={-1} aria-hidden="true" onChange={(e) => void pick(e.target.files?.[0])} />
      <button type="button" className="btn ghost tiny" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Processing…" : label}</button>
    </>
  );
}

/** Draw a signature with a finger, pen or mouse. Saved as a transparent image, trimmed to the ink. */
function SignPad({ onDone }: { onDone: (img: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);
  const W = 720, H = 240;

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1E2F5C";
    ctx.lineWidth = 5;
  }, []);

  const pos = (e: RPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = pos(e);
  };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx || !last.current) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!inked) setInked(true);
  };
  const up = () => {
    last.current = null;
  };
  const clear = () => {
    ref.current?.getContext("2d")?.clearRect(0, 0, W, H);
    setInked(false);
  };
  const save = () => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !inked) return onDone(null);
    // trim to the ink so the signature sits neatly on the line
    const { data } = ctx.getImageData(0, 0, W, H);
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (data[(y * W + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 < x0) return onDone(null);
    const pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    const out = document.createElement("canvas");
    out.width = x1 - x0 + 1;
    out.height = y1 - y0 + 1;
    out.getContext("2d")?.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    let url = out.toDataURL("image/png");
    if (url.length > MAX_MARK_CHARS) url = out.toDataURL("image/webp", 0.8);
    onDone(url.length <= MAX_MARK_CHARS ? url : null);
  };

  return (
    <div className="signpad">
      <canvas
        ref={ref}
        width={W}
        height={H}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        aria-label="Signature pad: draw your signature here"
        role="img"
      />
      <span className="signpad-hint" aria-hidden="true">{inked ? "" : "Sign here"}</span>
      <div className="row">
        <button type="button" className="btn primary tiny" onClick={save} disabled={!inked}>Use this signature</button>
        <button type="button" className="btn ghost tiny" onClick={clear} disabled={!inked}>Clear</button>
        <button type="button" className="link" onClick={() => onDone(null)}>Cancel</button>
      </div>
    </div>
  );
}
