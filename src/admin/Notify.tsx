/* Phone notifications: message players (everyone or one branch/department), the daily reminder, and what was sent. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../app/ctx";
import { errMsg } from "../app/ApiCtx";
import { cleanText } from "../lib/security";
import { dailyText, pushConfigured } from "../lib/pwa";
import type { PushOverview } from "../types";
import { SwitchRow, useLiveTenant } from "./common";

const T_MAX = 60;
const B_MAX = 180;

export function Notify() {
  const { d, api, tid, approve, toast, players } = useApp();
  const { branding } = useLiveTenant();
  const product = branding.productName || "Ant Arena";
  const [ov, setOv] = useState<PushOverview | null>(null);
  const [title, setTitle] = useState(product);
  const [body, setBody] = useState("");
  const [unit, setUnit] = useState("");
  const daily = d.cfg.push ?? { daily: true, hour: 17 };
  const ready = pushConfigured(api);

  const load = useCallback(() => {
    api.pushOverview(tid).then(setOv, (e) => toast(errMsg(e)));
  }, [api, tid, toast]);
  useEffect(load, [load]);

  const units = useMemo(() => {
    const s = new Set<string>([...d.cfg.branches, ...d.cfg.departments, ...players.map((p) => p.unit)]);
    return [...s].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [d.cfg.branches, d.cfg.departments, players]);

  const ideas = [
    ["New sprint", "Today's sprint is live. Two minutes, one try. Go!"],
    ["Live game", "Live quiz game starts in 10 minutes. Have your phone ready!"],
    ["Certification", "Your certification closes on Friday. Pass it to get your certificate."],
    ["Winners", "This week's winners are in the Hall of Fame. Are you on it?"],
  ] as const;

  const send = (msg: { title: string; body: string; unit?: string; daily?: boolean }, what: string) =>
    approve({
      label: `Send "${msg.title}" to ${what} now? Players with reminders on get it on their phone straight away.`,
      yes: "Send now",
      run: async () => {
        const r = await api.pushSend(tid, msg);
        toast(r.sent ? `Sent to ${r.sent} device${r.sent === 1 ? "" : "s"}${r.failed ? ` · ${r.failed} couldn't be reached` : ""}` : "Sent — but nobody in that group has reminders on yet");
        setBody("");
        load();
      },
    });
  const t = cleanText(title, T_MAX).trim();
  const b = cleanText(body, B_MAX).trim();

  const saveDaily = async (next: { daily: boolean; hour: number }) => {
    try {
      await api.saveConfig(tid, { ...d.cfg, push: next });
      toast(next.daily ? `Daily reminder on at ${hourLabel(next.hour)}` : "Daily reminder off");
    } catch (e) {
      toast(errMsg(e));
    }
  };

  return (
    <>
      <div className="toolbar">
        <h1>Notify</h1>
      </div>
      <p className="fine">
        Send a notification to players' phones. Only people who turned on reminders get them (in the app: <b>Turn on reminders</b>, or the switch on their player card).
      </p>
      {!ready && (
        <div className="banner">
          <b>One-time setup needed.</b> Phone notifications need a Web Push key on the server. Your developer runs <code>node scripts/vapid.mjs</code> and follows <code>supabase/README.md</code> → <i>Phone notifications</i>. Until then players won't see the reminders switch.
        </div>
      )}

      <div className="grid3 notify-stats">
        <section className="panel stat-tile">
          <b className="num">{ov ? ov.players : "–"}</b>
          <span>{ov?.players === 1 ? "player" : "players"} with reminders on</span>
        </section>
        <section className="panel stat-tile">
          <b className="num">{ov ? ov.devices : "–"}</b>
          <span>{ov?.devices === 1 ? "device" : "devices"}</span>
        </section>
        <section className="panel stat-tile">
          <b className="num">{players.length ? `${Math.round(((ov?.players || 0) / players.length) * 100)}%` : "–"}</b>
          <span>of {players.length} players</span>
        </section>
      </div>

      <div className="grid2">
        <section className="panel">
          <div className="panel-h">
            <div>
              <h2>Send a message</h2>
              <p>Arrives as a phone notification. Tapping it opens the app.</p>
            </div>
          </div>
          <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
            {ideas.map(([k, v]) => (
              <button key={k} type="button" className="btn ghost small" onClick={() => setBody(v)}>
                {k}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="n-title">Title</label>
            <input className="inp" id="n-title" value={title} maxLength={T_MAX} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="n-body">
              Message <span className="fine">{body.length}/{B_MAX}</span>
            </label>
            <textarea className="inp" id="n-body" rows={3} value={body} maxLength={B_MAX} placeholder="Today's sprint is live. Two minutes, one try. Go!" onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="n-unit">Send to</label>
            <select className="sel" id="n-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              <option value="">Everyone</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <Preview title={t || product} body={b || "Your message appears here."} />
          <div className="row end">
            <button className="btn primary" disabled={!t || !b} onClick={() => send({ title: t, body: b, unit: unit || undefined }, unit || "everyone")}>
              Send now
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-h">
            <div>
              <h2>Daily reminder</h2>
              <p>"{dailyText(product).title}". Only goes to players who still have a sprint or story to play that day.</p>
            </div>
          </div>
          <SwitchRow title="Send every day" text={`At ${hourLabel(daily.hour)}, company time.`} on={daily.daily} onChange={(v) => void saveDaily({ ...daily, daily: v })}>
            <select className="sel" style={{ marginTop: 8, maxWidth: 160 }} aria-label="Reminder time" value={daily.hour} disabled={!daily.daily} onChange={(e) => void saveDaily({ ...daily, hour: Number(e.target.value) })}>
              {Array.from({ length: 15 }, (_, i) => i + 7).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </SwitchRow>
          <p className="fine" style={{ marginTop: 10 }}>
            {api.mode === "demo" ? "The demo has no clock to send it on, so use the button below to try it." : "Sent automatically by the server once a day (see supabase/README.md → Phone notifications)."}
          </p>
          <div className="row end">
            <button className="btn ghost small" onClick={() => send({ ...dailyText(product), daily: true }, `players who haven't played today`)}>
              Send today's reminder now
            </button>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-h">
          <div>
            <h2>Sent</h2>
            <p>The last 100 notifications</p>
          </div>
        </div>
        {ov?.sends.length ? (
          <div className="scroll-x">
            <table className="tbl">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Message</th>
                  <th>To</th>
                  <th>Devices</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {ov.sends.map((s) => (
                  <tr key={s.id}>
                    <td className="num">{new Date(s.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>
                      <b>{s.title}</b>
                      <div className="fine">{s.body}</div>
                    </td>
                    <td>{s.daily ? `Daily reminder${s.unit ? ` · ${s.unit}` : ""}` : s.unit || "Everyone"}</td>
                    <td className="num">
                      {s.sent}
                      {s.failed ? <span className="fine"> · {s.failed} failed</span> : null}
                    </td>
                    <td>{s.auto ? "Schedule" : s.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="fine">Nothing sent yet.</p>
        )}
      </section>
    </>
  );
}

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** What the notification looks like on a phone. */
function Preview({ title, body }: { title: string; body: string }) {
  return (
    <div className="notif-prev" aria-label="Preview">
      <img src="/icon-192.png" alt="" width={36} height={36} />
      <div>
        <div className="np-top">
          <b>{title}</b>
          <span>now</span>
        </div>
        <p>{body}</p>
      </div>
    </div>
  );
}
