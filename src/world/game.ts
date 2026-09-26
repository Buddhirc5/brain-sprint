/* =====================================================================
   Knowledge World — the game.
   A side-scrolling papercraft city: walk, jump across rooftops, pop
   knowledge bubbles, pick one of three cars and race Sprinty over the
   hills. Fixed 120 Hz simulation, render every animation frame.

   Game-feel details: coyote time + jump buffering, variable jump height,
   squash & stretch, landing dust, camera look-ahead and speed zoom,
   screen shake on big landings, paper-flip when turning around.
   Nothing here talks to a server; progress lives in localStorage.
   ===================================================================== */
import { Sfx } from "./audio";
import { CarBody, GRAVITY } from "./car";
import {
  BUBBLES, CAR_SPOTS, CARS, COINS, DISTRICTS, FINISH_X, PLATFORMS, SPAWN_X, START_X, WORLD_W, bakeCity, districtAt, ground, slope,
  type CarSpec, type Layers, type Platform,
} from "./city";
import { PAL, clamp, grainPattern, lerp, rng } from "./paper";
import { characterSprites, drawCar, drawKart, drawSprite, sprintySprite, type CharSprites, type Sprite } from "./sprites";
import type { Equipped } from "../types";

/* ---------------- public surface ---------------- */
export type RaceState = "idle" | "ready" | "countdown" | "running" | "done";
export interface RaceHud {
  state: RaceState;
  t: number;
  count: number;
  gap: number; // + = you are ahead (px)
  result: { win: boolean; time: number; rival: number | null; best: number | null; newBest: boolean; coins: number } | null;
}
export interface Hud {
  mode: "foot" | "car";
  coins: number;
  bubbles: number;
  bubblesTotal: number;
  district: number;
  prompt: string | null;
  use: string | null;
  carCard: { name: string; tag: string; stats: [number, number, number]; color: string; best: number | null } | null;
  race: RaceHud;
  boost: number;
  speed: number;
  progress: number;
  rival: number;
  night: number;
  toast: string | null;
}
export interface GameOpts {
  canvas: HTMLCanvasElement;
  look: number;
  equipped?: Equipped;
  mobile: boolean;
  onHud: (h: Hud) => void;
  onBubble: (id: number) => void;
  onReady: () => void;
}

const SAVE_KEY = "bsx.world2";
interface Save { coins: number; best: Record<string, number>; seen: number[] }
function loadSave(): Save {
  try {
    const v = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}");
    return { coins: Number(v.coins) || 0, best: v.best && typeof v.best === "object" ? v.best : {}, seen: Array.isArray(v.seen) ? v.seen : [] };
  } catch {
    return { coins: 0, best: {}, seen: [] };
  }
}
function persist(s: Save) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/* feel constants */
const WALK = 310;
const ACC_GROUND = 2600;
const ACC_AIR = 1600;
const JUMP_V = 780;
const P_GRAV = 2300;
const COYOTE = 0.1;
const BUFFER = 0.13;
const STEP = 1 / 120;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: "dust" | "spark" | "confetti" | "smoke" | "ring"; rot: number }
interface Npc { look: number; a: number; b: number; x: number; dir: number; speed: number; phase: number; say: string; sayT: number }

const SKY: [number, string, string][] = [
  [0.0, "#0E1A3A", "#27407A"],
  [0.18, "#2A2F66", "#C36F8A"],
  [0.25, "#7FB8F0", "#FFD6A8"],
  [0.33, "#63BDF6", "#D4F0FF"],
  [0.64, "#63BDF6", "#D4F0FF"],
  [0.74, "#F0857A", "#FFD08A"],
  [0.82, "#3A2F6B", "#C06C84"],
  [0.9, "#0E1A3A", "#27407A"],
  [1.0, "#0E1A3A", "#27407A"],
];
function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(lerp((pa >> s) & 255, (pb >> s) & 255, t));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const TIPS = [
  "Lock your screen when you step away!",
  "Two minutes a day keeps the gaps away.",
  "Spotted a phishing email? Report it!",
  "Have you tried the café roof?",
  "Sprinty is fast… but not unbeatable.",
  "Stretch! Your back will thank you.",
  "Rocky climbs hills like a goat.",
  "Pop the ? bubbles for bonus coins.",
];

/* ===================================================================== */
export class Game {
  private o: GameOpts;
  private ctx: CanvasRenderingContext2D;
  private W = 1;
  private H = 1;
  private dpr = 1;
  private s = 1; // world → CSS px
  private zoom = 1;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private ready = false;
  paused = false;

  private layers!: Layers;
  private grain: CanvasPattern | null = null;
  private me!: CharSprites;
  private npcSprites: CharSprites[] = [];
  private sprinty: Sprite | null = null;
  sfx = new Sfx();

  // player
  private p = { x: SPAWN_X, y: 0, vx: 0, vy: 0, ground: true, face: 1, flip: 1, coyote: 0, buf: 0, phase: 0, sx: 1, sy: 1, plat: null as Platform | null, held: false };
  private cars: CarBody[] = [];
  private driving = -1;
  private boost = 1;
  private boosting = false;

  // world state
  private coinTaken: boolean[] = COINS.map(() => false);
  private bubbleTaken: boolean[] = BUBBLES.map(() => false);
  private save = loadSave();
  private particles: Particle[] = [];
  private npcs: Npc[] = [];
  private stars: [number, number, number][] = [];
  private clouds: { x: number; y: number; w: number; h: number; sp: number; path: Path2D }[] = [];
  private cam = { x: SPAWN_X, y: -120 };
  private shake = 0;
  private tod = 0.3; // time of day 0…1
  private district = 0;
  private toast: { text: string; until: number } | null = null;
  private reduceMotion = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  // input
  private keys = new Set<string>();
  private btn = { left: false, right: false, jump: false, use: false };
  private usePressed = false;
  private jumpPressed = false;

  // race
  private race: RaceHud = { state: "idle", t: 0, count: 0, gap: 0, result: null };
  private rival = { x: START_X - 60, y: 0, vy: 0, v: 0, a: 0, air: false, spin: 0, finishT: null as number | null };
  private doneAt = 0;
  private raceArmed = true; // re-armed after backing out of the start box
  private hudAt = 0;

  constructor(o: GameOpts) {
    this.o = o;
    const ctx = o.canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.p.y = ground(this.p.x);
    this.cars = CARS.map((spec, i) => new CarBody(spec, CAR_SPOTS[i]));
    this.rival.y = ground(this.rival.x);
    const r = rng(5);
    for (let i = 0; i < 90; i++) this.stars.push([r(), r() * 0.6, 0.5 + r() * 1.4]);
    for (let i = 0; i < 12; i++) {
      const w = 120 + r() * 160;
      const h = 40 + r() * 30;
      const path = new Path2D();
      for (let k = 0; k < 4; k++) {
        const cx = -w / 2 + (w * (k + 0.5)) / 4;
        const rr = h * (0.5 + Math.sin(((k + 0.5) / 4) * Math.PI) * 0.45);
        path.moveTo(cx + rr, 0);
        path.arc(cx, -rr * 0.6 + h * 0.3, rr, 0, Math.PI * 2);
      }
      path.rect(-w * 0.42, 0, w * 0.84, h * 0.35);
      this.clouds.push({ x: r() * 3200, y: -520 + r() * 260, w, h, sp: 6 + r() * 10, path });
    }
    const looks = [3, 9, 12, 5, 14];
    this.npcs = looks.map((look, i) => {
      const a = 800 + i * 420;
      return { look, a: a * 0.85, b: (a + 260 + r() * 200) * 0.85, x: (a + 100) * 0.85, dir: r() < 0.5 ? 1 : -1, speed: 38 + r() * 20, phase: r() * 4, say: TIPS[i % TIPS.length], sayT: 0 };
    });
    this.bindInput();
    // test hook (?kwdebug in the URL): lets automated checks jump around the map
    if (/[?&]kwdebug\b/.test(location.search)) (window as unknown as { __kw: Game }).__kw = this;
    void this.load();
  }

  private async load() {
    await document.fonts?.load("26px Anton").catch(() => undefined);
    this.layers = bakeCity();
    this.grain = grainPattern(this.ctx);
    const [me, sprinty, ...npc] = await Promise.all([
      characterSprites(this.o.look, this.o.equipped),
      sprintySprite().catch(() => null),
      ...[3, 9, 12].map((l) => characterSprites(l)),
    ]);
    this.me = me;
    this.sprinty = sprinty;
    this.npcSprites = npc;
    this.npcs.forEach((n, i) => (n.look = i % npc.length));
    this.resize();
    const parent = this.o.canvas.parentElement;
    if (parent && typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(parent);
    }
    this.ready = true;
    this.o.onReady();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    document.addEventListener("visibilitychange", this.onVis);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.sfx.dispose();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
  }

  private onVis = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.sfx.engineOff();
    } else if (this.ready) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  private resize() {
    const el = this.o.canvas.parentElement;
    if (!el) return;
    this.W = Math.max(1, el.clientWidth);
    this.H = Math.max(1, el.clientHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.o.mobile ? 1.75 : 2);
    this.o.canvas.width = Math.round(this.W * this.dpr);
    this.o.canvas.height = Math.round(this.H * this.dpr);
    // show ~560 world px of height on landscape, at least ~600 px of width on portrait phones
    const portrait = this.H > this.W * 1.15;
    this.s = Math.min(this.H / (portrait ? 900 : 560), this.W / (portrait ? 430 : 600));
  }

  /* ---------------- input ---------------- */
  private bindInput() {
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }
  private keyName(e: KeyboardEvent) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }
  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName) && e.key !== " " && !e.key.startsWith("Arrow")) return;
    if (this.paused) return;
    const k = this.keyName(e);
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d"].includes(k)) e.preventDefault();
    this.sfx.unlock();
    if (!e.repeat) {
      if (k === " " || k === "ArrowUp" || k === "w") this.jumpPressed = true;
      if (k === "e" || k === "Enter" || k === "ArrowDown" || k === "s") this.usePressed = true;
    }
    this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(this.keyName(e));
  private onBlur = () => {
    this.keys.clear();
    this.btn = { left: false, right: false, jump: false, use: false };
  };
  /** Touch buttons. */
  press(b: keyof Game["btn"], down: boolean) {
    this.sfx.unlock();
    if (down && !this.btn[b]) {
      if (b === "jump") this.jumpPressed = true;
      if (b === "use") this.usePressed = true;
    }
    this.btn[b] = down;
  }
  private get left() {
    return this.keys.has("ArrowLeft") || this.keys.has("a") || this.btn.left;
  }
  private get right() {
    return this.keys.has("ArrowRight") || this.keys.has("d") || this.btn.right;
  }
  private get jumpHeld() {
    return this.keys.has(" ") || this.keys.has("ArrowUp") || this.keys.has("w") || this.btn.jump;
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.keys.clear();
    this.btn = { left: false, right: false, jump: false, use: false };
    if (p) this.sfx.engineOff();
    this.pushHud(true);
  }

  /** Close a knowledge bubble. */
  answer(id: number, correct: boolean) {
    this.bubbleTaken[id] = true;
    if (!this.save.seen.includes(id)) this.save.seen.push(id);
    this.save.coins += correct ? 50 : 10;
    persist(this.save);
    const b = BUBBLES[id];
    this.burst(b.x, b.y, correct ? 26 : 10, correct ? "confetti" : "spark");
    if (correct) this.sfx.right();
    this.setPaused(false);
  }

  /* ---------------- loop ---------------- */
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= STEP && n < 8) {
        this.update(STEP);
        this.acc -= STEP;
        n++;
      }
      if (n === 8) this.acc = 0;
    }
    this.render(dt);
  };

  private update(dt: number) {
    this.time += dt;
    this.tod = (this.tod + dt / 240) % 1; // 4-minute day
    const use = this.usePressed;
    const jump = this.jumpPressed;
    this.usePressed = false;
    this.jumpPressed = false;

    if (this.driving < 0) this.updateFoot(dt, jump, use);
    else this.updateCar(dt, jump, use);
    // parked cars settle (only those near the camera)
    this.cars.forEach((c, i) => {
      if (i !== this.driving && Math.abs(c.x - this.cam.x) < 1600) c.step(dt, { thr: 0, boost: false });
    });
    this.updateRace(dt, jump);
    this.updateWorld(dt);
    this.updateCamera(dt);
    this.pushHud();
  }

  private updateFoot(dt: number, jump: boolean, use: boolean) {
    const p = this.p;
    const dir = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    const target = dir * WALK;
    const acc = p.ground ? (dir === 0 || Math.sign(dir) !== Math.sign(p.vx) ? ACC_GROUND * 1.3 : ACC_GROUND) : ACC_AIR;
    p.vx += clamp(target - p.vx, -acc * dt, acc * dt);
    if (dir) p.face = dir;
    p.flip += (p.face - p.flip) * Math.min(1, dt * 14);

    if (jump) p.buf = BUFFER;
    p.buf = Math.max(0, p.buf - dt);
    p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - dt);
    if (p.buf > 0 && p.coyote > 0) {
      p.vy = -JUMP_V;
      p.ground = false;
      p.plat = null;
      p.buf = 0;
      p.coyote = 0;
      p.sx = 0.78;
      p.sy = 1.22;
      this.sfx.jump();
      this.dust(p.x, p.y, 5);
    }
    // variable jump height: let go early for a short hop
    const g = P_GRAV * (p.vy < 0 && !this.jumpHeld ? 2.2 : 1);
    if (!p.ground) p.vy = Math.min(1500, p.vy + g * dt);

    // horizontal move with walls (cliff faces)
    const nx = clamp(p.x + p.vx * dt, 40, WORLD_W - 60);
    const gNext = ground(nx);
    if ((p.ground && !p.plat && gNext < p.y - 22) || (!p.ground && p.y > gNext + 2)) p.vx = 0;
    else p.x = nx;

    const prevY = p.y;
    if (!p.ground) p.y += p.vy * dt;
    // platforms (one-way, from above)
    if (!p.ground && p.vy >= 0) {
      for (const pl of PLATFORMS) {
        if (p.x < pl.x0 - 6 || p.x > pl.x1 + 6) continue;
        if (prevY <= pl.y + 2 && p.y >= pl.y) {
          p.y = pl.y;
          if (pl.bounce) {
            p.vy = -pl.bounce;
            p.sx = 1.3;
            p.sy = 0.7;
            this.sfx.bounce();
            this.dust(p.x, p.y, 6);
          } else this.land(pl);
          break;
        }
      }
    }
    const floor = ground(p.x);
    if (!p.ground && p.y >= floor) {
      p.y = floor;
      this.land(null);
    }
    if (p.ground) {
      if (p.plat) {
        if (p.x < p.plat.x0 - 6 || p.x > p.plat.x1 + 6) {
          p.ground = false;
          p.plat = null;
          p.vy = 0;
        }
      } else p.y = floor;
    }
    // squash & stretch recover
    p.sx += (1 - p.sx) * Math.min(1, dt * 12);
    p.sy += (1 - p.sy) * Math.min(1, dt * 12);
    if (p.ground && Math.abs(p.vx) > 20) {
      p.phase += Math.abs(p.vx) * dt * 0.034;
      if (Math.random() < dt * 6) this.dust(p.x - p.face * 14, p.y, 1);
    } else if (p.ground) p.phase = 0;

    // cars
    const near = this.nearCar();
    if (use && near >= 0 && p.ground) {
      this.driving = near;
      this.sfx.door();
      this.toastMsg(`${this.cars[near].spec.name} — ${this.cars[near].spec.tag}`);
    }
  }

  private land(pl: Platform | null) {
    const p = this.p;
    const hard = p.vy > 900;
    if (p.vy > 420) {
      p.sx = 1.25;
      p.sy = 0.78;
      this.dust(p.x, p.y, hard ? 10 : 5);
      this.sfx.land();
      if (hard) this.addShake(4);
    }
    p.vy = 0;
    p.ground = true;
    p.plat = pl;
  }

  private nearCar(): number {
    let best = -1;
    let bd = 95;
    this.cars.forEach((c, i) => {
      const d = Math.abs(c.x - this.p.x);
      if (d < bd && Math.abs(c.y - this.p.y) < 140) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  private updateCar(dt: number, jump: boolean, use: boolean) {
    const c = this.cars[this.driving];
    const frozen = this.race.state === "countdown";
    const thr = frozen ? 0 : (this.right ? 1 : 0) - (this.left ? 1 : 0);
    const wantBoost = (this.keys.has(" ") || this.btn.jump) && this.race.state !== "ready" && this.race.state !== "countdown";
    this.boosting = wantBoost && this.boost > 0.02 && thr !== 0;
    this.boost = clamp(this.boost + (this.boosting ? -0.38 : 0.07) * dt, 0, 1);
    if (frozen) {
      c.vx *= 0.9;
    }
    c.step(dt, { thr, boost: this.boosting });
    if (c.landed > 0) {
      if (c.landed > 0.35) {
        this.addShake(c.landed * 8);
        this.dust(c.x, ground(c.x), 12);
        this.sfx.land();
      }
      c.landed = 0;
    }
    if (c.flippedFor > 1.1) {
      this.sfx.crash();
      this.toastMsg("Oops! Back on your wheels.");
      c.reset();
    }
    if (Math.abs(c.vx) > 200 && Math.random() < dt * 20) this.smoke(c);
    this.p.x = c.x;
    this.p.y = c.y;
    this.sfx.engineSet(Math.min(1, Math.abs(c.vx) / c.spec.top), this.boosting);
    void jump;
    if (use && this.race.state !== "countdown") {
      // hop out beside the car
      this.driving = -1;
      this.sfx.engineOff();
      this.sfx.door();
      const side = -c.dir;
      this.p.x = clamp(c.x + side * 92, 40, WORLD_W - 60);
      this.p.y = ground(this.p.x) - 40;
      this.p.vx = 0;
      this.p.vy = -300;
      this.p.ground = false;
      this.p.plat = null;
      c.vx *= 0.3;
      if (this.race.state === "running" || this.race.state === "ready") this.cancelRace("Race cancelled — you left the car.");
    }
  }

  /* ---------------- race vs Sprinty ---------------- */
  private cancelRace(msg: string) {
    this.race = { state: "idle", t: 0, count: 0, gap: 0, result: null };
    this.resetRival();
    this.toastMsg(msg);
  }
  private resetRival() {
    Object.assign(this.rival, { x: START_X - 60, y: ground(START_X - 60), vy: 0, v: 0, a: 0, air: false, finishT: null });
  }

  private updateRace(dt: number, startPress: boolean) {
    const R = this.race;
    const inCar = this.driving >= 0;
    const c = inCar ? this.cars[this.driving] : null;
    if (c && c.x < START_X - 520) this.raceArmed = true;
    if (R.state === "idle" && c && this.raceArmed && c.x > START_X - 300 && c.x < START_X - 20 && c.vx > -50) {
      // rolled into the start box: the marshal waves you onto the grid
      this.race = { ...R, state: "ready" };
      this.toastMsg("Welcome to Hill Raceway!");
    } else if (R.state === "ready" && c) {
      // hold the car on the grid; ← backs out
      c.vx += (0 - c.vx) * Math.min(1, dt * 6);
      c.x += ((START_X - 140) - c.x) * Math.min(1, dt * 2.5);
      if (this.left) {
        this.race = { ...R, state: "idle" };
        this.raceArmed = false;
      }
    } else if (R.state === "ready" && !c) {
      this.race = { ...R, state: "idle" };
    }
    if (this.race.state === "ready" && c && startPress) {
      this.resetRival();
      if (c) {
        c.x = START_X - 140;
        c.vx = 0;
        c.dir = 1;
      }
      this.race = { state: "countdown", t: 0, count: 3, gap: 0, result: null };
      this.sfx.beep();
    } else if (R.state === "countdown") {
      const before = Math.ceil(3 - R.t);
      R.t += dt;
      const after = Math.ceil(3 - R.t);
      R.count = Math.max(0, after);
      if (after !== before && after > 0) this.sfx.beep();
      if (R.t >= 3) {
        this.race = { state: "running", t: 0, count: 0, gap: 0, result: null };
        this.sfx.beep(true);
        this.boost = 1;
      }
    } else if (R.state === "running") {
      R.t += dt;
      this.stepRival(dt);
      R.gap = (c?.x ?? 0) - this.rival.x;
      if (this.rival.x >= FINISH_X && this.rival.finishT == null) this.rival.finishT = R.t;
      if (c && c.x >= FINISH_X) {
        const time = Math.round(R.t * 100) / 100;
        this.raceArmed = false;
        const win = this.rival.finishT == null;
        const key = c.spec.id;
        const prev = this.save.best[key] ?? null;
        const newBest = prev == null || time < prev;
        if (newBest) this.save.best[key] = time;
        const coins = win ? 150 : 50;
        this.save.coins += coins;
        persist(this.save);
        this.race = { state: "done", t: time, count: 0, gap: R.gap, result: { win, time, rival: this.rival.finishT, best: this.save.best[key], newBest, coins } };
        this.doneAt = this.time;
        if (win) {
          this.sfx.win();
          for (let i = 0; i < 4; i++) this.burst(c.x + 100 + i * 60, c.y - 120, 24, "confetti");
        } else this.sfx.lose();
      } else if (c && c.x < START_X - 700) this.cancelRace("Race cancelled — wrong way!");
    } else if (R.state === "done") {
      if (this.rival.x < FINISH_X + 400) this.stepRival(dt);
      if (this.time - this.doneAt > 7) {
        this.race = { state: "idle", t: 0, count: 0, gap: 0, result: null };
        this.resetRival();
      }
    }
  }

  private stepRival(dt: number) {
    const rv = this.rival;
    const c = this.driving >= 0 ? this.cars[this.driving] : null;
    const gap = (c?.x ?? rv.x) - rv.x;
    // rubber band keeps it a race: catch up when far behind, ease off when far ahead
    const band = gap > 350 ? 1.14 : gap > 150 ? 1.06 : gap < -600 ? 0.8 : gap < -300 ? 0.9 : 1;
    const hill = 1 + clamp(slope(rv.x), -0.6, 0.6) * 0.55; // uphill (negative slope) slows
    const target = 640 * band * hill;
    rv.v += clamp(target - rv.v, -700 * dt, 520 * dt);
    const nx = rv.x + rv.v * dt;
    const g = ground(nx);
    if (!rv.air) {
      const vyFollow = (g - rv.y) / dt;
      if (vyFollow > rv.vy + GRAVITY * dt * 1.2 && g - rv.y > 3) {
        rv.air = true; // ground falls away faster than gravity: take off
      } else {
        rv.vy = vyFollow;
        rv.y = g;
        rv.a += (Math.atan(slope(nx)) - rv.a) * Math.min(1, dt * 12);
      }
    }
    if (rv.air) {
      rv.vy += GRAVITY * dt;
      rv.y += rv.vy * dt;
      rv.a += (0.15 - rv.a) * Math.min(1, dt * 2);
      if (rv.y >= g) {
        rv.y = g;
        rv.air = false;
        rv.vy = 0;
      }
    }
    rv.x = nx;
    rv.spin += (rv.v * dt) / 13;
  }

  /* ---------------- world ---------------- */
  private updateWorld(dt: number) {
    const inCar = this.driving >= 0;
    const fx = this.p.x;
    const fy = inCar ? this.p.y - 20 : this.p.y - 44;
    const cr = inCar ? 70 : 38;
    COINS.forEach((c, i) => {
      if (this.coinTaken[i]) return;
      if (Math.abs(c.x - fx) < cr && Math.abs(c.y - fy) < cr + 14) {
        this.coinTaken[i] = true;
        this.save.coins += 1;
        this.boost = Math.min(1, this.boost + 0.06);
        this.sfx.coin();
        this.burst(c.x, c.y, 6, "spark");
        if (this.coinTaken.filter(Boolean).length % 20 === 0) persist(this.save);
      }
    });
    const br = inCar ? 84 : 52;
    BUBBLES.forEach((b, i) => {
      if (this.bubbleTaken[i] || this.paused || this.racing()) return; // never interrupt a race
      const by = b.y + Math.sin(this.time * 2 + i) * 8;
      if (Math.abs(b.x - fx) < br && Math.abs(by - fy) < br + 10) {
        this.sfx.bubble();
        this.burst(b.x, by, 14, "ring");
        this.setPaused(true);
        this.o.onBubble(i);
      }
    });
    // districts
    const d = DISTRICTS.indexOf(districtAt(this.p.x));
    if (d !== this.district) this.district = d;
    // particles
    for (const q of this.particles) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += q.vx * dt * 0.02;
      if (q.kind === "confetti") {
        q.vy += 600 * dt;
        q.vx *= 1 - dt;
      } else if (q.kind === "dust" || q.kind === "smoke") {
        q.vx *= 1 - dt * 3;
        q.vy *= 1 - dt * 3;
        q.size += dt * (q.kind === "smoke" ? 28 : 18);
      } else if (q.kind === "spark") q.vy += 300 * dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
    // npcs stroll and chat when you walk by
    for (const n of this.npcs) {
      n.x += n.dir * n.speed * dt;
      if (n.x > n.b) n.dir = -1;
      if (n.x < n.a) n.dir = 1;
      n.phase += n.speed * dt * 0.034;
      const worldX = n.x / 0.85;
      if (Math.abs(worldX - this.p.x) < 120 && this.driving < 0 && n.sayT <= 0) {
        n.sayT = 4;
        n.say = TIPS[Math.floor(Math.random() * TIPS.length)];
      }
      n.sayT -= dt;
    }
    this.shake = Math.max(0, this.shake - dt * 18);
  }

  private updateCamera(dt: number) {
    const inCar = this.driving >= 0;
    const c = inCar ? this.cars[this.driving] : null;
    const look = c ? clamp(c.vx * 0.38, -280, 320) : this.p.face * 90;
    const tx = this.p.x + look;
    const ty = (c ? c.y - 80 : this.p.y - 135) + (c ? 0 : clamp(this.p.vy * 0.05, -20, 50));
    const tz = c ? 1 - Math.min(0.24, Math.abs(c.vx) / 3600) : 1;
    const k = 1 - Math.exp(-dt * (c ? 4 : 5));
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * (1 - Math.exp(-dt * 4));
    this.zoom += (tz - this.zoom) * (1 - Math.exp(-dt * 2));
    const hw = this.W / (2 * this.s * this.zoom);
    this.cam.x = clamp(this.cam.x, hw, WORLD_W - hw);
  }

  private racing() {
    return this.race.state === "countdown" || this.race.state === "running";
  }

  /* ---------------- effects ---------------- */
  private addShake(a: number) {
    if (!this.reduceMotion) this.shake = Math.max(this.shake, a);
  }
  private dust(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++)
      this.particles.push({ x: x + (Math.random() - 0.5) * 20, y: y - 4, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 90, life: 0.5, max: 0.5, size: 5 + Math.random() * 5, color: "rgba(255,254,250,.9)", kind: "dust", rot: 0 });
  }
  private smoke(c: CarBody) {
    const ex = c.x - Math.cos(c.a) * 72 * c.dir;
    const ey = c.y - Math.sin(c.a) * 72 * c.dir - 6;
    this.particles.push({ x: ex, y: ey, vx: -c.dir * 40, vy: -30, life: 0.6, max: 0.6, size: 4, color: this.boosting ? "rgba(255,216,77,.8)" : "rgba(210,210,200,.6)", kind: "smoke", rot: 0 });
  }
  private burst(x: number, y: number, n: number, kind: Particle["kind"]) {
    const cols = [PAL.lime, PAL.orange, PAL.pink, PAL.blue, PAL.yellow];
    if (kind === "ring") {
      this.particles.push({ x, y, vx: 0, vy: 0, life: 0.45, max: 0.45, size: 20, color: PAL.lime, kind: "ring", rot: 0 });
      return;
    }
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = kind === "confetti" ? 200 + Math.random() * 300 : 120 + Math.random() * 160;
      this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === "confetti" ? 250 : 60), life: kind === "confetti" ? 1.6 : 0.45, max: kind === "confetti" ? 1.6 : 0.45, size: kind === "confetti" ? 7 : 4, color: kind === "spark" ? PAL.yellow : cols[i % cols.length], kind, rot: Math.random() * 6 });
    }
  }
  private toastMsg(text: string) {
    this.toast = { text, until: this.time + 2.6 };
    this.pushHud(true);
  }

  /* ---------------- HUD ---------------- */
  private night() {
    const t = this.tod;
    if (t < 0.12 || t > 0.9) return 1;
    if (t < 0.26) return 1 - (t - 0.12) / 0.14;
    if (t > 0.74) return (t - 0.74) / 0.16;
    return 0;
  }
  private pushHud(force = false) {
    if (!force && this.time - this.hudAt < 0.1) return;
    this.hudAt = this.time;
    const inCar = this.driving >= 0;
    const c = inCar ? this.cars[this.driving] : null;
    const near = !inCar && this.p.ground ? this.nearCar() : -1;
    const spec: CarSpec | null = near >= 0 ? this.cars[near].spec : null;
    const tap = this.o.mobile;
    let prompt: string | null = null;
    if (this.race.state === "ready") prompt = tap ? "Tap GO to race Sprinty! · ◀ to back out" : "Press SPACE to race Sprinty! · ← to back out";
    else if (this.race.state === "running") prompt = null;
    else if (spec) prompt = tap ? `Tap DRIVE to take ${spec.name}` : `Press E to drive ${spec.name}`;
    else if (inCar && this.race.state === "idle" && c && c.x < START_X - 300) prompt = "Drive to the START line to race →";
    else if (!inCar && this.time < 9) prompt = tap ? "◀ ▶ to walk · JUMP to hop · find a car at Pick a Ride" : "← → to walk · SPACE to jump · E to drive · Esc to pause";
    this.o.onHud({
      mode: inCar ? "car" : "foot",
      coins: this.save.coins,
      bubbles: this.bubbleTaken.filter(Boolean).length,
      bubblesTotal: BUBBLES.length,
      district: this.district,
      prompt,
      use: inCar ? (this.race.state === "ready" ? "GO!" : "Get out") : spec ? "Drive" : null,
      carCard: spec ? { name: spec.name, tag: spec.tag, stats: spec.stats, color: spec.color, best: this.save.best[spec.id] ?? null } : null,
      race: { ...this.race },
      boost: this.boost,
      speed: c ? Math.round(Math.abs(c.vx) * 0.18) : 0,
      progress: this.p.x / WORLD_W,
      rival: this.rival.x / WORLD_W,
      night: this.night(),
      toast: this.toast && this.toast.until > this.time ? this.toast.text : null,
    });
  }

  /** Test hook: teleport and set the time of day. */
  debug(x: number, tod?: number) {
    this.p.x = x;
    this.p.y = ground(x);
    this.cam.x = x;
    if (tod != null) this.tod = tod;
  }

  /** "GO" on phones: start the race (the use button doubles as GO at the line). */
  go() {
    if (this.race.state === "ready") this.jumpPressed = true;
    else this.usePressed = true;
  }

  /* ---------------- render ---------------- */
  private layerTf(f: number, fy: number, shakeX: number, shakeY: number) {
    const k = this.s * this.zoom * this.dpr;
    this.ctx.setTransform(k, 0, 0, k, (this.W / 2) * this.dpr - this.cam.x * f * k + shakeX, (this.H / 2) * this.dpr - this.cam.y * fy * k + shakeY);
  }
  private span(f: number) {
    const hw = this.W / (2 * this.s * this.zoom);
    return [this.cam.x * f - hw - 40, this.cam.x * f + hw + 40] as const;
  }

  private render(dt: number) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const W = this.W * this.dpr;
    const H = this.H * this.dpr;
    const night = this.night();
    const sh = this.shake;
    const sx = sh ? (Math.random() - 0.5) * sh * this.dpr : 0;
    const sy = sh ? (Math.random() - 0.5) * sh * this.dpr : 0;
    void dt;

    // sky
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let i = 0;
    while (i < SKY.length - 2 && this.tod > SKY[i + 1][0]) i++;
    const [t0, a0, b0] = SKY[i];
    const [t1, a1, b1] = SKY[i + 1];
    const k = (this.tod - t0) / (t1 - t0 || 1);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, mixHex(a0, a1, k));
    sky.addColorStop(1, mixHex(b0, b1, k));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // stars
    if (night > 0.05) {
      ctx.fillStyle = `rgba(255,255,240,${night * 0.9})`;
      const off = (this.cam.x * 0.02 * this.dpr) % W;
      for (const [x, y, r] of this.stars) {
        const px = (((x * W - off) % W) + W) % W;
        const tw = 0.6 + 0.4 * Math.sin(this.time * 2 + x * 50);
        ctx.globalAlpha = tw;
        ctx.fillRect(px, y * H, r * this.dpr, r * this.dpr);
      }
      ctx.globalAlpha = 1;
    }
    // sun & moon travel an arc
    const sunA = (this.tod - 0.25) * Math.PI * 2;
    const R = Math.min(W, H) * 0.42;
    const sunX = W * 0.5 - Math.cos(sunA) * W * 0.42;
    const sunY = H * 0.62 - Math.sin(sunA) * R;
    const moonX = W * 0.5 + Math.cos(sunA) * W * 0.42;
    const moonY = H * 0.62 + Math.sin(sunA) * R;
    if (sunY < H) {
      ctx.fillStyle = "rgba(255,216,77,.25)";
      ctx.beginPath();
      ctx.arc(sunX, sunY, 58 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.yellow;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 38 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    if (moonY < H) {
      ctx.fillStyle = PAL.cream;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 26 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(14,26,58,.9)";
      ctx.beginPath();
      ctx.arc(moonX + 11 * this.dpr, moonY - 6 * this.dpr, 22 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // clouds (far, drifting)
    this.layerTf(0.06, 0.05, sx * 0.2, sy * 0.2);
    ctx.fillStyle = night > 0.5 ? "rgba(90,100,150,.7)" : "rgba(255,255,255,.92)";
    for (const c of this.clouds) {
      const x = ((c.x + this.time * c.sp) % 3400) - 900;
      ctx.save();
      ctx.translate(x, c.y);
      ctx.fill(c.path);
      ctx.restore();
    }

    // parallax scenery
    const L = this.layers;
    const haze = mixHex(b0, b1, k);
    // Night: each plane is tinted, then its own windows light up, before the next
    // (nearer) plane is drawn — so far lights are always hidden behind near buildings.
    const tint = (a: number) => {
      if (night <= 0.01) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = `rgba(62,72,150,${night * a})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
    };
    for (const layer of [...L.sky, ...L.back]) {
      this.layerTf(layer.f, layer.fy, sx * layer.f, sy * layer.f);
      const [a, b] = this.span(layer.f);
      layer.draw(ctx, a, b, "base", night);
      if (layer.f === 0.85) this.drawNpcs();
      // atmospheric perspective: farther planes fade towards the horizon colour
      const hz = layer.f < 0.4 ? 0.3 : layer.f < 0.7 ? 0.2 : 0.1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = hz * (1 - night * 0.6);
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      tint(0.3);
      if (night > 0.01) {
        this.layerTf(layer.f, layer.fy, sx * layer.f, sy * layer.f);
        layer.draw(ctx, a, b, "light", night);
      }
    }
    // play layer: scenery, night tint, its lit windows, then the actors on top
    this.layerTf(1, 1, sx, sy);
    const [a, b] = this.span(1);
    L.play.draw(ctx, a, b, "base", night);
    this.drawSigns(a, b);
    this.drawWater(a, b);
    tint(0.45);
    if (night > 0.01) {
      this.layerTf(1, 1, sx, sy);
      L.play.draw(ctx, a, b, "light", night);
    }
    this.layerTf(1, 1, sx, sy);
    this.drawPickups(a, b);
    this.drawCars(a, b);
    if (this.driving < 0) this.drawPlayer();
    this.drawParticles();
    // foreground
    this.layerTf(L.front.f, L.front.fy, sx * 1.3, sy * 1.3);
    const [fa, fb] = this.span(L.front.f);
    L.front.draw(ctx, fa, fb, "base", night);
    tint(0.3);

    // glows
    if (night > 0.01) {
      this.layerTf(1, 1, sx, sy);
      ctx.globalCompositeOperation = "lighter";
      for (const l of L.lamps) {
        if (l.x < a - 200 || l.x > b + 200) continue;
        const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y + 60, 150);
        g.addColorStop(0, `rgba(255,220,140,${0.45 * night})`);
        g.addColorStop(1, "rgba(255,220,140,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(l.x - 14, l.y);
        ctx.lineTo(l.x + 14, l.y);
        ctx.lineTo(l.x + 90, l.y + 150);
        ctx.lineTo(l.x - 90, l.y + 150);
        ctx.fill();
      }
      if (this.driving >= 0) this.headlight(this.cars[this.driving], night);
      ctx.globalCompositeOperation = "source-over";
    }

    // paper grain + vignette
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.grain) {
      const m = new DOMMatrix().translate(-((this.cam.x * this.s * this.dpr) % 160), -((this.cam.y * this.s * this.dpr) % 160));
      this.grain.setTransform?.(m);
      ctx.globalAlpha = 0.07;
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(20,15,10,.28)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  private drawSigns(a: number, b: number) {
    const ctx = this.ctx;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const s of this.layers.signs) {
      if (s.x + s.w < a || s.x - s.w > b) continue;
      ctx.font = `${s.font}px Anton, Impact, sans-serif`;
      ctx.fillStyle = s.fg;
      ctx.fillText(s.text, s.x, s.y + 2, s.w - 12);
    }
  }

  private drawWater(a: number, b: number) {
    if (b < 3440 || a > 4400) return;
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(255,255,255,.55)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let x = Math.max(3450, Math.floor(a / 60) * 60); x < Math.min(4390, b); x += 60) {
      for (let row = 0; row < 3; row++) {
        const y = 40 + row * 40 + Math.sin(this.time * 2 + x * 0.05 + row) * 3;
        const off = (this.time * (20 + row * 10) + row * 20) % 60;
        ctx.beginPath();
        ctx.moveTo(x + off, y);
        ctx.lineTo(x + off + 18, y);
        ctx.stroke();
      }
    }
    // gulls
    for (let i = 0; i < 4; i++) {
      const gx = 3500 + ((this.time * (40 + i * 7) + i * 260) % 900);
      const gy = -220 - i * 30 + Math.sin(this.time * 2 + i) * 10;
      const flap = Math.sin(this.time * 10 + i) * 6;
      ctx.strokeStyle = PAL.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(gx - 10, gy - flap);
      ctx.quadraticCurveTo(gx - 4, gy - 4, gx, gy);
      ctx.quadraticCurveTo(gx + 4, gy - 4, gx + 10, gy - flap);
      ctx.stroke();
    }
  }

  private drawPickups(a: number, b: number) {
    const ctx = this.ctx;
    COINS.forEach((c, i) => {
      if (this.coinTaken[i] || c.x < a || c.x > b) return;
      const sp = Math.cos(this.time * 4 + c.x * 0.02);
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(this.time * 3 + c.x) * 2);
      ctx.scale(Math.max(0.15, Math.abs(sp)), 1);
      ctx.fillStyle = "rgba(22,21,18,.16)";
      ctx.beginPath();
      ctx.arc(3, 3, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#E0A400";
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.yellow;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.8)";
      ctx.fillRect(-3, -6, 2.5, 7);
      ctx.restore();
    });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    BUBBLES.forEach((bb, i) => {
      if (this.bubbleTaken[i] || bb.x < a - 60 || bb.x > b + 60) return;
      const y = bb.y + Math.sin(this.time * 2 + i) * 8;
      const pulse = 1 + Math.sin(this.time * 4 + i) * 0.06;
      ctx.save();
      if (this.racing()) ctx.globalAlpha = 0.3; // waits for you after the race
      ctx.translate(bb.x, y);
      ctx.fillStyle = "rgba(198,244,50,.22)";
      ctx.beginPath();
      ctx.arc(0, 0, 36 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(198,244,50,.6)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -this.time * 20;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(22,21,18,.18)";
      ctx.beginPath();
      ctx.arc(4, 4, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.lime;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.beginPath();
      ctx.arc(-8, -8, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PAL.ink;
      ctx.font = "30px Anton, Impact, sans-serif";
      ctx.fillText("?", 0, 2);
      ctx.restore();
    });
  }

  private drawCars(a: number, b: number) {
    const ctx = this.ctx;
    // Sprinty's kart
    const rv = this.rival;
    if (rv.x > a - 120 && rv.x < b + 120) {
      ctx.save();
      ctx.translate(rv.x, rv.y - 23 - 12); // far lane: a touch higher and smaller
      ctx.rotate(rv.a);
      ctx.scale(0.92, 0.92);
      drawKart(ctx, this.sprinty, rv.spin);
      ctx.restore();
      if (this.race.state === "idle" || this.race.state === "ready") {
        ctx.fillStyle = PAL.ink;
        ctx.textAlign = "center";
        ctx.font = "800 15px Figtree, sans-serif";
        this.speech(rv.x, rv.y - 100, "Race me!");
      }
    }
    this.cars.forEach((c, i) => {
      if (c.x < a - 150 || c.x > b + 150) return;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      ctx.scale(c.flip >= 0 ? Math.max(0.05, c.flip) : Math.min(-0.05, c.flip), 1);
      drawCar(ctx, {
        spec: c.spec,
        wheels: c.wheelsLocal(),
        spin: c.spin * (c.flip < 0 ? -1 : 1),
        driver: i === this.driving ? this.me.idle : null,
        lights: 0,
        boost: i === this.driving && this.boosting,
        t: this.time,
      });
      ctx.restore();
    });
  }

  private headlight(c: CarBody, night: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.a);
    ctx.scale(c.dir, 1);
    const g = ctx.createRadialGradient(70, -10, 4, 150, 0, 220);
    g.addColorStop(0, `rgba(255,236,170,${0.5 * night})`);
    g.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(66, -14);
    ctx.lineTo(300, -80);
    ctx.lineTo(300, 70);
    ctx.lineTo(66, -6);
    ctx.fill();
    ctx.restore();
  }

  private drawPlayer() {
    const ctx = this.ctx;
    const p = this.p;
    // contact shadow
    const gy = p.plat ? p.plat.y : ground(p.x);
    const hgt = Math.max(0, gy - p.y);
    ctx.fillStyle = `rgba(22,21,18,${0.22 * Math.max(0.2, 1 - hgt / 300)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, gy, 24 * Math.max(0.4, 1 - hgt / 400), 5, 0, 0, Math.PI * 2);
    ctx.fill();
    const moving = p.ground && Math.abs(p.vx) > 20;
    const sp = !p.ground ? this.me.jump : moving ? this.me.walk[Math.floor(p.phase) % 4] : this.me.idle;
    const bob = moving ? Math.abs(Math.sin(p.phase * Math.PI * 0.5)) * 4 : 0;
    const tilt = moving ? Math.sin(p.phase * Math.PI) * 0.05 : !p.ground ? clamp(p.vx / 3000, -0.12, 0.12) : 0;
    ctx.save();
    ctx.translate(p.x, p.y - bob);
    ctx.rotate(tilt);
    // paper flip: squash to a sliver while turning around
    const fl = p.flip;
    ctx.scale((fl >= 0 ? Math.max(0.06, fl) : Math.min(-0.06, fl)) * p.sx, p.sy);
    drawSprite(ctx, sp, 70);
    ctx.restore();
  }

  private drawNpcs() {
    if (!this.npcSprites.length) return;
    const ctx = this.ctx;
    const [a, b] = this.span(0.85);
    for (const n of this.npcs) {
      if (n.x < a - 60 || n.x > b + 60) continue;
      const sp = this.npcSprites[n.look];
      ctx.save();
      ctx.translate(n.x, -2 - Math.abs(Math.sin(n.phase * Math.PI * 0.5)) * 3);
      ctx.scale(n.dir, 1);
      drawSprite(ctx, sp.walk[Math.floor(n.phase) % 4], 56);
      ctx.restore();
      if (n.sayT > 0) this.speech(n.x, -104, n.say);
    }
  }

  private speech(x: number, y: number, text: string) {
    const ctx = this.ctx;
    ctx.font = "800 14px Figtree, system-ui, sans-serif";
    const w = Math.min(260, ctx.measureText(text).width + 24);
    ctx.fillStyle = "rgba(22,21,18,.18)";
    this.rrect(x - w / 2 + 3, y - 17, w, 32, 14);
    ctx.fill();
    ctx.fillStyle = PAL.cream;
    this.rrect(x - w / 2, y - 20, w, 32, 14);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 11);
    ctx.lineTo(x, y + 20);
    ctx.lineTo(x + 6, y + 11);
    ctx.fill();
    ctx.fillStyle = PAL.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y - 4, w - 16);
  }
  private rrect(x: number, y: number, w: number, h: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const q of this.particles) {
      const t = q.life / q.max;
      ctx.globalAlpha = Math.min(1, t * 1.5);
      if (q.kind === "ring") {
        ctx.strokeStyle = q.color;
        ctx.lineWidth = 4 * t;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 24 + (1 - t) * 60, 0, Math.PI * 2);
        ctx.stroke();
      } else if (q.kind === "confetti") {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.rot);
        ctx.fillStyle = q.color;
        ctx.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2);
        ctx.restore();
      } else {
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
