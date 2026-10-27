/* Hall of Fame award: a small card in lists, and a full view with the shareable image.
   Only the winner (or, for a team win, its members) and admins can download or share the image. */
import { useEffect, useState } from "react";
import type { Branding, Gift, Player } from "../types";
import { Modal, confetti } from "./ui";
import { Chibi } from "./Chibi";

export interface AwardWho {
  name: string;
  unit?: string;
  player?: Player;
}
export const awardWho = (g: Gift, players: Record<string, Player>, pubName: (p?: Player) => string): AwardWho => {
  if (g.winner.startsWith("unit:")) return { name: g.winner.slice(5) };
  const p = players[g.winner];
  return { name: p ? pubName(p) : "Former player", unit: p?.unit, player: p };
};
/** Is this award the given player's (their own win, or a win for their branch / department)? */
export const isMine = (g: Gift, me?: Player) => !!me && (g.winner === me.uid || g.winner === `unit:${me.unit}`);

const TITLE: Record<Gift["kind"], string> = { weekly: "Champion", improved: "Most improved", branch: "Team champion" };
const shortTitle = (g: Gift) => {
  if (g.kind !== "weekly") return TITLE[g.kind];
  const r = Number(/#(\d+)/.exec(g.label)?.[1] || 1);
  return r === 1 ? "Champion" : `#${r} this week`;
};

/** The compact tile shown in the Hall of Fame row. */
export function AwardTile({ g, who, mine, onOpen }: { g: Gift; who: AwardWho; mine: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`aw-tile k-${g.kind}${mine ? " mine" : ""}`} onClick={onOpen} aria-label={`${shortTitle(g)}: ${who.name}, ${g.period}`}>
      <span className="aw-kind">{shortTitle(g)}</span>
      <span className="aw-fig" aria-hidden="true">
        {who.player ? <Chibi look={who.player.look} equipped={who.player.equipped} variant="bust" size={74} mood="happy" still /> : <span className="aw-cup">🏆</span>}
      </span>
      <b>{who.name}</b>
      <small>{g.period}</small>
      {mine && <span className="aw-you">You!</span>}
    </button>
  );
}

/** Full view: the card image, with Download / Share for the winner and admins. */
export function AwardModal({ g, who, company, branding, canSave, celebrate, onClose }: { g: Gift; who: AwardWho; company: string; branding: Branding; canSave: boolean; celebrate?: boolean; onClose: () => void }) {
  const [img, setImg] = useState<{ url: string; canvas: HTMLCanvasElement } | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let live = true;
    import("../lib/awardCard")
      .then((m) => m.drawAwardCard({ gift: g, name: who.name, unit: who.unit, look: who.player?.look, equipped: who.player?.equipped, company, branding }))
      .then((c) => live && setImg({ canvas: c, url: c.toDataURL("image/png") }))
      .catch(() => live && setErr("Couldn't draw the card on this device."));
    if (celebrate) confetti();
    return () => {
      live = false;
    };
  }, [g, who, company, branding, celebrate]);
  const file = () => `${who.name}-${g.period}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase() + ".png";
  const save = async () => {
    if (!img) return;
    (await import("../lib/awardCard")).downloadCard(img.canvas, file());
  };
  const share = async () => {
    if (!img) return;
    const m = await import("../lib/awardCard");
    const ok = await m.shareCard(img.canvas, file(), `${shortTitle(g)} · ${g.period} · ${company}`);
    if (!ok) {
      await m.downloadCard(img.canvas, file());
      setMsg("Sharing isn't available here, so the image was downloaded instead.");
    }
  };
  return (
    <Modal label={`${shortTitle(g)}: ${who.name}`} onClose={onClose} className="aw-modal">
      <div className="stack">
        {celebrate && <h3 className="aw-cheer">You won! 🏆</h3>}
        <div className="aw-img">{img ? <img src={img.url} alt={`Award card: ${shortTitle(g)}, ${who.name}, ${g.period}`} /> : <div className="aw-ph">{err || "Making your card…"}</div>}</div>
        {canSave ? (
          <div className="row aw-acts">
            <button type="button" className="btn primary grow" disabled={!img} onClick={share}>
              Share
            </button>
            <button type="button" className="btn ghost grow" disabled={!img} onClick={save}>
              Download
            </button>
          </div>
        ) : (
          <p className="fine" style={{ textAlign: "center" }}>
            Only the winner can download or share this card.
          </p>
        )}
        {msg && <p className="fine">{msg}</p>}
        <button type="button" className="link" style={{ justifySelf: "center" }} onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
