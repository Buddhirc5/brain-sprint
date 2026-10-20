/* Arena Map in real 3D (three.js). Floating low-poly islands built from the same tile world as the flat
   map (lib/arenaWorld.ts), lit by a sun with soft shadows. Players are their own characters drawn as
   camera-facing sprites: you run along the path to your stop, teammates stand and wander around theirs.
   Drag to move along the map, pinch or ctrl+wheel to zoom. HTML labels (stops, signs) are positioned
   over the canvas every frame by projecting their 3D anchor points. */
import {
  AmbientLight, BoxGeometry, BufferGeometry, CanvasTexture, CapsuleGeometry, CircleGeometry, Color, ConeGeometry, CylinderGeometry,
  DirectionalLight, DodecahedronGeometry, DoubleSide, Euler, Group, HemisphereLight, IcosahedronGeometry, InstancedMesh, Material, Matrix4,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, OctahedronGeometry, OrthographicCamera, PCFShadowMap, Plane, PlaneGeometry,
  Quaternion, Raycaster, RepeatWrapping, Scene, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from "three";
import type { Deco, Land } from "../../lib/arenaMap";
import { hash, key, type World } from "../../lib/arenaWorld";
import type { Player } from "../../types";
import { CHIBI_ASPECT, chibiTexture } from "./chibiTexture";
import { makeCritters, type Critter } from "./critters";

export interface Anchor { el: HTMLElement; x: number; y: number; z: number; clamp?: number }
export interface MateInfo { p: Player; u: number; v: number; line: string }
export interface Arena3DInput {
  host: HTMLElement; // gets the canvas
  layer: HTMLElement; // the scene's own labels (names, YOU, bubbles)
  world: World;
  lands: Land[];
  me: Player;
  meAt: { u: number; v: number } | null; // the stop the player stands on
  meFrom: number; // path index the run starts from (−1 = no run)
  meLine: string;
  mates: MateInfo[]; // teammates, each at their furthest stop
  overflow: { u: number; v: number; n: number }[]; // "+N" where a stop has more teammates than shown
  reduced: boolean;
  /** "pop" (a character), "arrive" (you reached your stop) or an animal's name */
  onSound?: (what: string) => void;
}

const OFF = new Vector3(10, 8.2, 10); // camera direction: 2:1 isometric, looking toward −u −v
const UP = new Vector3(0, 1, 0);
const ME_H = 1.25, MATE_H = 0.95;
const PER_STOP = 4;

type Runner = {
  p: Player; me: boolean; sprite: Sprite; shadow: Mesh; label?: HTMLElement;
  pos: Vector3; home: Vector3; route: Vector3[]; seg: number; segT: number; speed: number;
  idleUntil: number; phase: number; hop: number; face: 1 | -1;
};

export class Arena3D {
  private r: WebGLRenderer;
  private scene = new Scene();
  private cam: OrthographicCamera;
  private target = new Vector3();
  private goal: Vector3 | null = null;
  private zoom = 1;
  private sun: DirectionalLight;
  private anchors: Anchor[] = [];
  private runners: Runner[] = [];
  private dust: { s: Sprite; life: number }[] = [];
  private anim: ((t: number, dt: number) => void)[] = [];
  private bounds = { u0: 0, u1: 0, v0: 0, v1: 0 };
  private walk = new Set<string>();
  private raf = 0;
  private last = 0;
  private alive = true;
  private visible = true;
  private follow = true;
  private bubble: { el: HTMLElement; at: () => Vector3; until: number } | null = null;
  private critters: Critter[] = [];
  private landOf = new Map<string, number>();
  private plusTags: { el: HTMLElement; x: number; y: number; z: number }[] = [];
  private ro: ResizeObserver;
  private io: IntersectionObserver;
  private disposers: (() => void)[] = [];

  constructor(private I: Arena3DInput) {
    this.r = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.r.outputColorSpace = SRGBColorSpace;
    this.r.shadowMap.enabled = true;
    this.r.shadowMap.type = PCFShadowMap;
    this.r.domElement.className = "am3d-canvas";
    I.host.appendChild(this.r.domElement);

    this.cam = new OrthographicCamera(-1, 1, 1, -1, -60, 200);
    this.scene.add(new HemisphereLight("#EAF6FF", "#8C7A5B", 1.55));
    this.scene.add(new AmbientLight("#ffffff", 0.25));
    this.sun = new DirectionalLight("#FFF1D6", 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -11;
    this.sun.shadow.camera.right = 11;
    this.sun.shadow.camera.top = 11;
    this.sun.shadow.camera.bottom = -11;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.buildWorld();
    this.buildSky();
    this.critters = makeCritters(
      this.scene, I.lands,
      (li) => [...this.walk].filter((k) => this.landOf.get(k) === li).map((k) => k.split(",").map(Number) as [number, number]),
      this.anim, () => this.target,
    );
    void this.buildPeople();

    const start = I.meAt ? new Vector3(I.meAt.u, 0, I.meAt.v) : new Vector3(0, 0, 0);
    this.target.copy(start);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(I.host);
    this.io = new IntersectionObserver(([e]) => {
      this.visible = e.isIntersecting;
      if (this.visible) this.kick();
    });
    this.io.observe(I.host);
    const vis = () => !document.hidden && this.kick();
    document.addEventListener("visibilitychange", vis);
    this.disposers.push(() => document.removeEventListener("visibilitychange", vis));
    this.controls();
    this.resize();
    this.kick();
  }

  /** HTML elements to keep over their 3D points (stops, signs…). */
  setAnchors(a: Anchor[]) {
    this.anchors = a;
    this.place();
  }

  focusMe() {
    const me = this.runners.find((x) => x.me);
    this.goal = (me ? me.pos : this.I.meAt ? new Vector3(this.I.meAt.u, 0, this.I.meAt.v) : new Vector3()).clone();
    this.follow = true;
    this.kick();
  }

  dispose() {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.io.disconnect();
    this.disposers.forEach((f) => f());
    this.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as Material | Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
        const map = (x as MeshBasicMaterial).map;
        if (map && !(map as CanvasTexture).userData?.shared) map.dispose();
        x.dispose();
      });
    });
    this.r.dispose();
    this.r.domElement.remove();
    this.I.layer.replaceChildren();
  }

  /* ---------------- loop ---------------- */
  private kick() {
    if (!this.raf && this.alive) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.alive || !this.visible || document.hidden) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = now / 1000;
    if (!this.I.reduced) this.anim.forEach((f) => f(t, dt));
    this.moveRunners(t, dt);
    this.updateDust(dt);
    if (this.goal) {
      this.target.lerp(this.goal, Math.min(1, dt * 5));
      if (this.target.distanceTo(this.goal) < 0.01) this.goal = null;
    }
    this.clamp();
    this.aim();
    this.r.render(this.scene, this.cam);
    this.place();
    this.raf = requestAnimationFrame(this.frame);
  };

  private resize() {
    const w = this.I.host.clientWidth, h = this.I.host.clientHeight;
    if (!w || !h) return;
    this.r.setSize(w, h, false);
    const tile = Math.max(40, Math.min(58, w / 8)); // on-screen width of one tile
    const s = tile / Math.SQRT2;
    this.cam.left = -w / 2 / s;
    this.cam.right = w / 2 / s;
    this.cam.top = h / 2 / s;
    this.cam.bottom = -h / 2 / s;
    this.cam.zoom = this.zoom;
    this.cam.updateProjectionMatrix();
    this.kick();
  }

  private aim() {
    this.cam.position.copy(this.target).add(OFF);
    this.cam.lookAt(this.target);
    this.cam.zoom = this.zoom;
    this.cam.updateProjectionMatrix();
    this.sun.position.copy(this.target).add(new Vector3(-7, 14, 3));
    this.sun.target.position.copy(this.target);
  }

  private clamp() {
    const b = this.bounds;
    this.target.x = Math.max(b.u0, Math.min(b.u1, this.target.x));
    this.target.z = Math.max(b.v0, Math.min(b.v1, this.target.z));
  }

  /* project HTML labels; hide the ones off screen */
  private v = new Vector3();
  private place() {
    const w = this.I.host.clientWidth, h = this.I.host.clientHeight;
    const put = (el: HTMLElement, x: number, y: number, z: number, clamp = 0) => {
      this.v.set(x, y, z).project(this.cam);
      let px = ((this.v.x + 1) / 2) * w;
      const py = ((1 - this.v.y) / 2) * h;
      if (clamp) px = Math.max(clamp, Math.min(w - clamp, px)); // wide signs stay fully on screen
      const off = px < -120 || px > w + 120 || py < -140 || py > h + 140;
      el.style.visibility = off ? "hidden" : "";
      if (!off) el.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
    };
    for (const a of this.anchors) put(a.el, a.x, a.y, a.z, a.clamp);
    for (const a of this.plusTags) put(a.el, a.x, a.y, a.z);
    for (const r of this.runners) if (r.label) put(r.label, r.pos.x, r.pos.y + (r.me ? ME_H : MATE_H) + 0.08, r.pos.z);
    if (this.bubble) {
      if (performance.now() > this.bubble.until) {
        this.bubble.el.remove();
        this.bubble = null;
      } else {
        const a = this.bubble.at();
        put(this.bubble.el, a.x, a.y, a.z);
      }
    }
  }

  /* ---------------- input: drag to pan, pinch / ctrl+wheel to zoom, tap characters ---------------- */
  private ground(px: number, py: number) {
    const rect = this.r.domElement.getBoundingClientRect();
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1), this.cam);
    const hit = new Vector3();
    return ray.ray.intersectPlane(new Plane(UP, 0), hit) ? hit : null;
  }

  private controls() {
    const el = this.I.host.parentElement!;
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0, pinch0 = 0, zoom0 = 1, vel = new Vector3(), lastT = 0;
    const down = (e: PointerEvent) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) moved = 0;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        zoom0 = this.zoom;
      }
      vel.set(0, 0, 0);
      this.goal = null;
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pts.values()];
        this.zoom = Math.max(0.6, Math.min(1.9, (zoom0 * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch0)));
        moved += 10;
        this.kick();
        return;
      }
      const g0 = this.ground(p.x, p.y), g1 = this.ground(e.clientX, e.clientY);
      moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
      if (g0 && g1 && moved > 6) {
        const d = g0.sub(g1);
        d.y = 0;
        this.target.add(d);
        const now = performance.now();
        vel.copy(d).multiplyScalar(1000 / Math.max(8, now - lastT));
        lastT = now;
        this.follow = false;
        this.kick();
      }
    };
    const up = (e: PointerEvent) => {
      const was = pts.size;
      pts.delete(e.pointerId);
      if (was === 1 && moved <= 6) this.tap(e.clientX, e.clientY);
      if (was === 1 && moved > 6 && !this.I.reduced && vel.length() > 0.5 && performance.now() - lastT < 80) {
        // a little glide after a flick
        const v = vel.clone().multiplyScalar(0.16);
        this.goal = this.target.clone().add(v);
      }
    };
    // a drag that started on a label must not click it
    const click = (e: MouseEvent) => {
      if (moved > 6) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) this.zoom = Math.max(0.6, Math.min(1.9, this.zoom * (1 - e.deltaY * 0.01)));
      else {
        const c = this.ground(innerWidth / 2, innerHeight / 2), d = this.ground(innerWidth / 2 + e.deltaX, innerHeight / 2 + e.deltaY);
        if (c && d) this.target.add(d.sub(c).setY(0));
        this.follow = false;
        this.goal = null;
      }
      this.kick();
    };
    el.addEventListener("pointerdown", down);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    el.addEventListener("wheel", wheel, { passive: false });
    this.disposers.push(() => {
      el.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
      el.removeEventListener("wheel", wheel);
    });
  }

  private tap(px: number, py: number) {
    if (document.elementFromPoint(px, py)?.closest("button,a")) return; // a label got it
    const rect = this.r.domElement.getBoundingClientRect();
    const ray = new Raycaster();
    ray.camera = this.cam;
    ray.setFromCamera(new Vector2(((px - rect.left) / rect.width) * 2 - 1, -((py - rect.top) / rect.height) * 2 + 1), this.cam);
    const hit = ray.intersectObjects([...this.runners.map((r) => r.sprite), ...this.critters.map((c) => c.obj)], true)[0];
    if (!hit) return;
    const who = this.runners.find((r) => r.sprite === hit.object);
    let o: Object3D | null = hit.object;
    while (o && !this.critters.some((c) => c.obj === o)) o = o.parent;
    const pet = o && this.critters.find((c) => c.obj === o);
    if (!who && !pet) return;
    const show = (title: string, line: string, at: () => Vector3) => {
      this.bubble?.el.remove();
      const el = document.createElement("div");
      el.className = "am3d-bubble";
      const b = document.createElement("b");
      b.textContent = title;
      const s = document.createElement("span");
      s.textContent = line;
      el.append(b, s);
      this.I.layer.appendChild(el);
      this.bubble = { el, at, until: performance.now() + 3500 };
    };
    if (who) {
      this.I.onSound?.("pop");
      show(who.me ? "You" : who.p.name, who.me ? this.I.meLine : this.I.mates.find((m) => m.p.uid === who.p.uid)?.line || "", () => new Vector3(who.pos.x, who.pos.y + (who.me ? ME_H : MATE_H) + 0.5, who.pos.z));
      who.hop = 1;
    } else if (pet) {
      this.I.onSound?.(pet.name);
      show(pet.say, pet.name, () => pet.pos().clone().setY(pet.pos().y + pet.height + 0.35));
      pet.poke();
    }
    this.kick();
  }

  /* ---------------- the world ---------------- */
  private buildWorld() {
    const { world, lands } = this.I;
    const B = new Batch();
    const at = (u: number, v: number) => world.tiles.find((t) => t.u === u && t.v === v);
    const solid = new Set(world.tiles.filter((t) => t.kind !== "bridge").map((t) => key(t.u, t.v)));
    const pathIdx = new Map(world.path.map((p, i) => [key(p.u, p.v), i]));
    const m = new Matrix4(), q = new Quaternion(), sc = new Vector3(), ps = new Vector3();
    const mat = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) => {
      q.setFromEuler(new Euler(rx, ry, rz));
      return m.compose(ps.set(x, y, z), q, sc.set(sx, sy, sz)).clone();
    };
    let u0 = 0, u1 = 0, v0 = 0, v1 = 0;

    // geometries shared by every tile
    const gTop = new BoxGeometry(1.02, 0.16, 1.02).translate(0, -0.08, 0);
    const gDirt = new BoxGeometry(1, 0.62, 1).translate(0, -0.47, 0);
    const gRock = new BoxGeometry(0.94, 0.5, 0.94).translate(0, -1.03, 0);
    const gSpike = new ConeGeometry(0.44, 1, 5).rotateX(Math.PI).translate(0, -0.5, 0);
    const gStone = new CylinderGeometry(0.4, 0.44, 0.05, 6);
    const gPlank = new BoxGeometry(1, 0.07, 1);
    const gPost = new CylinderGeometry(0.035, 0.045, 0.46, 5).translate(0, 0.23, 0);
    const lambert = new MeshLambertMaterial({ flatShading: true });

    for (const t of world.tiles) {
      u0 = Math.min(u0, t.u);
      u1 = Math.max(u1, t.u);
      v0 = Math.min(v0, t.v);
      v1 = Math.max(v1, t.v);
      const th = lands[t.land]?.theme || lands[0].theme;
      if (t.kind === "bridge") {
        const i = pathIdx.get(key(t.u, t.v)) ?? 0;
        const n = world.path[i + 1] || world.path[i - 1];
        const alongU = n ? n.u !== t.u : true; // walking direction
        for (const o of [-0.33, 0, 0.33]) {
          const c = new Color(hash(t.u + o, t.v, 4) < 0.5 ? "#C99358" : "#B98348");
          B.add("plank", gPlank, lambert, alongU ? mat(t.u + o, -0.04, t.v, 0.25, 1, 0.92) : mat(t.u, -0.04, t.v + o, 0.92, 1, 0.25), c, { recv: true, cast: true });
        }
        for (const s of [-0.47, 0.47]) {
          B.add("post", gPost, lambert, alongU ? mat(t.u, 0, t.v + s) : mat(t.u + s, 0, t.v), new Color("#7A4E28"), { cast: true });
          B.add("rope", gPlank, lambert, alongU ? mat(t.u, 0.4, t.v + s, 1, 0.35, 0.035) : mat(t.u + s, 0.4, t.v, 0.035, 0.35, 1), new Color("#D9B98A"), {});
        }
        continue;
      }
      const tone = new Color(hash(t.u, t.v, 1) < 0.5 ? th.top : th.top2);
      B.add("top", gTop, lambert, mat(t.u, 0, t.v), tone, { recv: true });
      B.add("dirt", gDirt, lambert, mat(t.u, 0, t.v), new Color(th.side), { recv: true });
      B.add("rock", gRock, lambert, mat(t.u, 0, t.v), new Color(th.side2), {});
      // floating-island underside: rocky spikes under the outer tiles
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !solid.has(key(t.u + a, t.v + b)));
      const len = edge ? 0.5 + hash(t.u, t.v, 11) * 0.9 : 1.2 + hash(t.u, t.v, 12) * 2.2;
      if (edge || hash(t.u, t.v, 13) < 0.5) B.add("spike", gSpike, lambert, mat(t.u, -1.26, t.v, 1, len, 1, hash(t.u, t.v, 14) * 3), new Color(th.side2).multiplyScalar(0.85), {});
      if (t.kind === "path") {
        const c = new Color(hash(t.u, t.v, 2) < 0.5 ? "#EFE2BE" : "#E5D5AC");
        B.add("stone", gStone, lambert, mat(t.u, 0.02, t.v, 1, 1, 1, hash(t.u, t.v, 6) * 3), c, { recv: true });
      }
      if (t.prop) this.prop(B, t.prop, t.u + (hash(t.u, t.v, 9) - 0.5) * 0.4, t.v + (hash(t.u, t.v, 10) - 0.5) * 0.4, hash(t.u, t.v, 15), lambert);
      const grass = TUFT[th.name.replace(/ [IVX]+$/, "")];
      if (grass && !t.spot && t.kind === "ground" && !t.prop && hash(t.u, t.v, 21) < 0.35) {
        // tufts of grass for texture
        const gc = new Color(grass);
        for (let i = 0; i < 3; i++) B.add("tuft", new ConeGeometry(0.035, 0.16, 3).translate(0, 0.08, 0), lambert, mat(t.u + (hash(t.u, t.v, 30 + i) - 0.5) * 0.7, 0, t.v + (hash(t.u, t.v, 40 + i) - 0.5) * 0.7), gc, {});
      }
    }
    this.bounds = { u0: u0 - 1, u1: u1 + 1, v0: v0 - 1, v1: v1 + 1 };
    for (const t of world.tiles) {
      this.landOf.set(key(t.u, t.v), t.land);
      if (t.kind !== "bridge" && !t.prop && !t.spot) this.walk.add(key(t.u, t.v));
    }

    B.build(this.scene, this.anim);

    // stops, castles and chests
    for (const s of world.spots) this.spotMesh(s.spot, s.u, s.v);
    this.startFlag();
    lands.forEach((land, i) => this.waterfall(land, i, at, solid));
  }

  private prop(B: Batch, kind: Deco, x: number, z: number, r: number, mat: MeshLambertMaterial) {
    const m = (px: number, py: number, pz: number, s = 1, sy = s, ry = 0, rz = 0) => new Matrix4().compose(new Vector3(px, py, pz), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), ry).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rz)), new Vector3(s, sy, s));
    const s = 0.85 + r * 0.35;
    const sway = { sway: true, cast: true };
    switch (kind) {
      case "tree":
        B.add("trunk", G.trunk, mat, m(x, 0, z, s), new Color("#7A5230"), { cast: true });
        B.add("crown", G.crown, mat, m(x, 0.55 * s, z, s * 1.05), new Color(r < 0.5 ? "#4DA436" : "#5BB43F"), sway);
        B.add("crown", G.crown, mat, m(x + 0.08, 0.78 * s, z - 0.05, s * 0.7), new Color("#7ACB55"), sway);
        return;
      case "pine":
      case "snowpine": {
        const snow = kind === "snowpine";
        B.add("trunk", G.trunk, mat, m(x, 0, z, s * 0.8), new Color("#6B4528"), { cast: true });
        for (let i = 0; i < 3; i++) B.add("cone", G.cone, mat, m(x, (0.3 + i * 0.22) * s, z, s * (1 - i * 0.22)), new Color(snow ? (i === 2 ? "#FFFFFF" : "#5F8FA0") : i === 2 ? "#3E9C6B" : "#2C7A52"), sway);
        return;
      }
      case "flower":
        for (let i = 0; i < 3; i++) B.add("bloom", G.bloom, mat, m(x + (i - 1) * 0.12, 0.1 + i * 0.03, z + ((i * 7) % 3) * 0.06 - 0.06), new Color(["#FF7EB6", "#FFFFFF", "#FFD84D"][i]), {});
        return;
      case "palm": {
        B.add("palm", G.palmTrunk, mat, m(x, 0, z, s, s, r * 6, 0.12), new Color("#9A6B3C"), { cast: true });
        for (let i = 0; i < 6; i++) B.add("leaf", G.leaf, mat, m(x + 0.1 * s, 0.98 * s, z, s, s, (i / 6) * Math.PI * 2 + r, -0.5), new Color(i % 2 ? "#2FA36B" : "#36B577"), sway);
        return;
      }
      case "cactus":
        B.add("cactus", G.cactus, mat, m(x, 0.3 * s, z, s), new Color("#3E9A57"), { cast: true });
        B.add("cactus", G.cactusArm, mat, m(x - 0.13 * s, 0.38 * s, z, s, s, r * 3), new Color("#36894D"), { cast: true });
        return;
      case "rock":
        B.add("rock", G.rock, mat, m(x, 0.08, z, s * 0.9, s * 0.65, r * 6), new Color(r < 0.5 ? "#9A958B" : "#8A857C"), { cast: true, recv: true });
        return;
      case "crystal":
        B.add("crystal", G.crystal, new MeshLambertMaterial({ flatShading: true, emissive: "#6A4CF0", emissiveIntensity: 0.55 }), m(x, 0.3 * s, z, s * 0.8, s * 1.6, r * 6, 0.15), new Color("#C9B8FF"), { cast: true, glow: true });
        B.add("crystal", G.crystal, new MeshLambertMaterial({ flatShading: true, emissive: "#6A4CF0", emissiveIntensity: 0.55 }), m(x + 0.16, 0.18 * s, z + 0.08, s * 0.5, s * 1.1, r * 3, -0.3), new Color("#B39CFF"), { cast: true, glow: true });
        return;
      case "lava":
        B.add("rock", G.rock, mat, m(x, 0.08, z, s, s * 0.6, r * 6), new Color("#4A3633"), { cast: true });
        B.add("ember", G.bloom, new MeshBasicMaterial({ color: "#FF7A1A" }), m(x, 0.18, z, s * 1.4), new Color("#FF8A1F"), { glow: true });
        return;
    }
  }

  private spotMesh(spot: World["spots"][number]["spot"], u: number, v: number) {
    const g = new Group();
    g.position.set(u, 0, v);
    this.scene.add(g);
    const L = (c: string, o: Partial<{ emissive: string; e: number }> = {}) => new MeshLambertMaterial({ color: c, flatShading: true, emissive: o.emissive || "#000", emissiveIntensity: o.e || 0 });
    const add = (geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, cast = true) => {
      const mesh = new Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    if (spot.kind === "stop") {
      const [top, side] = ({ done: ["#D8F57A", "#8FBF12"], play: ["#FFB08C", "#E2531C"], missed: ["#E4E1D9", "#B9B5AA"], locked: ["#F7F5EF", "#CFCBC0"] } as const)[spot.state];
      add(new CylinderGeometry(0.4, 0.44, 0.2, 20), L(side), 0, 0.1);
      add(new CylinderGeometry(0.34, 0.36, 0.05, 20), L(top), 0, 0.22);
      if (spot.state === "play") {
        // a glowing ring and a beam of light on stops ready to play
        const ring = add(new TorusGeometry(0.52, 0.045, 8, 32).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: "#FF8A3D", transparent: true, opacity: 0.9 }), 0, 0.04, 0, false);
        const beam = add(new CylinderGeometry(0.3, 0.42, 2.4, 20, 1, true).translate(0, 1.2, 0), new MeshBasicMaterial({ color: "#FFB27A", transparent: true, opacity: 0.18, depthWrite: false, side: DoubleSide }), 0, 0.2, 0, false);
        const ph = u * 0.7;
        this.anim.push((t) => {
          const k = 1 + ((t * 0.8 + ph) % 1) * 0.5;
          ring.scale.set(k, 1, k);
          (ring.material as MeshBasicMaterial).opacity = 0.9 * (1 - ((t * 0.8 + ph) % 1));
          (beam.material as MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 2 + ph) * 0.06;
        });
      }
      return;
    }
    if (spot.kind === "chest") {
      const wood = L("#A5662F"), dark = L("#874F22"), gold = L("#E8B21A", { emissive: "#7A5A00", e: 0.25 });
      add(new BoxGeometry(0.56, 0.3, 0.4), wood, 0, 0.15);
      add(new BoxGeometry(0.58, 0.06, 0.42), gold, 0, 0.2);
      const pivot = new Group();
      pivot.position.set(0, 0.3, -0.2);
      g.add(pivot);
      const lid = new Mesh(new BoxGeometry(0.58, 0.14, 0.42), dark);
      lid.position.set(0, 0.07, 0.2);
      lid.castShadow = true;
      pivot.add(lid);
      if (spot.open) {
        pivot.rotation.x = -1.15;
        for (let i = 0; i < 5; i++) add(new CylinderGeometry(0.07, 0.07, 0.025, 12), gold, (i - 2) * 0.09, 0.33 + (i % 2) * 0.03, (i % 3) * 0.06 - 0.06, false);
        const glow = add(new SphereGeometry(0.55, 16, 12), new MeshBasicMaterial({ color: "#FFE27A", transparent: true, opacity: 0.25, depthWrite: false }), 0, 0.4, 0, false);
        this.anim.push((t) => {
          glow.scale.setScalar(1 + Math.sin(t * 3) * 0.1);
          g.position.y = Math.max(0, Math.sin(t * 2.6)) * 0.05;
        });
      }
      return;
    }
    // castle: keep with towers and a flag that waves
    const c = {
      passed: ["#FFF3D1", "#E0C47E", "#FF5A1F"],
      open: ["#EEF3FF", "#C3D3F5", "#3D7BFF"],
      out: ["#F1EFEA", "#C9C5BA", "#A9A69C"],
      locked: ["#F1EFEA", "#C9C5BA", "#A9A69C"],
    }[spot.state];
    const wall = L(c[0]), trim = L(c[1]), roof = L(c[2]);
    add(new BoxGeometry(0.86, 0.62, 0.86), wall, 0, 0.31);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      add(new BoxGeometry(0.14, 0.12, 0.14), trim, Math.cos(a) * 0.3, 0.68, Math.sin(a) * 0.3);
    }
    for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
      add(new CylinderGeometry(0.16, 0.18, 0.95, 10), wall, x, 0.475, z);
      add(new ConeGeometry(0.23, 0.42, 10), roof, x, 1.16, z);
    }
    add(new BoxGeometry(0.26, 0.36, 0.04), L("#3A372F"), 0.12, 0.18, 0.44);
    add(new CylinderGeometry(0.015, 0.015, 0.7), L("#3A372F"), 0, 0.95, 0);
    const flag = add(new PlaneGeometry(0.34, 0.2).translate(0.17, 0, 0), new MeshLambertMaterial({ color: spot.state === "passed" ? "#FFD84D" : c[2], side: DoubleSide }), 0, 1.2, 0, false);
    this.anim.push((t) => (flag.rotation.y = Math.sin(t * 3) * 0.35));
    if (spot.state === "open" || spot.state === "passed") {
      const halo = add(new TorusGeometry(0.85, 0.04, 8, 40).rotateX(Math.PI / 2), new MeshBasicMaterial({ color: spot.state === "open" ? "#8FB4FF" : "#FFD84D", transparent: true, opacity: 0.8 }), 0, 0.03, 0, false);
      this.anim.push((t) => {
        const k = 1 + (t % 1.6) / 4;
        halo.scale.set(k, 1, k);
        (halo.material as MeshBasicMaterial).opacity = 0.8 * (1 - (t % 1.6) / 1.6);
      });
    }
  }

  private startFlag() {
    const g = new Group();
    const pole = new Mesh(new CylinderGeometry(0.03, 0.03, 1.3), new MeshLambertMaterial({ color: "#3A372F" }));
    pole.position.set(0.32, 0.65, 0.32);
    pole.castShadow = true;
    const flag = new Mesh(new PlaneGeometry(0.42, 0.26).translate(0.21, 0, 0), new MeshLambertMaterial({ color: "#161512", side: DoubleSide }));
    flag.position.set(0.32, 1.15, 0.32);
    g.add(pole, flag);
    this.scene.add(g);
    this.anim.push((t) => (flag.rotation.y = Math.sin(t * 2.4) * 0.4 - 0.4));
  }

  /** One waterfall (lava on the volcano) pouring off the front edge of each island. */
  private waterfall(land: Land, li: number, at: (u: number, v: number) => World["tiles"][number] | undefined, solid: Set<string>) {
    const own = this.I.world.tiles.filter((t) => t.land === li && t.kind === "ground" && !t.prop && !t.spot);
    const front = own.filter((t) => !solid.has(key(t.u + 1, t.v)) || !solid.has(key(t.u, t.v + 1)));
    const t = front[Math.floor(hash(li, 3, 5) * front.length)];
    if (!t || !at(t.u, t.v)) return;
    const lava = land.theme.name.startsWith("Volcano");
    const alongU = !solid.has(key(t.u + 1, t.v));
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 128;
    const x = c.getContext("2d")!;
    for (let i = 0; i < 26; i++) {
      x.fillStyle = lava ? (i % 3 ? "#FF7A1A" : "#FFC14D") : i % 3 ? "#9BD8FF" : "#FFFFFF";
      x.globalAlpha = 0.5 + hash(i, li, 7) * 0.5;
      x.fillRect(hash(i, li, 1) * 30, hash(i, li, 2) * 128, 2 + hash(i, li, 3) * 3, 18 + hash(i, li, 4) * 40);
    }
    const tex = new CanvasTexture(c);
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide, color: lava ? "#FFB070" : "#DFF3FF" });
    const fall = new Mesh(new PlaneGeometry(0.62, 3.6), mat);
    fall.position.set(alongU ? t.u + 0.53 : t.u, -1.8, alongU ? t.v : t.v + 0.53);
    fall.rotation.y = alongU ? Math.PI / 2 : 0;
    const lip = new Mesh(new BoxGeometry(alongU ? 0.12 : 0.66, 0.05, alongU ? 0.66 : 0.12), new MeshBasicMaterial({ color: lava ? "#FF9A3D" : "#E6F6FF" }));
    lip.position.set(alongU ? t.u + 0.47 : t.u, 0.01, alongU ? t.v : t.v + 0.47);
    // the stream across the top of the tile to the edge
    const stream = new Mesh(new BoxGeometry(alongU ? 0.5 : 0.36, 0.04, alongU ? 0.36 : 0.5), new MeshBasicMaterial({ color: lava ? "#FF7A1A" : "#7CC8F2" }));
    stream.position.set(alongU ? t.u + 0.22 : t.u, 0.01, alongU ? t.v : t.v + 0.22);
    this.scene.add(fall, lip, stream);
    this.anim.push((_, dt) => (tex.offset.y += dt * (lava ? 0.25 : 0.9)));
  }

  private buildSky() {
    const { u0, u1, v0, v1 } = this.bounds;
    const white = new MeshLambertMaterial({ color: "#FFFFFF", emissive: "#FFFFFF", emissiveIntensity: 0.45, flatShading: true });
    const puff = new IcosahedronGeometry(1, 1);
    const clouds: { g: Group; speed: number }[] = [];
    const n = Math.max(8, Math.round((u1 - u0 + v1 - v0) / 5));
    for (let i = 0; i < n; i++) {
      const g = new Group();
      for (let k = 0; k < 4; k++) {
        const m = new Mesh(puff, white);
        const s = 0.5 + hash(i, k, 3) * 0.6;
        m.scale.set(s * 1.3, s * 0.8, s);
        m.position.set(k * 0.7 - 1, hash(i, k, 4) * 0.4, hash(i, k, 5) * 0.6);
        g.add(m);
      }
      const side = hash(i, 9) < 0.5 ? -1 : 1;
      const along = u0 + hash(i, 1) * (u1 - u0);
      g.position.set(along + side * 6, -2.6 - hash(i, 2) * 3, along - side * 6 + (hash(i, 6) - 0.5) * 8);
      this.scene.add(g);
      clouds.push({ g, speed: 0.12 + hash(i, 7) * 0.15 });
    }
    // clouds over the lands still to come
    const end = this.I.world.path[this.I.world.path.length - 1];
    for (let i = 0; i < 7; i++) {
      const g = new Group();
      for (let k = 0; k < 5; k++) {
        const m = new Mesh(puff, white);
        m.scale.setScalar(0.7 + hash(i, k, 8) * 0.7);
        m.position.set(k * 0.8 - 1.6, hash(i, k, 9) * 0.6, hash(i, k, 10));
        g.add(m);
      }
      g.position.set(end.u - 2 + (i % 3) * 2 - i * 0.6, 0.6 + hash(i, 11) * 0.8, end.v - 2 + Math.floor(i / 3) * 2 - i * 0.6);
      this.scene.add(g);
    }
    this.anim.push((_, dt) => {
      for (const c of clouds) {
        c.g.position.x += dt * c.speed;
        c.g.position.z -= dt * c.speed;
        if (c.g.position.x > u1 + 10) {
          c.g.position.x -= u1 - u0 + 20;
          c.g.position.z += u1 - u0 + 20;
        }
      }
    });
    // a few birds circling
    const wing = new ConeGeometry(0.09, 0.42, 3).rotateZ(-Math.PI / 2).translate(0.21, 0, 0).scale(1, 0.25, 1);
    const dark = new MeshLambertMaterial({ color: "#FFFFFF", emissive: "#FFFFFF", emissiveIntensity: 0.3, flatShading: true });
    const bodyGeo = new SphereGeometry(0.07, 8, 6).scale(1.8, 1, 1);
    const bodyMat = new MeshLambertMaterial({ color: "#E9EEF3" });
    for (let f = 0; f < 2; f++) {
      const flock = new Group();
      const birds: { l: Mesh; r: Mesh }[] = [];
      for (let b = 0; b < 3; b++) {
        const l = new Mesh(wing, dark), r = new Mesh(wing, dark);
        r.rotation.y = Math.PI;
        const bird = new Group();
        bird.add(l, r, new Mesh(bodyGeo, bodyMat));
        bird.position.set(b * 0.5 - 0.5, (b % 2) * 0.2, Math.abs(b - 1) * 0.5);
        flock.add(bird);
        birds.push({ l, r });
      }
      this.scene.add(flock);
      const cx = (u0 + u1) / 2, cv = (v0 + v1) / 2, rad = 5 + f * 3;
      this.anim.push((t) => {
        const a = t * (0.18 + f * 0.05) + f * 3;
        flock.position.set(this.target.x + Math.cos(a) * rad, 3.2 + f, this.target.z + Math.sin(a) * rad);
        flock.rotation.y = -a;
        birds.forEach((b, i) => {
          const w = Math.sin(t * 9 + i) * 0.6;
          b.l.rotation.z = w;
          b.r.rotation.z = -w;
        });
      });
      void cx;
      void cv;
    }
  }

  /* ---------------- people ---------------- */
  private async buildPeople() {
    const { me, meAt, meFrom, mates, overflow, reduced, world } = this.I;
    const shadowGeo = new CircleGeometry(0.26, 18).rotateX(-Math.PI / 2);
    const shadowMat = new MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.22, depthWrite: false });
    const make = async (p: Player, isMe: boolean, at: Vector3) => {
      const tex = await chibiTexture(p.look ?? 0, p.equipped, isMe ? "happy" : "idle");
      tex.userData.shared = true;
      const sprite = new Sprite(new SpriteMaterial({ map: tex, alphaTest: 0.35, transparent: true }));
      const h = isMe ? ME_H : MATE_H;
      sprite.center.set(0.5, 0.03);
      sprite.scale.set(h * CHIBI_ASPECT, h, 1);
      sprite.position.copy(at);
      const shadow = new Mesh(shadowGeo, shadowMat);
      shadow.scale.setScalar(isMe ? 1.15 : 0.9);
      shadow.position.set(at.x, 0.02, at.z);
      this.scene.add(sprite, shadow);
      const label = document.createElement("span");
      label.className = isMe ? "am3d-you" : "am3d-name";
      label.textContent = isMe ? "You" : p.name.split(" ")[0];
      this.I.layer.appendChild(label);
      const r: Runner = { p, me: isMe, sprite, shadow, label, pos: at.clone(), home: at.clone(), route: [], seg: 0, segT: 0, speed: isMe ? 4.2 : 1.6, idleUntil: performance.now() / 1000 + 1 + Math.random() * 4, phase: Math.random() * 6, hop: 0, face: 1 };
      this.runners.push(r);
      return r;
    };

    // teammates: up to PER_STOP around each stop, on free ground nearby
    const taken = new Set<string>();
    const spotsAt = new Set(world.spots.map((s) => key(s.u, s.v)));
    // free tiles near a stop, best first: beside it on screen (same depth), then a little in front;
    // never straight behind it (its button floats there) or straight in front (its tag sits there)
    const free = (u: number, v: number) => {
      const out: { at: [number, number]; score: number }[] = [];
      for (let du = -2; du <= 2; du++)
        for (let dv = -2; dv <= 2; dv++) {
          const k = key(u + du, v + dv), depth = du + dv, across = du - dv;
          if (!(du || dv) || !this.walk.has(k) || taken.has(k) || spotsAt.has(k)) continue;
          if (Math.abs(across) <= 1 && Math.abs(depth) <= 2) continue;
          out.push({ at: [u + du, v + dv], score: Math.abs(depth) * 2 + Math.abs(Math.abs(across) - 2) });
        }
      return out.sort((a, b) => a.score - b.score).map((x) => x.at);
    };
    const byStop = new Map<string, MateInfo[]>();
    for (const m of mates) byStop.set(key(m.u, m.v), [...(byStop.get(key(m.u, m.v)) || []), m]);
    const jobs: Promise<Runner>[] = [];
    for (const [k, list] of byStop) {
      const [u, v] = k.split(",").map(Number);
      const spots = free(u, v);
      list.slice(0, PER_STOP).forEach((m, i) => {
        const s = spots[i % Math.max(1, spots.length)] || [u + 0.5, v + 0.5];
        taken.add(key(s[0], s[1]));
        jobs.push(make(m.p, false, new Vector3(s[0] + (hash(i, u) - 0.5) * 0.3, 0, s[1] + (hash(i, v) - 0.5) * 0.3)));
      });
    }
    for (const o of overflow) {
      const el = document.createElement("span");
      el.className = "am3d-plus";
      el.textContent = `+${o.n}`;
      this.I.layer.appendChild(el);
      const sd = o.u - o.v > 0 ? 1 : -1;
      this.plusTags.push({ el, x: o.u + sd * 1.2, y: 0.4, z: o.v - sd * 1.2 });
    }

    // you: run along the path from where you were last time to your stop
    if (meAt) {
      const endI = world.path.findIndex((p) => p.u === meAt.u && p.v === meAt.v);
      // stand beside the pedestal, on the side toward the middle of the screen
      const s = meAt.u - meAt.v > 0 ? -1 : 1;
      const side = new Vector3(meAt.u + s * 0.8, 0, meAt.v - s * 0.8);
      const startI = meFrom >= 0 && meFrom < endI && !reduced ? meFrom : -1;
      const r = await make(me, true, startI >= 0 ? new Vector3(world.path[startI].u, 0, world.path[startI].v) : side);
      r.home = side.clone();
      if (startI >= 0) {
        r.route = [...world.path.slice(startI + 1, endI + 1).map((p) => new Vector3(p.u, 0, p.v)), side];
        r.speed = Math.max(4.2, r.route.length / 3.2); // the trip takes about 3 s at most
        r.idleUntil = 0;
        this.goal = r.pos.clone();
      }
    }
    await Promise.all(jobs);
    this.kick();
  }

  private moveRunners(t: number, dt: number) {
    for (const r of this.runners) {
      let running = false;
      if (r.route.length) {
        running = true;
        let step = r.speed * dt;
        while (step > 0 && r.route.length) {
          const to = r.route[0];
          const d = to.clone().sub(r.pos).setY(0);
          const len = d.length();
          if (len <= step) {
            r.pos.set(to.x, 0, to.z);
            r.route.shift();
            step -= len;
          } else {
            r.pos.add(d.multiplyScalar(step / len));
            step = 0;
            // face the way we're going, in screen terms (u − v grows to the right)
            const sx = d.x - d.z;
            if (Math.abs(sx) > 0.001) r.face = sx > 0 ? 1 : -1;
          }
        }
        if (!r.route.length) {
          r.idleUntil = t + 2 + Math.random() * 5;
          if (r.me) {
            r.hop = 1;
            this.I.onSound?.("arrive");
          }
        }
        if (r.me && this.follow) this.goal = r.pos.clone();
      } else if (!r.me && !this.I.reduced && t > r.idleUntil) {
        // wander: a short jog to a free tile near home, then back
        const away = r.pos.distanceTo(r.home) > 0.3;
        if (away) r.route = [r.home.clone()];
        else {
          const u = Math.round(r.home.x), v = Math.round(r.home.z);
          const opts: [number, number][] = [];
          for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) if ((du || dv) && this.walk.has(key(u + du, v + dv))) opts.push([u + du, v + dv]);
          const pick = opts[Math.floor(Math.random() * opts.length)];
          if (pick) r.route = [new Vector3(pick[0] + (Math.random() - 0.5) * 0.4, 0, pick[1] + (Math.random() - 0.5) * 0.4)];
          else r.idleUntil = t + 5;
        }
      }
      // bob while running, breathe while idle, hop when tapped / arrived
      const h = r.me ? ME_H : MATE_H;
      let y = 0, sq = 1;
      if (running) {
        const c = Math.abs(Math.sin(t * 13 + r.phase));
        y = c * 0.13;
        sq = 1 - (1 - c) * 0.06;
        if (Math.random() < dt * 12) this.puff(r.pos);
      } else if (!this.I.reduced) sq = 1 + Math.sin(t * 2.2 + r.phase) * 0.018;
      if (r.hop > 0) {
        r.hop = Math.max(0, r.hop - dt * 1.6);
        y += Math.sin((1 - r.hop) * Math.PI * 2) ** 2 * 0.35;
      }
      r.sprite.position.set(r.pos.x, y, r.pos.z);
      r.sprite.scale.set(h * CHIBI_ASPECT * r.face * (2 - sq), h * sq, 1);
      r.shadow.position.set(r.pos.x, 0.02, r.pos.z);
      r.shadow.scale.setScalar((r.me ? 1.15 : 0.9) * (1 - y * 0.8));
    }
  }

  /* little dust puffs behind running feet */
  private puffTex?: CanvasTexture;
  private puff(at: Vector3) {
    if (this.dust.length > 40) return;
    if (!this.puffTex) {
      const c = document.createElement("canvas");
      c.width = c.height = 32;
      const x = c.getContext("2d")!;
      const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(255,255,255,.95)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 32, 32);
      this.puffTex = new CanvasTexture(c);
    }
    const s = new Sprite(new SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false, color: "#F3E6CC" }));
    s.position.set(at.x + (Math.random() - 0.5) * 0.2, 0.08, at.z + (Math.random() - 0.5) * 0.2);
    s.scale.setScalar(0.2);
    this.scene.add(s);
    this.dust.push({ s, life: 0 });
  }

  private updateDust(dt: number) {
    this.dust = this.dust.filter((d) => {
      d.life += dt * 2;
      d.s.scale.setScalar(0.2 + d.life * 0.35);
      d.s.position.y += dt * 0.3;
      (d.s.material as SpriteMaterial).opacity = 1 - d.life;
      if (d.life >= 1) {
        this.scene.remove(d.s);
        d.s.material.dispose();
        return false;
      }
      return true;
    });
  }
}

/* tufts of grass, by land */
const TUFT: Record<string, string> = { "Rookie Meadow": "#5FAE3A", "Coral Coast": "#9BBF5A" };

/* shared low-poly prop shapes */
const G = {
  trunk: new CylinderGeometry(0.06, 0.09, 0.5, 6).translate(0, 0.25, 0),
  crown: new IcosahedronGeometry(0.3, 0),
  cone: new ConeGeometry(0.34, 0.42, 7),
  bloom: new SphereGeometry(0.06, 6, 5),
  palmTrunk: new CylinderGeometry(0.05, 0.08, 1, 6).translate(0, 0.5, 0),
  leaf: new BoxGeometry(0.62, 0.025, 0.15).translate(0.31, 0, 0),
  cactus: new CapsuleGeometry(0.1, 0.42, 4, 8),
  cactusArm: new CapsuleGeometry(0.06, 0.18, 4, 6).translate(0, 0.1, 0).rotateZ(0.6),
  rock: new DodecahedronGeometry(0.22, 0),
  crystal: new OctahedronGeometry(0.16, 0),
};

/** Collects many copies of the same shape and draws them as one InstancedMesh each. */
class Batch {
  private items = new Map<string, { geo: BufferGeometry; mat: Material; list: { m: Matrix4; c: Color }[]; o: { cast?: boolean; recv?: boolean; sway?: boolean; glow?: boolean } }>();
  add(k: string, geo: BufferGeometry, mat: Material, m: Matrix4, c: Color, o: { cast?: boolean; recv?: boolean; sway?: boolean; glow?: boolean }) {
    const id = `${k}|${mat.uuid}`;
    let it = this.items.get(id);
    if (!it) this.items.set(id, (it = { geo, mat, list: [], o }));
    it.list.push({ m, c });
  }
  build(scene: Scene, anim: ((t: number, dt: number) => void)[]) {
    for (const it of this.items.values()) {
      const mesh = new InstancedMesh(it.geo, it.mat, it.list.length);
      it.list.forEach((x, i) => {
        mesh.setMatrixAt(i, x.m);
        mesh.setColorAt(i, x.c);
      });
      mesh.castShadow = !!it.o.cast;
      mesh.receiveShadow = !!it.o.recv;
      mesh.frustumCulled = false;
      scene.add(mesh);
      if (it.o.sway) {
        // trees and leaves lean gently in the wind
        const base = it.list.map((x) => x.m.clone());
        const tmp = new Matrix4(), rot = new Matrix4();
        anim.push((t) => {
          base.forEach((b, i) => {
            const ph = b.elements[12] * 0.7 + b.elements[14] * 0.4;
            rot.makeRotationZ(Math.sin(t * 1.4 + ph) * 0.045);
            tmp.copy(b).multiply(rot);
            mesh.setMatrixAt(i, tmp);
          });
          mesh.instanceMatrix.needsUpdate = true;
        });
      }
      if (it.o.glow && (it.mat as MeshLambertMaterial).emissive) {
        const m = it.mat as MeshLambertMaterial;
        anim.push((t) => (m.emissiveIntensity = 0.45 + Math.sin(t * 2) * 0.2));
      }
    }
  }
}
