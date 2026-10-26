/* "Get the app" and "Turn on reminders" — one small card in the lobby, and a switch on the player card. */
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../app/ctx";
import { errMsg } from "../app/ApiCtx";
import { Modal } from "../components/ui";
import { LS } from "../lib/util";
import { promptInstall, pushDisable, pushEnable, pushState, useInstallWay, type PushState } from "../lib/pwa";

const SNOOZE = 14 * 864e5; // a dismissed card comes back after two weeks
const snoozed = (k: string) => Date.now() - Number(LS.get(k) || 0) < SNOOZE;

/** This device's notification state for the company, kept fresh. */
export function usePush() {
  const { api, tid } = useApp();
  const [state, setState] = useState<PushState | null>(null);
  const install = useInstallWay();
  useEffect(() => {
    let live = true;
    pushState(api, tid).then((s) => live && setState(s), () => live && setState("unsupported"));
    return () => {
      live = false;
    };
  }, [api, tid, install]);
  const set = useCallback(
    async (on: boolean) => {
      const s = on ? await pushEnable(api, tid) : await pushDisable(api, tid);
      setState(s);
      return s;
    },
    [api, tid],
  );
  return { state, set };
}

export function AppCard() {
  const { pub, toast } = useApp();
  const way = useInstallWay();
  const { state, set } = usePush();
  const [ios, setIos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);
  const name = pub.branding.productName || "Ant Arena";

  // 1) not installed yet: offer the app (on iPhone, installing is also what unlocks notifications)
  const showInstall = (way === "prompt" || way === "ios") && !snoozed("aa.card.install");
  // 2) installed (or a desktop browser): offer reminders
  const showPush = !showInstall && state === "off" && !snoozed("aa.card.push");
  if (!showInstall && !showPush) return null;

  const dismiss = () => {
    LS.set(showInstall ? "aa.card.install" : "aa.card.push", String(Date.now()));
    bump((n) => n + 1);
  };
  const install = async () => {
    if (way === "ios") return setIos(true);
    if (await promptInstall()) toast(`${name} is on your home screen`);
  };
  const remind = async () => {
    setBusy(true);
    try {
      const s = await set(true);
      if (s === "on") toast("Reminders on — we'll nudge you when a new sprint drops");
      else if (s === "blocked") toast("Notifications are blocked for this site. Allow them in your browser settings.");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="app-cta">
        <span className="seal" aria-hidden="true">
          {showInstall ? <PhoneIcon /> : <BellIcon />}
        </span>
        <span className="grow">
          <b>{showInstall ? "Get the app" : "Turn on reminders"}</b>
          <small>{showInstall ? `Add ${name} to your home screen: one tap to today's sprint${way === "ios" ? ", plus reminders" : ""}.` : "A nudge when a new sprint drops, and before your streak runs out."}</small>
        </span>
        <button type="button" className="btn primary small" onClick={showInstall ? install : remind} disabled={busy}>
          {showInstall ? (way === "ios" ? "How?" : "Install") : busy ? "…" : "Turn on"}
        </button>
        <button type="button" className="app-x" aria-label="Not now" onClick={dismiss}>
          ×
        </button>
      </div>
      {ios && <IosSteps name={name} onClose={() => setIos(false)} />}
    </>
  );
}

/** iPhone / iPad: there's no install button, so show the three taps. */
function IosSteps({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <Modal label={`Add ${name} to your home screen`} onClose={onClose}>
      <div className="stack ios-steps">
        <h3>Add {name} to your home screen</h3>
        <ol>
          <li>
            Tap <b>Share</b> <ShareIcon /> at the bottom of Safari (top right on iPad).
          </li>
          <li>
            Scroll down and tap <b>Add to Home Screen</b>.
          </li>
          <li>
            Tap <b>Add</b>. Open {name} from your home screen, then turn on reminders.
          </li>
        </ol>
        <p className="fine">Using Chrome on iPhone? Tap Share in the address bar, then Add to Home Screen.</p>
        <button type="button" className="btn primary block" onClick={onClose}>
          Got it
        </button>
      </div>
    </Modal>
  );
}

/** On the player card: switch reminders on or off for this device. */
export function ReminderSwitch() {
  const { toast } = useApp();
  const { state, set } = usePush();
  const [busy, setBusy] = useState(false);
  if (!state || state === "unsupported") return null;
  const flip = async () => {
    setBusy(true);
    try {
      const s = await set(state !== "on");
      if (s === "blocked") toast("Notifications are blocked for this site. Allow them in your browser settings.");
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="sw-row remind-row">
      <div>
        <b>Reminders on this phone</b>
        <span className="fine">
          {state === "needs-install"
            ? "Add the app to your home screen first (Share → Add to Home Screen), then switch this on."
            : state === "blocked"
              ? "Blocked in your browser settings. Allow notifications for this site to turn them on."
              : "New sprints, messages from your team, and a nudge before your streak ends."}
        </span>
      </div>
      <button type="button" role="switch" aria-checked={state === "on"} aria-label="Reminders on this phone" className="toggle" disabled={busy || state === "needs-install" || state === "blocked"} onClick={flip} />
    </div>
  );
}

const PhoneIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="2.5" width="12" height="19" rx="3" />
    <path d="M12 7.5v6m-2.6-2.6L12 13.5l2.6-2.6M10 18h4" />
  </svg>
);
const BellIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);
const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Share icon" role="img" style={{ verticalAlign: "-3px" }}>
    <path d="M12 3v12m-4-8 4-4 4 4" />
    <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </svg>
);
