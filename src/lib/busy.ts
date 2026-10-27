/* Tracks admin writes in flight (save, delete, send…) so one loader can show for all of them.
   Wraps the Api: each matching call counts while its promise runs. Reads, polling and player answers are left alone. */
import { useEffect, useState } from "react";
import type { Api } from "../api/Api";

const WRITE = /^(save|set|delete|remove|admin|import|invite|purge|buy|updateMyCard|pushSend|pushGift|liveCreate|liveControl|liveDelete|pollControl|qaModerate|joinKeySet|superCreate|superUpdate|superDelete|superInvite|superSave|superReset|changeMyPassword)/;
const VERB: [RegExp, string][] = [
  [/^(delete|remove|purge|liveDelete|superDelete)/, "Deleting"],
  [/^(push|invite|superInvite)/, "Sending"],
  [/^(import)/, "Importing"],
  [/^(liveCreate|superCreate)/, "Creating"],
  [/^(buy)/, "Buying"],
  [/^(liveControl|pollControl)/, "Updating"],
];

let pending: { id: number; verb: string }[] = [];
let seq = 0;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

export function trackApi(api: Api): Api {
  return new Proxy(api, {
    get(target, key, recv) {
      const v = Reflect.get(target, key, recv);
      if (typeof v !== "function" || typeof key !== "string" || !WRITE.test(key)) return typeof v === "function" ? v.bind(target) : v;
      return (...args: unknown[]) => {
        const r = v.apply(target, args);
        if (!(r instanceof Promise)) return r;
        const job = { id: ++seq, verb: VERB.find(([re]) => re.test(key))?.[1] || "Saving" };
        pending = [...pending, job];
        ping();
        const done = () => {
          pending = pending.filter((x) => x !== job);
          ping();
        };
        r.then(done, done);
        return r;
      };
    },
  });
}

/** The newest write still running, or null. Shown only after a short delay so fast saves don't flash. */
export function useBusy(delay = 180): string | null {
  const [, bump] = useState(0);
  const [late, setLate] = useState(false);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  const cur = pending[pending.length - 1];
  useEffect(() => {
    setLate(false);
    if (!cur) return;
    const t = setTimeout(() => setLate(true), delay);
    return () => clearTimeout(t);
  }, [cur?.id, delay]);
  return cur && late ? cur.verb : null;
}
