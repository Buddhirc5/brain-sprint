/* A watcher = fetch a view from the server, then re-fetch when Realtime says
   something changed (debounced and rate-limited), plus a slow safety poll
   (faster when the Realtime channel is not connected — e.g. free-tier
   connection limit reached, or the network dropped). Nothing is fetched while
   the tab is hidden (phone locked, another tab in front): a change seen then
   is fetched once the page is visible again. */
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { ApiError } from "../Api";
import { toApiError } from "./errors";

export interface Binding {
  table: string;
  filter?: string; // e.g. "tenant_id=eq.t-123"
}

export interface WatchOpts<T> {
  sb: SupabaseClient;
  name: string;
  fetch: () => Promise<T | null | undefined>;
  cb: (v: T) => void;
  onErr?: (e: ApiError) => void;
  /** tables to listen to; function form lets the watcher decide after the first load (e.g. admins only) */
  bindings?: Binding[] | ((first: T) => Binding[]);
  debounceMs: number; // wait this long after a change before fetching (coalesces bursts)
  minGapMs: number; // never fetch more often than this
  pollMs: number; // safety poll while Realtime is connected (or when there are no bindings)
  fastPollMs?: number; // poll while Realtime is NOT connected
}

export interface Watcher {
  stop: () => void;
  kick: () => void; // fetch soon
}

let seq = 0;
const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

export function watch<T>(o: WatchOpts<T>): Watcher {
  let alive = true;
  let busy = false;
  let again = false;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let ch: RealtimeChannel | null = null;
  let live = false;
  let first = true;
  let stale = false; // something changed while the tab was hidden

  const schedule = (debounce = o.debounceMs) => {
    if (!alive || timer) return;
    const wait = Math.max(debounce, last + o.minGapMs - Date.now(), 0);
    timer = setTimeout(() => {
      timer = null;
      if (hidden() && !first) stale = true;
      else void run();
    }, wait);
  };

  const subscribe = (bs: Binding[]) => {
    if (!bs.length || ch) return;
    ch = o.sb.channel(`${o.name}:${++seq}:${Math.random().toString(36).slice(2, 8)}`);
    for (const b of bs)
      ch.on("postgres_changes", { event: "*", schema: "public", table: b.table, ...(b.filter ? { filter: b.filter } : {}) }, () => schedule());
    ch.subscribe((status) => {
      const was = live;
      live = status === "SUBSCRIBED";
      if (live && !was) schedule(0); // (re)connected: catch up on anything missed
    });
  };

  const run = async () => {
    if (!alive) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    last = Date.now();
    try {
      const v = await o.fetch();
      if (alive && v != null) {
        if (first) {
          first = false;
          const bs = typeof o.bindings === "function" ? o.bindings(v) : o.bindings || [];
          subscribe(bs);
        }
        o.cb(v);
      }
    } catch (e) {
      if (alive) o.onErr?.(toApiError(e));
    } finally {
      busy = false;
      if (again && alive) {
        again = false;
        schedule();
      }
    }
  };

  const tick = () => {
    if (!alive) return;
    const every = ch && !live ? o.fastPollMs ?? o.pollMs : o.pollMs;
    pollTimer = setTimeout(() => {
      if (!hidden() && Date.now() - last >= every - 50) schedule(0);
      tick();
    }, every);
  };
  const onVis = () => {
    if (hidden() || !alive) return;
    const every = ch && !live ? o.fastPollMs ?? o.pollMs : o.pollMs;
    if (stale || Date.now() - last >= every) {
      stale = false;
      schedule(0);
    }
  };
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);

  if (Array.isArray(o.bindings)) subscribe(o.bindings);
  void run();
  tick();

  return {
    stop: () => {
      alive = false;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
      if (timer) clearTimeout(timer);
      if (pollTimer) clearTimeout(pollTimer);
      if (ch) void o.sb.removeChannel(ch);
      ch = null;
    },
    kick: () => schedule(0),
  };
}
