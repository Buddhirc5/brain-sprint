/* Arena Map: built automatically from the company's existing quizzes and each player's existing runs.
   Nothing is stored. Daily quizzes become stops in date order, every LAND_SIZE stops make a themed land,
   certifications stand as castles where their date falls, and each land ends in a chest. */
import { isOpen } from "./games";
import { runCorrect, validRuns } from "./scoring";
import type { Disqualified, Game, Player } from "../types";

export const LAND_SIZE = 5;

export type StopState = "done" | "play" | "missed" | "locked";
export type CastleState = "passed" | "open" | "out" | "locked";

export interface MapStop { kind: "stop"; g: Game; n: number; state: StopState; stars: 0 | 1 | 2 | 3 }
export interface MapCastle { kind: "castle"; g: Game; state: CastleState }
export interface MapChest { kind: "chest"; open: boolean; full: boolean }
export interface MapGate { kind: "gate" }
export type MapItem = MapStop | MapCastle | MapChest | MapGate;

export interface Theme { name: string; sky: string; ground: string; hill: string; hill2: string; deco: Deco[]; ink: string }
export type Deco = "tree" | "pine" | "flower" | "palm" | "wave" | "cactus" | "rock" | "crystal" | "snow" | "smoke";

export const THEMES: Theme[] = [
  { name: "Rookie Meadow", sky: "#ECFBC2", ground: "#D2F27A", hill: "#B7E04A", hill2: "#9CCB2C", deco: ["tree", "flower", "tree"], ink: "#3E5A06" },
  { name: "Coral Coast", sky: "#D9F4F7", ground: "#A5E3EC", hill: "#7FD2DF", hill2: "#5BBFD0", deco: ["palm", "wave", "palm"], ink: "#0D5563" },
  { name: "Sunset Canyon", sky: "#FFE9D6", ground: "#FFC79E", hill: "#F7A877", hill2: "#EB8E57", deco: ["cactus", "rock", "cactus"], ink: "#7A3209" },
  { name: "Crystal Caves", sky: "#ECE7FF", ground: "#CFC4FA", hill: "#B3A3F2", hill2: "#9886E6", deco: ["crystal", "rock", "crystal"], ink: "#3C2A8C" },
  { name: "Frost Peaks", sky: "#EEF5FF", ground: "#D3E4FB", hill: "#B6D0F4", hill2: "#97B9EA", deco: ["pine", "snow", "pine"], ink: "#1F4A86" },
  { name: "Volcano Summit", sky: "#FFE3DA", ground: "#F9B9A5", hill: "#EE9478", hill2: "#DB7254", deco: ["rock", "smoke", "rock"], ink: "#7A1E07" },
];

export interface Land { idx: number; theme: Theme; name: string; items: MapItem[]; stops: MapStop[]; stars: number; done: number }
export interface ArenaMap {
  lands: Land[];
  current: string | null; // gid the player stands on
  total: number;
  done: number;
  stars: number;
  /** gid → other players whose furthest finished stop is that quiz */
  mates: Record<string, Player[]>;
}

/** Stars for a finished quiz: 3 = every answer right, 2 = 60%+, 1 = at least one right. */
export function starsFor(correct: number, total: number): 0 | 1 | 2 | 3 {
  if (!total || !correct) return 0;
  if (correct >= total) return 3;
  return correct / total >= 0.6 ? 2 : 1;
}

const dayOf = (g: Game) => g.date || new Date(g.createdAt || 0).toISOString().slice(0, 10);

export function buildMap(games: Game[], me: Player, players: Player[], dq: Disqualified | null | undefined, today: string, certPassed: (g: Game) => CastleState): ArenaMap {
  const sprints = games
    .filter((g) => g.kind === "sprint" && (g.status === "live" || g.status === "closed"))
    .sort((a, b) => dayOf(a).localeCompare(dayOf(b)) || (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));
  const certs = games.filter((g) => g.kind === "cert" && (g.status === "live" || g.status === "closed")).sort((a, b) => dayOf(a).localeCompare(dayOf(b)));

  const stops: MapStop[] = sprints.map((g, i) => {
    const run = me.runs?.[g.id];
    const played = run?.status === "done";
    const state: StopState = played ? "done" : isOpen(g, today) ? "play" : g.status === "live" && !!g.date && g.date > today ? "locked" : "missed";
    return { kind: "stop", g, n: i + 1, state, stars: played && run ? starsFor(runCorrect(run), run.total || run.ans.length) : 0 };
  });

  const lands: Land[] = [];
  for (let i = 0; i < Math.max(1, Math.ceil(stops.length / LAND_SIZE)); i++) {
    const own = stops.slice(i * LAND_SIZE, (i + 1) * LAND_SIZE);
    const theme = THEMES[i % THEMES.length];
    const lap = Math.floor(i / THEMES.length);
    const full = own.length === LAND_SIZE;
    lands.push({
      idx: i, theme, name: theme.name + (lap ? ` ${"I".repeat(lap + 1)}` : ""), stops: own,
      items: [{ kind: "gate" }, ...own, { kind: "chest", full, open: full && own.every((s) => s.state === "done" || s.state === "missed") && own.some((s) => s.state === "done") }],
      stars: own.reduce((s, x) => s + x.stars, 0), done: own.filter((s) => s.state === "done").length,
    });
  }
  // certifications: a castle right after the last stop dated on or before the exam opened
  for (const c of certs) {
    const after = stops.filter((s) => dayOf(s.g) <= dayOf(c)).pop();
    const land = lands[after ? Math.floor((after.n - 1) / LAND_SIZE) : 0];
    const at = after ? land.items.indexOf(after) + 1 : 1;
    land.items.splice(at, 0, { kind: "castle", g: c, state: certPassed(c) });
  }

  const current = (stops.find((s) => s.state === "play") || [...stops].reverse().find((s) => s.state === "done"))?.g.id ?? null;

  const idx = new Map(stops.map((s) => [s.g.id, s.n]));
  const mates: Record<string, Player[]> = {};
  for (const p of players) {
    if (p.uid === me.uid) continue;
    let best = 0, gid = "";
    for (const r of validRuns(p, dq)) {
      const n = r.status === "done" ? idx.get(r.gid) || 0 : 0;
      if (n > best) [best, gid] = [n, r.gid];
    }
    if (gid) (mates[gid] ||= []).push(p);
  }

  return { lands, current, total: stops.length, done: stops.filter((s) => s.state === "done").length, stars: stops.reduce((s, x) => s + x.stars, 0), mates };
}
