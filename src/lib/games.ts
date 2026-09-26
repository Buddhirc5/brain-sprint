import type { CardColor, Game } from "../types";
import { todayKey } from "./util";

export const COLORS: CardColor[] = ["lime", "orange", "pink", "blue", "blush", "ink"];
export const COLOR_HEX: Record<CardColor, string> = { lime: "#C6F432", orange: "#FF5A1F", pink: "#FF7EB6", blue: "#3D7BFF", blush: "#EDBFAA", ink: "#141414" };
export const DARK_CARDS: CardColor[] = ["orange", "ink", "blue"];
export const MINUTE_OPTS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 7, 10];

export const sortGames = (gs: Game[]) =>
  gs.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (a.order ?? 0) - (b.order ?? 0) || (b.createdAt || 0) - (a.createdAt || 0));

export function isOpen(g: Game, t = todayKey()) {
  return g.status === "live" && (!g.date || g.date <= t) && (!g.until || g.until >= t);
}
export const isScheduled = (g: Game) => g.status === "live" && !!g.date && g.date > todayKey();

export function statusOf(g: Game): { key: string; label: string } {
  if (isScheduled(g)) return { key: "sched", label: "Scheduled" };
  const m: Record<string, string> = { draft: "Draft", pending: "Awaiting approval", live: "Live", closed: "Closed" };
  return { key: g.status, label: m[g.status] || g.status };
}
