/* =====================================================================
   Knowledge World — a small 3D open world (three.js).
   Walk your cartoon character around a bright city, jump into any
   parked car, race a lap through checkpoints, and pop floating
   knowledge bubbles for trivia. Everything is local: no server calls.

   Performance budget (phones first):
   - city geometry is merged by material (a handful of draw calls),
     trees and lane markings are instanced;
   - real shadows only on desktop; blob shadows everywhere;
   - pixel ratio capped, loop paused when the tab is hidden.
   ===================================================================== */
import {
  AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Fog,
  Group, HemisphereLight, IcosahedronGeometry, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D,
  PerspectiveCamera, PlaneGeometry, RepeatWrapping, Scene, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry,
  WebGLRenderer, type Material,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { animateRig, blobShadow, buildCharacter, type Rig } from "./character";

/* ---------------- public surface ---------------- */
export interface RaceHud {
  state: "idle" | "running" | "done";
  t: number; // seconds
  cp: number; // checkpoints passed
  cpTotal: number;
  best: number | null;
  last: number | null;
}
export interface HudState {
  mode: "foot" | "car";
  useLabel: string | null; // "Drive" / "Get out" when the use action is available
  hint: string;
  orbs: number;
  orbsTotal: number;
  coins: number;
  speed: number; // car speed, km/h-ish
  race: RaceHud;
}
export interface WorldOpts {
  canvas: HTMLCanvasElement;
  minimap: HTMLCanvasElement | null;
  look: number;
  mobile: boolean;
  onHud: (h: HudState) => void;
  onOrb: (id: number) => void; // the world pauses itself; call answer() to carry on
  onRaceDone: (t: number, best: boolean) => void;
}

/* ---------------- layout ---------------- */
const ROADS = [-100, -60, -20, 20, 60, 100]; // road centre lines (both axes)
const RW = 10; // road width
const BLOCKS = [-80, -40, 0, 40, 80]; // block centres
const BS = 30; // block size (between road edges)
const LIMIT = 124; // walkable / drivable edge
const PALETTE = ["#FF7EB6", "#3D7BFF", "#FF5A1F", "#FFD84D", "#C6F432", "#FFFEFA", "#8C7BFF", "#5EEAD4"];
const SKY = "#9ED8FF";
const STORE_KEY = "bsx.world";

interface Box { x0: number; x1: number; z0: number; z1: number; h: number }
interface Circle { x: number; z: number; r: number }
interface Car {
  g: Group;
  x: number;
  z: number;
  yaw: number;
  speed: number;
  wheels: Mesh[];
  steer: Group[];
  spin: number;
}
interface Orb { g: Group; x: number; z: number; taken: boolean; phase: number }

/* seeded random so the city is the same every visit */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function loadStore(): { coins: number; best: number | null } {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    return { coins: Number(v.coins) || 0, best: typeof v.best === "number" ? v.best : null };
  } catch {
    return { coins: 0, best: null };
  }
}
function saveStore(v: { coins: number; best: number | null }) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): CanvasTexture {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  draw(cv.getContext("2d")!);
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/* ===================================================================== */
export class KnowledgeWorld {
  private o: WorldOpts;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(60, 1, 0.5, 420);
  private sun!: DirectionalLight;
  private disposables: { dispose: () => void }[] = [];
  private ro: ResizeObserver | null = null;

  // world
  private boxes: Box[] = [];
  private circles: Circle[] = [];
  private cars: Car[] = [];
  private orbs: Orb[] = [];
  private rings: Mesh[] = [];
  private npcs: { rig: Rig; a: [number, number]; b: [number, number]; t: number; speed: number }[] = [];
  private clouds!: Group;
  private mapBase: HTMLCanvasElement | null = null;

  // player
  private rig: Rig;
  private p = { x: -12, y: 0, z: -90, yaw: Math.PI, vy: 0, phase: 0, moving: 0 }; // start in the park, facing the first car
  private car = -1; // index of the car being driven
  private keys = new Set<string>();
  private touch = { x: 0, y: 0, jump: false };
  private jumpWas = false;

  // race
  private cps: { x: number; z: number; alongX: boolean }[] = [];
  private race: RaceHud;
  private armed = true; // must leave the start zone before a new race can begin
  private doneAt = 0;

  // loop
  private running = false;
  private paused = false;
  private last = 0;
  private hudAt = 0;
  private mapAt = 0;
  private time = 0;
  private store = loadStore();
  private seenHint = false;

  constructor(o: WorldOpts) {
    this.o = o;
    this.renderer = new WebGLRenderer({ canvas: o.canvas, antialias: !o.mobile, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, o.mobile ? 1.5 : 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = !o.mobile;
    this.race = { state: "idle", t: 0, cp: 0, cpTotal: 0, best: this.store.best, last: null };

    this.scene.background = new Color(SKY);
    this.scene.fog = new Fog(SKY, 110, 300);
    this.buildLights();
    this.buildGround();
    this.buildCity();
    this.buildTrees();
    this.buildLandmarks();
    this.buildCars();
    this.buildOrbs();
    this.buildRace();
    this.buildNpcs();
    this.buildClouds();
    this.buildMinimap();

    this.rig = buildCharacter(o.look);
    this.scene.add(this.rig.root);
    this.placePlayer();
    this.camera.position.set(this.p.x - Math.sin(this.p.yaw) * 8, 4, this.p.z - Math.cos(this.p.yaw) * 8);

    this.resize();
    const parent = o.canvas.parentElement;
    if (parent && typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(parent);
    }
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);
    this.start();
  }

  /* ---------------- lifecycle ---------------- */
  private start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop(this.frame);
  }
  private stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }
  private onVis = () => (document.hidden ? this.stop() : !this.paused && this.start());

  dispose() {
    this.stop();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    this.ro?.disconnect();
    this.scene.traverse((obj) => {
      const m = obj as Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
  }

  private resize() {
    const el = this.o.canvas.parentElement;
    if (!el) return;
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 60; // portrait phones see a bit more
    this.camera.updateProjectionMatrix();
    if (!this.running) this.renderer.render(this.scene, this.camera);
  }

  /* ---------------- input ---------------- */
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.paused) return;
    const t = e.target as HTMLElement | null;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "w", "a", "s", "d"].includes(k)) e.preventDefault();
    if ((k === "e" || k === "Enter" || k === "f") && !e.repeat) {
      e.preventDefault();
      this.use();
    }
    this.keys.add(k);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.keys.delete(k);
  };
  private onBlur = () => this.keys.clear();

  /** Thumb stick: x = turn (-1 left … 1 right), y = forward (1) / back (-1). */
  setStick(x: number, y: number) {
    this.touch.x = Math.max(-1, Math.min(1, x));
    this.touch.y = Math.max(-1, Math.min(1, y));
  }
  setJump(on: boolean) {
    this.touch.jump = on;
  }

  private axis() {
    const k = this.keys;
    const kx = (k.has("ArrowRight") || k.has("d") ? 1 : 0) - (k.has("ArrowLeft") || k.has("a") ? 1 : 0);
    const ky = (k.has("ArrowUp") || k.has("w") ? 1 : 0) - (k.has("ArrowDown") || k.has("s") ? 1 : 0);
    return {
      x: Math.max(-1, Math.min(1, kx + this.touch.x)),
      y: Math.max(-1, Math.min(1, ky + this.touch.y)),
      jump: k.has(" ") || this.touch.jump,
    };
  }

  /** Enter the nearest car, or get out of the current one. */
  use() {
    if (this.paused) return;
    if (this.car >= 0) {
      const c = this.cars[this.car];
      const rx = Math.cos(c.yaw);
      const rz = -Math.sin(c.yaw);
      this.p.x = c.x + rx * 2.4;
      this.p.z = c.z + rz * 2.4;
      this.p.yaw = c.yaw;
      this.p.y = 0;
      c.speed = 0;
      this.car = -1;
      this.rig.root.visible = true;
      this.resolve(this.p, 0.6);
      if (this.race.state === "running") this.race = { ...this.race, state: "idle", t: 0, cp: 0 };
      this.showRing(-1);
      this.pushHud(true);
      return;
    }
    const i = this.nearCar();
    if (i >= 0) {
      this.car = i;
      this.rig.root.visible = false;
      this.pushHud(true);
    }
  }

  private nearCar(): number {
    let best = -1;
    let bd = 3.6 * 3.6;
    this.cars.forEach((c, i) => {
      const d = (c.x - this.p.x) ** 2 + (c.z - this.p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  /** Close a knowledge bubble and carry on playing. */
  answer(id: number, correct: boolean) {
    const orb = this.orbs[id];
    if (orb && !orb.taken) {
      orb.taken = true;
      orb.g.visible = false;
    }
    if (correct) this.store.coins += 50;
    else this.store.coins += 10;
    saveStore(this.store);
    this.paused = false;
    this.keys.clear();
    this.start();
    this.pushHud(true);
  }

  /* ---------------- building the world ---------------- */
  private lambert(color: string, extra: Partial<ConstructorParameters<typeof MeshLambertMaterial>[0]> = {}) {
    return new MeshLambertMaterial({ color, ...extra });
  }

  private buildLights() {
    this.scene.add(new HemisphereLight("#DDF1FF", "#6FA83A", 1.1));
    this.scene.add(new AmbientLight("#ffffff", 0.25));
    const sun = new DirectionalLight("#FFF4D6", 1.6);
    sun.position.set(40, 70, 30);
    if (!this.o.mobile) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const s = sun.shadow.camera;
      s.left = -45;
      s.right = 45;
      s.top = 45;
      s.bottom = -45;
      s.near = 10;
      s.far = 180;
      sun.shadow.bias = -0.0015;
    }
    this.scene.add(sun, sun.target);
    this.sun = sun;
  }

  private buildGround() {
    const grass = new Mesh(new PlaneGeometry(520, 520), this.lambert("#8BD450"));
    grass.rotation.x = -Math.PI / 2;
    grass.receiveShadow = true;
    this.scene.add(grass);

    // roads (one merged mesh) + lane dashes (instanced)
    const parts: BufferGeometry[] = [];
    const len = 2 * 100 + RW;
    for (const r of ROADS) {
      parts.push(new PlaneGeometry(len, RW).rotateX(-Math.PI / 2).translate(0, 0.02, r));
      parts.push(new PlaneGeometry(RW, len).rotateX(-Math.PI / 2).translate(r, 0.021, 0));
    }
    const roads = new Mesh(mergeGeometries(parts), this.lambert("#3B3A36"));
    roads.receiveShadow = true;
    this.scene.add(roads);

    const dashes: [number, number, boolean][] = [];
    for (const r of ROADS)
      for (let t = -100; t <= 100; t += 6) {
        if (ROADS.some((q) => Math.abs(q - t) < 7)) continue;
        dashes.push([t, r, true], [r, t, false]);
      }
    const dash = new InstancedMesh(new BoxGeometry(2.6, 0.02, 0.35), new MeshBasicMaterial({ color: "#FFD84D" }), dashes.length);
    const tmp = new Object3D();
    dashes.forEach(([x, z, alongX], i) => {
      tmp.position.set(x, 0.035, z);
      tmp.rotation.set(0, alongX ? 0 : Math.PI / 2, 0);
      tmp.updateMatrix();
      dash.setMatrixAt(i, tmp.matrix);
    });
    this.scene.add(dash);

    // sidewalks around every block
    const walks: BufferGeometry[] = [];
    for (const bx of BLOCKS) for (const bz of BLOCKS) walks.push(new BoxGeometry(BS, 0.12, BS).translate(bx, 0.06, bz));
    const walk = new Mesh(mergeGeometries(walks), this.lambert("#E4E1D8"));
    walk.receiveShadow = true;
    this.scene.add(walk);

    // distant hills
    const hills: BufferGeometry[] = [];
    const r = rng(7);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const d = 200 + r() * 30;
      const h = 30 + r() * 40;
      hills.push(new ConeGeometry(28 + r() * 16, h, 6).translate(Math.cos(a) * d, h / 2 - 2, Math.sin(a) * d));
    }
    this.scene.add(new Mesh(mergeGeometries(hills), this.lambert("#6FB6A0", { flatShading: true })));
  }

  private windowTex() {
    const t = canvasTex(64, 64, (c) => {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, 64, 64);
      c.fillStyle = "#26303A";
      for (const x of [8, 36]) for (const y of [10, 38]) c.fillRect(x, y, 20, 18);
      c.fillStyle = "rgba(255,255,255,.35)";
      for (const x of [8, 36]) for (const y of [10, 38]) c.fillRect(x + 2, y + 2, 6, 14);
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    this.disposables.push(t);
    return t;
  }

  /** Box with windows every 4 units on the sides and a plain roof. */
  private building(w: number, h: number, d: number, x: number, z: number): BufferGeometry {
    const g = new BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const scale = (face: number, su: number, sv: number) => {
      for (let i = face * 4; i < face * 4 + 4; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    };
    scale(0, d / 4, h / 4);
    scale(1, d / 4, h / 4);
    scale(4, w / 4, h / 4);
    scale(5, w / 4, h / 4);
    for (const f of [2, 3]) for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, 0.02, 0.02); // roof: solid colour
    return g.translate(x, h / 2 + 0.12, z);
  }

  private buildCity() {
    const r = rng(42);
    const byColor = new Map<string, BufferGeometry[]>();
    const roofs: BufferGeometry[] = [];
    const add = (color: string, g: BufferGeometry) => {
      const l = byColor.get(color) || [];
      l.push(g);
      byColor.set(color, l);
    };
    const special = new Set(["0,0", "-40,40", "40,-40", "0,-80"]);
    for (const bx of BLOCKS)
      for (const bz of BLOCKS) {
        if (special.has(`${bx},${bz}`)) continue;
        const outer = Math.abs(bx) === 80 || Math.abs(bz) === 80;
        if (outer) {
          // houses with pitched roofs
          for (const [ox, oz] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
            if (r() < 0.2) continue;
            const w = 8 + r() * 2;
            const h = 4 + r() * 3;
            const x = bx + ox;
            const z = bz + oz;
            add(PALETTE[Math.floor(r() * PALETTE.length)], this.building(w, h, w, x, z));
            roofs.push(new ConeGeometry(w * 0.78, 3, 4).rotateY(Math.PI / 4).translate(x, h + 0.12 + 1.5, z));
            this.boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - w / 2, z1: z + w / 2, h: h + 3 });
          }
        } else {
          // downtown towers
          const split = r() < 0.5;
          const cells: [number, number, number, number][] = split
            ? [[-6.5, -6.5, 11, 11], [6.5, -6.5, 11, 11], [-6.5, 6.5, 11, 11], [6.5, 6.5, 11, 11]]
            : [[0, -6.5, 24, 11], [0, 6.5, 24, 11]];
          for (const [ox, oz, w, d] of cells) {
            if (r() < 0.12) continue;
            const h = 10 + r() * 26;
            const x = bx + ox;
            const z = bz + oz;
            add(PALETTE[Math.floor(r() * PALETTE.length)], this.building(w, h, d, x, z));
            this.boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, h });
          }
        }
      }
    const win = this.windowTex();
    for (const [color, gs] of byColor) {
      const mesh = new Mesh(mergeGeometries(gs), this.lambert(color, { map: win }));
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
    const roofMesh = new Mesh(mergeGeometries(roofs), this.lambert("#C8553D", { flatShading: true }));
    roofMesh.castShadow = true;
    this.scene.add(roofMesh);
  }

  private treeSpots: [number, number][] = [];
  private buildTrees() {
    const r = rng(9);
    const spots = this.treeSpots;
    // parks
    for (const [bx, bz] of [[0, 0], [-40, 40], [0, -80]] as [number, number][])
      for (let i = 0; i < 12; i++) {
        const x = bx + (r() - 0.5) * 24;
        const z = bz + (r() - 0.5) * 24;
        if (bx === 0 && bz === 0 && Math.hypot(x, z) < 12) continue; // lake
        if (bx === 0 && bz === -80 && Math.abs(x) < 5) continue; // path to the start
        spots.push([x, z]);
      }
    // outside the ring road
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      const d = 110 + r() * 60;
      spots.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    const trunk = new InstancedMesh(new CylinderGeometry(0.25, 0.35, 2, 6), this.lambert("#7A5234"), spots.length);
    const crown = new InstancedMesh(new IcosahedronGeometry(1.8, 0), this.lambert("#ffffff", { flatShading: true }), spots.length);
    const tmp = new Object3D();
    const shades = ["#2E9E4F", "#3DB35E", "#58C46A", "#1F8A45"].map((c) => new Color(c));
    spots.forEach(([x, z], i) => {
      const s = 0.8 + r() * 0.6;
      tmp.position.set(x, s, z);
      tmp.scale.set(s, s, s);
      tmp.rotation.set(0, r() * 6, 0);
      tmp.updateMatrix();
      trunk.setMatrixAt(i, tmp.matrix);
      tmp.position.y = 2 * s + 1.2 * s;
      tmp.updateMatrix();
      crown.setMatrixAt(i, tmp.matrix);
      crown.setColorAt(i, shades[i % shades.length]);
      if (Math.abs(x) < LIMIT && Math.abs(z) < LIMIT) this.circles.push({ x, z, r: 0.5 * s });
    });
    trunk.castShadow = crown.castShadow = true;
    this.scene.add(trunk, crown);
    // park lawns
    for (const [bx, bz] of [[0, 0], [-40, 40], [0, -80]] as [number, number][]) {
      const lawn = new Mesh(new PlaneGeometry(BS - 4, BS - 4), this.lambert("#7CCB45"));
      lawn.rotation.x = -Math.PI / 2;
      lawn.position.set(bx, 0.13, bz);
      lawn.receiveShadow = true;
      this.scene.add(lawn);
    }
  }

  private buildLandmarks() {
    // central lake + fountain
    const lake = new Mesh(new CircleGeometry(9, 32), new MeshLambertMaterial({ color: "#4FB3F2" }));
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(0, 0.16, 0);
    this.scene.add(lake);
    const rim = new Mesh(new TorusGeometry(9, 0.45, 6, 32), this.lambert("#E4E1D8"));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(0, 0.2, 0);
    this.scene.add(rim);
    const fountain = new Mesh(new CylinderGeometry(1.2, 1.6, 1.4, 12), this.lambert("#FFFEFA"));
    fountain.position.set(0, 0.8, 0);
    this.scene.add(fountain);
    this.circles.push({ x: 0, z: 0, r: 9.4 });

    // Knowledge Tower (block 40,-40)
    const tower = new Group();
    tower.position.set(40, 0, -40);
    const shaft = new Mesh(new CylinderGeometry(6, 7.5, 44, 16), this.lambert("#161512"));
    shaft.position.y = 22;
    shaft.castShadow = true;
    tower.add(shaft);
    for (let i = 0; i < 6; i++) {
      const band = new Mesh(new CylinderGeometry(6.4 + (i === 5 ? 0.4 : 0), 6.6, 0.8, 16), new MeshBasicMaterial({ color: i % 2 ? "#FF5A1F" : "#C6F432" }));
      band.position.y = 6 + i * 7;
      tower.add(band);
    }
    const q = this.textSprite("?", "#C6F432", "#161512", 12);
    q.position.y = 52;
    tower.add(q);
    this.spinning.push(q);
    this.scene.add(tower);
    this.circles.push({ x: 40, z: -40, r: 7.8 });

    // welcome sign in the start park
    const sign = new Mesh(
      new PlaneGeometry(14, 3.5),
      new MeshBasicMaterial({
        map: canvasTex(512, 128, (c) => {
          c.fillStyle = "#161512";
          c.fillRect(0, 0, 512, 128);
          c.fillStyle = "#C6F432";
          c.font = "bold 64px Anton, Impact, sans-serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("KNOWLEDGE WORLD", 256, 68);
        }),
      }),
    );
    sign.position.set(0, 5.5, -70);
    sign.rotation.y = Math.PI;
    this.scene.add(sign);
    for (const x of [-6, 6]) {
      const post = new Mesh(new CylinderGeometry(0.25, 0.25, 4, 6), this.lambert("#161512"));
      post.position.set(x, 2, -70);
      this.scene.add(post);
      this.circles.push({ x, z: -70, r: 0.5 });
    }

    // plaza in the (-40,40) park: a stage
    const stage = new Mesh(new CylinderGeometry(6, 6, 0.6, 20), this.lambert("#FFD84D"));
    stage.position.set(-40, 0.3, 40);
    stage.receiveShadow = true;
    this.scene.add(stage);
  }

  private spinning: Object3D[] = [];

  private textSprite(text: string, bg: string, fg: string, size: number): Sprite {
    const tex = canvasTex(128, 128, (c) => {
      c.fillStyle = bg;
      c.beginPath();
      c.arc(64, 64, 60, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = fg;
      c.font = "bold 84px Anton, Impact, sans-serif";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(text, 64, 70);
    });
    const s = new Sprite(new SpriteMaterial({ map: tex, depthWrite: false }));
    s.scale.set(size, size, 1);
    return s;
  }

  private buildCars() {
    const spots: [number, number, number, string][] = [
      [-14, -98, Math.PI / 2, "#C6F432"], // right before the start arch
      [-22, -48, 0, "#FF5A1F"],
      [22, 36, Math.PI, "#3D7BFF"],
      [-58, 5, 0, "#FF7EB6"],
      [62, 55, 0, "#FFD84D"],
      [-98, -30, 0, "#FFFEFA"],
    ];
    const glass = new MeshLambertMaterial({ color: "#1C2A36" });
    const tyre = new MeshLambertMaterial({ color: "#1B1A17" });
    const hub = new MeshBasicMaterial({ color: "#D8D6CE" });
    const lamp = new MeshBasicMaterial({ color: "#FFF6C8" });
    const tail = new MeshBasicMaterial({ color: "#E5431A" });
    for (const [x, z, yaw, color] of spots) {
      const g = new Group();
      const paint = this.lambert(color);
      const body = new Mesh(new BoxGeometry(2.1, 0.75, 4.2), paint);
      body.position.y = 0.72;
      const cabin = new Mesh(new BoxGeometry(1.8, 0.7, 2.1), glass);
      cabin.position.set(0, 1.42, -0.25);
      const roof = new Mesh(new BoxGeometry(1.84, 0.12, 2.0), paint);
      roof.position.set(0, 1.82, -0.25);
      const bumper = new Mesh(new BoxGeometry(2.14, 0.28, 0.2), this.lambert("#161512"));
      bumper.position.set(0, 0.45, 2.12);
      for (const m of [body, cabin, roof]) m.castShadow = true;
      g.add(body, cabin, roof, bumper);
      for (const lx of [-0.7, 0.7]) {
        const h = new Mesh(new BoxGeometry(0.42, 0.2, 0.06), lamp);
        h.position.set(lx, 0.82, 2.11);
        const t = new Mesh(new BoxGeometry(0.42, 0.18, 0.06), tail);
        t.position.set(lx, 0.82, -2.11);
        g.add(h, t);
      }
      const wheels: Mesh[] = [];
      const steer: Group[] = [];
      for (const [wx, wz] of [[-1.05, 1.3], [1.05, 1.3], [-1.05, -1.3], [1.05, -1.3]]) {
        const holder = new Group();
        holder.position.set(wx, 0.42, wz);
        const w = new Mesh(new CylinderGeometry(0.42, 0.42, 0.36, 12), tyre);
        w.rotation.z = Math.PI / 2;
        const cap = new Mesh(new CylinderGeometry(0.2, 0.2, 0.38, 8), hub);
        w.add(cap);
        holder.add(w);
        g.add(holder);
        wheels.push(w);
        if (wz > 0) steer.push(holder);
      }
      g.add(blobShadow(2.3));
      g.position.set(x, 0, z);
      g.rotation.y = yaw;
      this.scene.add(g);
      this.cars.push({ g, x, z, yaw, speed: 0, wheels, steer, spin: 0 });
    }
  }

  private buildOrbs() {
    const spots: [number, number][] = [
      [0, -60], [-17, -17], [17, 17], [-40, 58], [60, -18], [-78, -60], [78, 60], [40, 60], [-82, 20], [18, -40], [-20, -80], [-60, -40],
    ];
    const inner = new MeshBasicMaterial({ color: "#C6F432" });
    const glow = new MeshBasicMaterial({ color: "#C6F432", transparent: true, opacity: 0.25, depthWrite: false });
    spots.forEach(([x, z], i) => {
      const g = new Group();
      g.position.set(x, 1.6, z);
      g.add(new Mesh(new IcosahedronGeometry(0.75, 1), inner));
      g.add(new Mesh(new SphereGeometry(1.2, 16, 12), glow));
      const q = this.textSprite("?", "rgba(0,0,0,0)", "#161512", 1.5);
      q.position.z = 0.01;
      g.add(q);
      g.add(this.beam());
      this.scene.add(g);
      this.orbs.push({ g, x, z, taken: false, phase: i * 0.7 });
    });
  }
  private beamGeo: CylinderGeometry | null = null;
  private beamMat: MeshBasicMaterial | null = null;
  private beam(): Mesh {
    this.beamGeo ||= new CylinderGeometry(0.08, 0.3, 30, 6, 1, true);
    this.beamMat ||= new MeshBasicMaterial({ color: "#C6F432", transparent: true, opacity: 0.18, depthWrite: false });
    const b = new Mesh(this.beamGeo, this.beamMat);
    b.position.y = 15;
    return b;
  }

  private buildRace() {
    this.cps = [
      { x: 70, z: -100, alongX: true },
      { x: 100, z: -40, alongX: false },
      { x: 100, z: 50, alongX: false },
      { x: 40, z: 100, alongX: true },
      { x: -50, z: 100, alongX: true },
      { x: -100, z: 30, alongX: false },
      { x: -100, z: -60, alongX: false },
      { x: -50, z: -100, alongX: true },
      { x: 0, z: -100, alongX: true }, // finish = start
    ];
    this.race.cpTotal = this.cps.length;
    const ringMat = new MeshBasicMaterial({ color: "#FF5A1F", transparent: true, opacity: 0.85 });
    const ringGeo = new TorusGeometry(5.2, 0.35, 8, 28);
    for (const c of this.cps) {
      const r = new Mesh(ringGeo, ringMat);
      r.position.set(c.x, 5.4, c.z);
      if (c.alongX) r.rotation.y = Math.PI / 2;
      r.visible = false;
      this.scene.add(r);
      this.rings.push(r);
    }
    // start / finish arch across the road at (0,-100)
    const arch = new Group();
    arch.position.set(0, 0, -100);
    const check = canvasTex(256, 32, (c) => {
      for (let i = 0; i < 16; i++)
        for (let j = 0; j < 2; j++) {
          c.fillStyle = (i + j) % 2 ? "#161512" : "#FFFEFA";
          c.fillRect(i * 16, j * 16, 16, 16);
        }
    });
    const ink = this.lambert("#161512");
    const flag = new MeshBasicMaterial({ map: check });
    const beam = new Mesh(new BoxGeometry(0.8, 1.4, 12.4), [flag, flag, ink, ink, ink, ink]); // checkers face the drivers (±x)
    beam.position.y = 7.2;
    const label = new Mesh(
      new PlaneGeometry(8, 1.6),
      new MeshBasicMaterial({
        map: canvasTex(256, 52, (c) => {
          c.fillStyle = "#C6F432";
          c.fillRect(0, 0, 256, 52);
          c.fillStyle = "#161512";
          c.font = "bold 40px Anton, Impact, sans-serif";
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillText("START · FINISH", 128, 29);
        }),
      }),
    );
    label.position.set(-0.45, 8.9, 0);
    label.rotation.y = -Math.PI / 2;
    const label2 = label.clone();
    label2.position.x = 0.45;
    label2.rotation.y = Math.PI / 2;
    arch.add(beam, label, label2);
    for (const z of [-6, 6]) {
      const post = new Mesh(new BoxGeometry(0.8, 8, 0.8), this.lambert("#FF5A1F"));
      post.position.set(0, 4, z);
      post.castShadow = true;
      arch.add(post);
      this.circles.push({ x: 0, z: -100 + z, r: 0.7 });
    }
    // checkered line on the road
    const line = new Mesh(new PlaneGeometry(1.6, RW), new MeshBasicMaterial({ map: check }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, 0.04, -100);
    this.scene.add(arch, line);
  }

  private buildNpcs() {
    const routes: [[number, number], [number, number], number][] = [
      [[-93, -93.5], [-67, -93.5], 8],
      [[26, 34], [26, 54], 3],
      [[-26, 14], [-26, -14], 12],
      [[66, -34], [66, -14], 6],
    ];
    for (const [a, b, look] of routes.slice(0, this.o.mobile ? 2 : 4)) {
      const rig = buildCharacter(look);
      this.scene.add(rig.root);
      this.npcs.push({ rig, a, b, t: Math.random(), speed: 0.05 + Math.random() * 0.03 });
    }
  }

  private buildClouds() {
    const r = rng(3);
    const parts: BufferGeometry[] = [];
    for (let i = 0; i < 14; i++) {
      const x = (r() - 0.5) * 360;
      const z = (r() - 0.5) * 360;
      const y = 60 + r() * 25;
      for (let k = 0; k < 3; k++) parts.push(new SphereGeometry(5 + r() * 4, 8, 6).scale(1.6, 0.7, 1).translate(x + k * 6, y + r() * 2, z + (r() - 0.5) * 4));
    }
    this.clouds = new Group();
    this.clouds.add(new Mesh(mergeGeometries(parts), new MeshBasicMaterial({ color: "#FFFFFF", fog: false })));
    this.scene.add(this.clouds);
  }

  /* ---------------- minimap ---------------- */
  private static MAP = 150; // px
  private toMap(v: number) {
    return ((v + 130) / 260) * KnowledgeWorld.MAP;
  }
  private buildMinimap() {
    if (!this.o.minimap) return;
    const S = KnowledgeWorld.MAP;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#8BD450";
    c.fillRect(0, 0, S, S);
    const k = S / 260;
    c.fillStyle = "#3B3A36";
    for (const r of ROADS) {
      c.fillRect(this.toMap(-105), this.toMap(r - RW / 2), 210 * k, RW * k);
      c.fillRect(this.toMap(r - RW / 2), this.toMap(-105), RW * k, 210 * k);
    }
    c.fillStyle = "#7CCB45";
    for (const [bx, bz] of [[0, 0], [-40, 40], [0, -80]]) c.fillRect(this.toMap(bx - 13), this.toMap(bz - 13), 26 * k, 26 * k);
    c.fillStyle = "#4FB3F2";
    c.beginPath();
    c.arc(this.toMap(0), this.toMap(0), 9 * k, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#D8D6CE";
    for (const b of this.boxes) c.fillRect(this.toMap(b.x0), this.toMap(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    c.fillStyle = "#161512";
    c.beginPath();
    c.arc(this.toMap(40), this.toMap(-40), 7 * k, 0, Math.PI * 2);
    c.fill();
    this.mapBase = cv;
    this.o.minimap.width = this.o.minimap.height = S;
  }
  private drawMinimap() {
    const cv = this.o.minimap;
    if (!cv || !this.mapBase) return;
    const c = cv.getContext("2d")!;
    // +x → right, +z → down
    c.drawImage(this.mapBase, 0, 0);
    for (const o of this.orbs) {
      if (o.taken) continue;
      c.fillStyle = "#C6F432";
      c.strokeStyle = "#161512";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(this.toMap(o.x), this.toMap(o.z), 3.2, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    this.cars.forEach((car, i) => {
      if (i === this.car) return;
      c.fillStyle = "#FFFEFA";
      c.fillRect(this.toMap(car.x) - 2.5, this.toMap(car.z) - 2.5, 5, 5);
    });
    if (this.race.state === "running") {
      const cp = this.cps[this.race.cp];
      c.strokeStyle = "#FF5A1F";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(this.toMap(cp.x), this.toMap(cp.z), 5, 0, Math.PI * 2);
      c.stroke();
    } else {
      c.fillStyle = "#FF5A1F";
      c.fillRect(this.toMap(0) - 2, this.toMap(-100) - 5, 4, 10);
    }
    const me = this.car >= 0 ? this.cars[this.car] : { x: this.p.x, z: this.p.z, yaw: this.p.yaw };
    const px = this.toMap(me.x);
    const pz = this.toMap(me.z);
    c.save();
    c.translate(px, pz);
    c.rotate(-me.yaw); // forward (+z) points down on the map at yaw 0
    c.fillStyle = "#FF5A1F";
    c.strokeStyle = "#fff";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, 7);
    c.lineTo(5, -5);
    c.lineTo(0, -2);
    c.lineTo(-5, -5);
    c.closePath();
    c.stroke();
    c.fill();
    c.restore();
  }

  /* ---------------- physics ---------------- */
  private resolve(p: { x: number; z: number }, r: number): boolean {
    let hit = false;
    for (const b of this.boxes) {
      const cx = Math.max(b.x0, Math.min(p.x, b.x1));
      const cz = Math.max(b.z0, Math.min(p.z, b.z1));
      let dx = p.x - cx;
      let dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
      } else {
        // centre inside the box: push out through the nearest side
        const opts = [p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z];
        const m = Math.min(...opts);
        if (m === opts[0]) p.x = b.x0 - r;
        else if (m === opts[1]) p.x = b.x1 + r;
        else if (m === opts[2]) p.z = b.z0 - r;
        else p.z = b.z1 + r;
        dx = dz = 0;
      }
    }
    const circ = (c: Circle) => {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const rr = c.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) return;
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (rr - d);
      p.z += (dz / d) * (rr - d);
      hit = true;
    };
    this.circles.forEach(circ);
    this.cars.forEach((c, i) => {
      if (i !== this.car) circ({ x: c.x, z: c.z, r: 1.7 });
    });
    const lim = LIMIT;
    if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) {
      p.x = Math.max(-lim, Math.min(lim, p.x));
      p.z = Math.max(-lim, Math.min(lim, p.z));
      hit = true;
    }
    return hit;
  }

  /** Blocks sit on a 12 cm sidewalk slab; roads are at 0. */
  private groundAt(x: number, z: number) {
    const inBlock = (v: number) => BLOCKS.some((b) => Math.abs(v - b) <= BS / 2);
    return inBlock(x) && inBlock(z) ? 0.12 : 0;
  }

  private placePlayer() {
    this.rig.root.position.set(this.p.x, this.p.y + this.groundAt(this.p.x, this.p.z), this.p.z);
    this.rig.root.rotation.y = this.p.yaw;
  }

  /* ---------------- main loop ---------------- */
  private frame = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    if (!this.paused) this.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  private update(dt: number) {
    const inp = this.axis();
    const jumpEdge = inp.jump && !this.jumpWas;
    this.jumpWas = inp.jump;
    let fx: number;
    let fz: number;
    let yaw: number;
    let camBack: number;
    let camUp: number;

    if (this.car < 0) {
      // ---- on foot ----
      const p = this.p;
      p.yaw -= inp.x * 2.9 * dt;
      const speed = inp.y * (inp.y > 0 ? 9 : 5);
      const ox = p.x;
      const oz = p.z;
      p.x += Math.sin(p.yaw) * speed * dt;
      p.z += Math.cos(p.yaw) * speed * dt;
      this.resolve(p, 0.6);
      if (jumpEdge && p.y <= 0) p.vy = 7.8;
      p.vy -= 24 * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y <= 0) p.vy = 0;
      const moved = Math.hypot(p.x - ox, p.z - oz);
      p.phase += moved * 1.6;
      p.moving += ((Math.abs(inp.y) > 0.05 ? 1 : 0) - p.moving) * Math.min(1, dt * 10);
      animateRig(this.rig, p.phase, p.moving, p.y > 0.05);
      this.placePlayer();
      fx = p.x;
      fz = p.z;
      yaw = p.yaw;
      camBack = 7.5;
      camUp = 3.6;
    } else {
      // ---- driving ----
      const c = this.cars[this.car];
      const hb = inp.jump;
      const th = inp.y;
      if (th > 0) c.speed += (c.speed < 0 ? 38 : 20) * th * dt;
      else if (th < 0) c.speed += (c.speed > 0 ? -38 : -14) * -th * dt;
      else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 7 * dt);
      c.speed -= c.speed * 0.28 * dt;
      if (hb) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 16 * dt);
      c.speed = Math.max(-12, Math.min(46, c.speed));
      const grip = Math.min(1, Math.abs(c.speed) / 7);
      c.yaw -= inp.x * 1.9 * grip * Math.sign(c.speed || 1) * (hb ? 1.55 : 1) * dt;
      const pos = { x: c.x + Math.sin(c.yaw) * c.speed * dt, z: c.z + Math.cos(c.yaw) * c.speed * dt };
      if (this.resolve(pos, 1.7)) c.speed *= Math.pow(0.2, dt * 6);
      c.x = pos.x;
      c.z = pos.z;
      c.spin += (c.speed * dt) / 0.42;
      c.wheels.forEach((w) => w.rotation.set(c.spin, 0, Math.PI / 2));
      c.steer.forEach((s) => (s.rotation.y = -inp.x * 0.45));
      c.g.position.set(c.x, 0, c.z);
      c.g.rotation.y = c.yaw;
      c.g.rotation.z = -inp.x * Math.min(1, Math.abs(c.speed) / 30) * 0.05; // body roll
      this.p.x = c.x;
      this.p.z = c.z;
      fx = c.x;
      fz = c.z;
      yaw = c.yaw;
      camBack = 11 + Math.abs(c.speed) * 0.06;
      camUp = 4.6;
      this.updateRace(dt, c);
    }

    // orbs
    for (const o of this.orbs) {
      if (o.taken) continue;
      o.g.position.y = 1.6 + Math.sin(this.time * 2 + o.phase) * 0.3;
      o.g.rotation.y += dt * 1.4;
      if ((o.x - fx) ** 2 + (o.z - fz) ** 2 < (this.car >= 0 ? 3.2 : 2.2) ** 2) {
        this.paused = true;
        this.keys.clear();
        this.touch = { x: 0, y: 0, jump: false };
        if (this.car >= 0) this.cars[this.car].speed = 0;
        this.stop();
        this.renderer.render(this.scene, this.camera);
        this.o.onOrb(this.orbs.indexOf(o));
        return;
      }
    }
    for (const s of this.spinning) s.position.y = 52 + Math.sin(this.time * 1.5) * 1.2;
    for (const r of this.rings) if (r.visible) r.rotation.z += dt;

    // npcs stroll back and forth
    for (const n of this.npcs) {
      n.t += dt * n.speed;
      const k = (Math.sin(n.t * Math.PI * 2 - Math.PI / 2) + 1) / 2;
      const dir = Math.cos(n.t * Math.PI * 2 - Math.PI / 2) >= 0 ? 1 : -1;
      const x = n.a[0] + (n.b[0] - n.a[0]) * k;
      const z = n.a[1] + (n.b[1] - n.a[1]) * k;
      n.rig.root.position.set(x, 0.12, z);
      n.rig.root.rotation.y = Math.atan2((n.b[0] - n.a[0]) * dir, (n.b[1] - n.a[1]) * dir);
      animateRig(n.rig, n.t * 40, 0.8, false);
    }
    this.clouds.position.x = ((this.time * 1.5 + 180) % 360) - 180;

    // camera (chase), lifted when a building is in the way
    const cx = fx - Math.sin(yaw) * camBack;
    const cz = fz - Math.cos(yaw) * camBack;
    let cy = camUp + (this.car < 0 ? this.p.y * 0.5 : 0);
    for (const b of this.boxes) if (cx > b.x0 - 1 && cx < b.x1 + 1 && cz > b.z0 - 1 && cz < b.z1 + 1) cy = Math.max(cy, b.h + 3);
    const a = 1 - Math.exp(-dt * (this.car >= 0 ? 5 : 6));
    this.camera.position.x += (cx - this.camera.position.x) * a;
    this.camera.position.y += (cy - this.camera.position.y) * a;
    this.camera.position.z += (cz - this.camera.position.z) * a;
    this.camera.lookAt(fx + Math.sin(yaw) * 3, 1.4 + (this.car < 0 ? this.p.y * 0.6 : 0), fz + Math.cos(yaw) * 3);

    // shadow camera follows the player
    this.sun.position.set(fx + 40, 70, fz + 30);
    this.sun.target.position.set(fx, 0, fz);

    const now = performance.now();
    if (now - this.hudAt > 120) this.pushHud();
    if (now - this.mapAt > 100) {
      this.mapAt = now;
      this.drawMinimap();
    }
  }

  private showRing(i: number) {
    this.rings.forEach((r, k) => (r.visible = k === i));
  }

  private updateRace(dt: number, c: Car) {
    const dStart = Math.hypot(c.x, c.z + 100);
    const R = this.race;
    if (R.state === "done" && performance.now() - this.doneAt > 6000) this.race = { ...R, state: "idle" };
    if (dStart > 16) this.armed = true;
    if (this.race.state === "idle" && this.armed && dStart < 7 && Math.abs(c.speed) > 2) {
      this.race = { ...this.race, state: "running", t: 0, cp: 0 };
      this.armed = false;
      this.showRing(0);
      return;
    }
    if (this.race.state !== "running") return;
    this.race.t += dt;
    const cp = this.cps[this.race.cp];
    if (Math.hypot(c.x - cp.x, c.z - cp.z) < 8.5) {
      this.race.cp++;
      if (this.race.cp >= this.cps.length) {
        const t = Math.round(this.race.t * 100) / 100;
        const best = this.store.best == null || t < this.store.best;
        if (best) this.store.best = t;
        this.store.coins += best ? 100 : 40;
        saveStore(this.store);
        this.race = { ...this.race, state: "done", last: t, best: this.store.best };
        this.doneAt = performance.now();
        this.armed = false;
        this.showRing(-1);
        this.o.onRaceDone(t, best);
      } else this.showRing(this.race.cp);
      this.pushHud(true);
    }
  }

  private pushHud(force = false) {
    const now = performance.now();
    if (!force && now - this.hudAt < 120) return;
    this.hudAt = now;
    const inCar = this.car >= 0;
    const near = !inCar ? this.nearCar() : -1;
    const taken = this.orbs.filter((o) => o.taken).length;
    const tap = this.o.mobile;
    let hint = "";
    if (inCar) {
      if (this.race.state === "running") hint = `Checkpoint ${this.race.cp + 1} of ${this.cps.length} — follow the orange rings`;
      else if (this.race.state === "done") hint = this.race.last != null ? `Lap time ${this.race.last.toFixed(2)}s` : "";
      else hint = `Drive through the START arch to race a lap · ${tap ? "tap DRIFT" : "Space"} to drift`;
    } else if (near >= 0) hint = tap ? "Tap DRIVE to get in" : "Press E to drive this car";
    else if (!this.seenHint) hint = tap ? "Use the stick to walk · find a car · pop the ? bubbles" : "Arrow keys to walk · Space to jump · find a car · pop the ? bubbles";
    if (this.time > 12) this.seenHint = true;
    this.o.onHud({
      mode: inCar ? "car" : "foot",
      useLabel: inCar ? "Get out" : near >= 0 ? "Drive" : null,
      hint,
      orbs: taken,
      orbsTotal: this.orbs.length,
      coins: this.store.coins,
      speed: inCar ? Math.round(Math.abs(this.cars[this.car].speed) * 3.2) : 0,
      race: { ...this.race },
    });
  }
}
