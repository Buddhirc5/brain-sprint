/* Phone app: install to the home screen, and push notifications.
   - Android, desktop Chrome and Edge offer a real install prompt (beforeinstallprompt).
   - iPhone and iPad have no prompt: people use Share → Add to Home Screen, so we show the steps.
     iOS only allows push in the installed app (iOS 16.4+).
   - The installed app opens on /#/app, which goes straight to the last company used on this device.
   - The single-file demo (opened from disk) can't register a service worker: everything here turns off. */
import { useEffect, useState } from "react";
import type { Api } from "../api/Api";
import { LS } from "./util";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

/** Service workers need https (or localhost). */
export function canSW(): boolean {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  return location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
}
export function standalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Call once at start-up, before React renders (the install event can fire early). */
export function initPwa() {
  if (!canSW()) return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini bar
    deferred = e as InstallEvent;
    ping();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    ping();
  });
  // a tapped notification asks the open app to go to its page
  navigator.serviceWorker.addEventListener("message", (e: MessageEvent) => {
    const m = e.data as { type?: string; url?: string } | null;
    if (m?.type !== "open" || !m.url) return;
    const u = new URL(m.url, location.href);
    if (u.origin === location.origin && u.hash) location.hash = u.hash === "#/app" ? appHash() : u.hash;
  });
  const reg = () => void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  if (document.readyState === "complete") reg();
  else window.addEventListener("load", reg, { once: true });
}

/* ---------------- the installed app's start page ---------------- */
const LAST = "aa.lastTenant";
/** Remember the company this device plays for (the installed app opens there). */
export function rememberTenant(slug: string) {
  LS.set(LAST, slug);
}
const appHash = () => {
  const s = LS.get(LAST);
  return s && /^[a-z0-9-]{3,32}$/.test(s) ? `#/t/${s}` : "#/";
};
/** The manifest starts the app on /#/app: swap that for this device's company before the router reads it. */
export function resolveAppStart() {
  if (location.hash === "#/app" || location.hash === "#/app/") history.replaceState(null, "", location.pathname + location.search + appHash());
}

/** On a company's player pages, point the manifest at /t/<slug>/manifest.webmanifest: its start page is "./",
 *  so the installed app opens on that company. (iPhone home-screen apps get fresh storage, so they can't
 *  look up "the last company" — the address has to carry it.) Vercel serves public/app.webmanifest there. */
export function useAppManifest(slug: string) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link || !canSW()) return;
    const before = link.getAttribute("href") || "/manifest.webmanifest";
    link.setAttribute("href", `/t/${encodeURIComponent(slug)}/manifest.webmanifest`);
    return () => link.setAttribute("href", before);
  }, [slug]);
}

/* ---------------- install ---------------- */
export type InstallWay = "installed" | "prompt" | "ios" | "none";
export function installWay(): InstallWay {
  if (standalone()) return "installed";
  if (deferred) return "prompt";
  if (isIOS() && canSW()) return "ios";
  return "none";
}
/** Show the browser's install dialog. True if they installed. */
export async function promptInstall(): Promise<boolean> {
  const d = deferred;
  if (!d) return false;
  deferred = null;
  await d.prompt();
  const c = await d.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  ping();
  return c.outcome === "accepted";
}
/** Re-renders when the install state changes. */
export function useInstallWay(): InstallWay {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    const mq = window.matchMedia?.("(display-mode: standalone)");
    mq?.addEventListener?.("change", f);
    return () => {
      subs.delete(f);
      mq?.removeEventListener?.("change", f);
    };
  }, []);
  return installWay();
}

/* ---------------- push notifications ---------------- */
const VAPID = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || "";
export type PushState = "on" | "off" | "blocked" | "needs-install" | "unsupported";

/** Real Web Push needs the server key; the demo shows notifications from the open app instead. */
export function pushAvailable(api: Api): boolean {
  if (!canSW() || !("Notification" in window)) return false;
  return api.mode === "demo" ? true : !!VAPID && "PushManager" in window;
}
const demoKey = (tid: string) => `aa.push.${tid}`;

export async function pushState(api: Api, tid: string): Promise<PushState> {
  if (!pushAvailable(api)) return isIOS() && !standalone() && canSW() ? "needs-install" : "unsupported";
  if (isIOS() && !standalone()) return "needs-install";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  if (api.mode === "demo") return LS.get(demoKey(tid)) === "1" ? "on" : "off";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission and subscribe this device. Returns the new state. */
export async function pushEnable(api: Api, tid: string): Promise<PushState> {
  if (!pushAvailable(api)) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "blocked" : "off";
  if (api.mode === "demo") {
    LS.set(demoKey(tid), "1");
    await api.pushSubscribe(tid, { endpoint: "demo:" + (api.user()?.id || "device"), keys: { p256dh: "demo", auth: "demo" } });
    return "on";
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlToBytes(VAPID) }));
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error("This browser didn't give a push address.");
  await api.pushSubscribe(tid, { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } });
  return "on";
}

export async function pushDisable(api: Api, tid: string): Promise<PushState> {
  if (api.mode === "demo") {
    LS.set(demoKey(tid), null);
    await api.pushUnsubscribe(tid, "demo:" + (api.user()?.id || "device")).catch(() => undefined);
    return "off";
  }
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api.pushUnsubscribe(tid, sub.endpoint).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return "off";
}

/** On each app start: make sure the server still has this device (a card may have moved devices, or the browser renewed the address). */
export async function pushResync(api: Api, tid: string) {
  if (!pushAvailable(api) || Notification.permission !== "granted" || api.mode === "demo") return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  const j = sub?.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
  if (j?.endpoint && j.keys?.p256dh && j.keys.auth) await api.pushSubscribe(tid, { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } }).catch(() => undefined);
}

/** Demo: show a notification from this tab (the demo has no push server). */
export async function showLocal(title: string, body: string, tag: string, url: string) {
  if (!canSW() || Notification.permission !== "granted") return;
  const reg = await navigator.serviceWorker.getRegistration();
  await reg?.showNotification(title, { body, tag, icon: "/icon-192.png", badge: "/badge-96.png", data: { url } }).catch(() => undefined);
}

/** Admin screens: can players on the live site turn notifications on? (the demo always can) */
export const pushConfigured = (api: Api) => api.mode === "demo" || !!VAPID;
/** The daily reminder's words — the same text the push function sends. */
export const dailyText = (product: string) => ({ title: `${product}: today's sprint is ready`, body: "Two minutes, one try. Keep your streak going 🔥" });
