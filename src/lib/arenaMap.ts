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

export interface Theme {
  name: string;
  /** island top (two tones for a tiled look), grass lip, earth and rock layers of the side walls */
  top: string; top2: string; lip: string; side: string; side2: string;
  deco: Deco[];
  ink: string; // text on this land's banner and summary card
  soft: string; // summary card background
}
export type Deco = "tree" | "pine" | "flower" | "palm" | "cactus" | "rock" | "crystal" | "snowpine" | "lava";

export const THEMES: Theme[] = [
  { name: "Rookie Meadow", top: "#8DD64B", top2: "#82CD41", lip: "#6CB832", side: "#9A6A3E", side2: "#7A5230", deco: ["tree", "tree", "flower", "rock", "tree"], ink: "#3E5A06", soft: "#D9F59A" },
  { name: "Coral Coast", top: "#F3DEA6", top2: "#EED699", lip: "#DFC07B", side: "#C99A5B", side2: "#A57841", deco: ["palm", "rock", "palm", "flower"], ink: "#0D5563", soft: "#BDEBF2" },
  { name: "Sunset Canyon", top: "#F2A86E", top2: "#EC9F63", lip: "#D9864F", side: "#BF673A", side2: "#9B502A", deco: ["cactus", "rock", "cactus", "rock"], ink: "#7A3209", soft: "#FFD3B0" },
  { name: "Crystal Caves", top: "#B9A9F5", top2: "#B0A0F1", lip: "#9A87E5", side: "#6D5AB6", side2: "#554496", deco: ["crystal", "rock", "crystal"], ink: "#3C2A8C", soft: "#E1DAFF" },
  { name: "Frost Peaks", top: "#F5F9FF", top2: "#EAF2FD", lip: "#D3E2F6", side: "#8DA8C9", side2: "#728EB2", deco: ["snowpine", "snowpine", "rock"], ink: "#1F4A86", soft: "#DCEAFE" },
  { name: "Volcano Summit", top: "#6E5652", top2: "#654E4A", lip: "#574340", side: "#3E302D", side2: "#2C2220", deco: ["lava", "rock", "rock"], ink: "#7A1E07", soft: "#FFD7CB" },
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
  // the journey only moves forward: once a later quiz is played, earlier ones left unplayed are behind you
  const furthest = stops.reduce((m, s, i) => (s.state === "done" ? i : m), -1);
  for (let i = 0; i < furthest; i++) if (stops[i].state === "play") stops[i].state = "missed";

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
