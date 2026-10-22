/* Animals that live on the Arena Map islands, each land its own: sheep, rabbits and butterflies in the
   meadow, crabs and a turtle on the coast, lizards in the canyon, slimes and fireflies in the caves,
   penguins on the frost peaks and a little dragon over the volcano. The animals are painted 3D-toy
   pictures (src/assets/critters, the same style as the characters) standing on the islands as sprites,
   wandering between free tiles of their own island. Tap one and it hops and "says" something.
   Butterflies are painted too; fireflies stay tiny glowing dots. */
import { CircleGeometry, Group, Mesh, MeshBasicMaterial, Scene, SphereGeometry, SRGBColorSpace, Sprite, SpriteMaterial, Texture, TextureLoader, Vector3 } from "three";
import type { Land } from "../../lib/arenaMap";

export interface Critter { obj: Group; name: string; say: string; height: number; pos: () => Vector3; poke: () => void }
type Tick = (t: number, dt: number) => void;

/** Wander: pick a free tile on the same island, walk (or hop) to it, rest, repeat. */
function wanderer(g: Group, tiles: [number, number][], o: { speed: number; rest: [number, number]; hop?: number; onStep?: (t: number, moving: boolean, k: number) => void }): Tick {
  const start = tiles[Math.floor(Math.random() * tiles.length)];
  g.position.set(start[0] + (Math.random() - 0.5) * 0.5, 0, start[1] + (Math.random() - 0.5) * 0.5);
  const to = g.position.clone();
  let rest = Math.random() * o.rest[1], from = g.position.clone(), k = 1;
  return (t, dt) => {
    if (k >= 1) {
      rest -= dt;
      if (rest <= 0) {
        // the next spot is a nearby free tile
        const near = tiles.filter(([u, v]) => Math.abs(u - g.position.x) + Math.abs(v - g.position.z) <= 3.2);
        const pick = near[Math.floor(Math.random() * near.length)] || start;
        from = g.position.clone();
        to.set(pick[0] + (Math.random() - 0.5) * 0.5, 0, pick[1] + (Math.random() - 0.5) * 0.5);
        k = from.distanceTo(to) < 0.05 ? 1 : 0;
        rest = o.rest[0] + Math.random() * (o.rest[1] - o.rest[0]);
        if (k < 1) g.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      }
      o.onStep?.(t, false, 1);
      return;
    }
    k = Math.min(1, k + (dt * o.speed) / Math.max(0.05, from.distanceTo(to)));
    g.position.lerpVectors(from, to, k);
    if (o.hop) g.position.y = Math.abs(Math.sin(k * Math.PI * Math.max(1, Math.round(from.distanceTo(to) / 0.45)))) * o.hop;
    o.onStep?.(t, true, k);
  };
}

export function makeCritters(scene: Scene, lands: Land[], tilesOf: (land: number) => [number, number][], anim: Tick[], center: () => Vector3): Critter[] {
  const out: Critter[] = [];
  // animals are drawn about twice life-size next to the characters so they read on a phone
  const add = (g: Group, name: string, say: string, height: number, size = 1.9) => {
    g.scale.setScalar(size);
    height *= size;
    scene.add(g);
    let hop = 0;
    const base = { y: 0 };
    anim.push((_, dt) => {
      if (hop > 0) {
        hop = Math.max(0, hop - dt * 2);
        g.position.y = base.y + Math.sin((1 - hop) * Math.PI) * 0.45;
      }
    });
    out.push({ obj: g, name, say, height, pos: () => g.position, poke: () => (hop = 1) });
  };

  lands.forEach((land, li) => {
    const tiles = tilesOf(li);
    if (tiles.length < 4) return;
    // this land's animals only move while their island is near the camera (long maps have many lands)
    const from = anim.length;
    const cu = tiles.reduce((s, [u]) => s + u, 0) / tiles.length, cv = tiles.reduce((s, [, v]) => s + v, 0) / tiles.length;
    const wrap = () => {
      for (let i = from; i < anim.length; i++) {
        const f = anim[i];
        anim[i] = (t, dt) => {
          const c = center();
          if (Math.abs(c.x - cu) + Math.abs(c.z - cv) < 40) f(t, dt);
        };
      }
    };
    const kind = land.theme.name.replace(/ [IVX]+$/, "");
    const n = (k: number) => Math.min(k, Math.max(1, Math.floor(tiles.length / 10)));

    if (kind === "Rookie Meadow") {
      for (let i = 0; i < n(2); i++) add(sheep(tiles, anim), "Sheep", "Baa! 🐑", 0.5);
      for (let i = 0; i < n(2); i++) add(rabbit(tiles, anim), "Rabbit", "Hop hop!", 0.4);
      for (let i = 0; i < 3; i++) add(butterfly(tiles, anim, ["#FFFFFF", "#FFF0B0", "#D6ECFF"][i]), "Butterfly", "Flutter flutter", 0.1, 2.6);
    } else if (kind === "Coral Coast") {
      for (let i = 0; i < n(3); i++) add(crab(tiles, anim), "Crab", "Click clack!", 0.3);
      add(turtle(tiles, anim), "Turtle", "Slow and steady wins 🐢", 0.35);
      for (let i = 0; i < 2; i++) add(butterfly(tiles, anim, i ? "#FFE0C0" : "#FFFFFF"), "Butterfly", "Flutter flutter", 0.1, 2.6);
    } else if (kind === "Sunset Canyon") {
      for (let i = 0; i < n(3); i++) add(lizard(tiles, anim), "Lizard", "Zip!", 0.25);
    } else if (kind === "Crystal Caves") {
      for (let i = 0; i < n(3); i++) add(slime(tiles, anim, ["#FFFFFF", "#C9F4EE", "#FFD6EA"][i % 3]), "Slime", "Bloop!", 0.45);
      fireflies(scene, tiles, anim);
    } else if (kind === "Frost Peaks") {
      for (let i = 0; i < n(3); i++) add(penguin(tiles, anim), "Penguin", "Waddle waddle!", 0.55);
    } else if (kind === "Volcano Summit") {
      for (let i = 0; i < n(2); i++) add(salamander(tiles, anim), "Salamander", "Hot hot hot!", 0.25);
      add(dragon(tiles, anim), "Dragon", "Roar! 🔥", 0.2, 2.4);
    }
    wrap();
  });
  return out;
}

/* ---------------- the animals ---------------- */
const ART = import.meta.glob(["../../assets/critters/*.webp", "../../assets/deco/*.webp"], { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const texCache = new Map<string, Texture>();
/** a painted picture as a texture, shared: "critters/sheep", "deco/tree"… */
export function paintedTexture(key: string): Texture {
  const src = ART[`../../assets/${key}.webp`];
  let tex = texCache.get(src);
  if (!tex) {
    tex = new TextureLoader().load(src);
    tex.colorSpace = SRGBColorSpace;
    tex.userData.shared = true;
    texCache.set(src, tex);
  }
  return tex;
}
const shadowGeo = new CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
const shadowMat = new MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.13, depthWrite: false });

/** A painted animal standing on the ground: a sprite of the given height (its width follows the picture), a soft
    shadow, and a way to face it left or right on screen. The pictures face right, except those marked `left`. */
function painted(name: string, h: number, o: { left?: boolean; tint?: string; shadow?: number } = {}) {
  const g = new Group(), body = new Group();
  g.add(body);
  const tex = paintedTexture(`critters/${name}`);
  const sp = new Sprite(new SpriteMaterial({ map: tex, color: o.tint || "#FFFFFF", alphaTest: 0.3, transparent: true }));
  sp.center.set(0.5, 0.04);
  let aspect = 1;
  const fit = () => {
    const im = tex!.image as HTMLImageElement | undefined;
    if (im?.width) aspect = im.width / im.height;
  };
  fit();
  body.add(sp);
  if (o.shadow !== 0) {
    const sh = new Mesh(shadowGeo, shadowMat);
    sh.scale.setScalar(h * (o.shadow ?? 0.9));
    sh.position.y = 0.005;
    g.add(sh);
  }
  let face = 1;
  /** squash (1 = rest) and which way it heads (world dx, dz): the camera looks from +u +v, so screen right is +u −v */
  const pose = (sq = 1, dx = 0, dz = 0) => {
    if (!aspect || aspect === 1) fit();
    const sx = dx - dz;
    if (Math.abs(sx) > 1e-3) face = sx > 0 ? 1 : -1;
    const flip = o.left ? -face : face;
    sp.scale.set(h * aspect * (2 - sq) * flip, h * sq, 1);
  };
  pose();
  return { g, body, sp, pose };
}

/** heading of a wanderer, from the rotation it sets when it starts walking */
const heading = (g: Group): [number, number] => [Math.sin(g.rotation.y), Math.cos(g.rotation.y)];

function sheep(tiles: [number, number][], anim: Tick[]) {
  const a = painted("sheep", 0.42, { left: true });
  anim.push(wanderer(a.g, tiles, {
    speed: 0.35, rest: [2, 6],
    onStep: (t, moving) => {
      // trots while moving, a slow breath while grazing
      a.body.position.y = moving ? Math.abs(Math.sin(t * 10)) * 0.025 : 0;
      a.pose(moving ? 1 : 1 + Math.sin(t * 2.4) * 0.02, ...heading(a.g));
    },
  }));
  return a.g;
}

function rabbit(tiles: [number, number][], anim: Tick[]) {
  const a = painted("rabbit", 0.36);
  anim.push(wanderer(a.g, tiles, { speed: 1.4, rest: [1, 4], hop: 0.18, onStep: (t, moving) => a.pose(moving ? 1 + Math.sin(t * 16) * 0.05 : 1, ...heading(a.g)) }));
  return a.g;
}

function butterfly(tiles: [number, number][], anim: Tick[], tint: string) {
  const g = new Group();
  const sp = new Sprite(new SpriteMaterial({ map: paintedTexture("deco/butterfly"), color: tint, alphaTest: 0.35, transparent: true }));
  g.add(sp);
  const [u, v] = tiles[Math.floor(Math.random() * tiles.length)];
  const ph = Math.random() * 10, r = 0.6 + Math.random() * 0.8;
  anim.push((t) => {
    const a = t * 0.6 + ph;
    g.position.set(u + Math.cos(a) * r, 0.55 + Math.sin(t * 2.3 + ph) * 0.18, v + Math.sin(a * 1.3) * r);
    // wings beat: the picture narrows and opens again
    sp.scale.set(0.12 * (0.35 + Math.abs(Math.sin(t * 22 + ph)) * 0.65), 0.11, 1);
  });
  return g;
}

function crab(tiles: [number, number][], anim: Tick[]) {
  const a = painted("crab", 0.26);
  anim.push(wanderer(a.g, tiles, {
    speed: 0.9, rest: [1, 3],
    onStep: (t, moving) => {
      // scuttles with a wobble
      a.sp.material.rotation = moving ? Math.sin(t * 18) * 0.08 : 0;
      a.pose(1 + (moving ? 0 : Math.max(0, Math.sin(t * 6)) * 0.04), ...heading(a.g));
    },
  }));
  return a.g;
}

function turtle(tiles: [number, number][], anim: Tick[]) {
  const a = painted("turtle", 0.26);
  anim.push(wanderer(a.g, tiles, { speed: 0.12, rest: [3, 7], onStep: (t, moving) => a.pose(moving ? 1 + Math.sin(t * 5) * 0.025 : 1, ...heading(a.g)) }));
  return a.g;
}

function lizard(tiles: [number, number][], anim: Tick[]) {
  const a = painted("lizard", 0.28);
  anim.push(wanderer(a.g, tiles, {
    speed: 2.2, rest: [0.6, 3],
    onStep: (t, moving) => {
      a.sp.material.rotation = moving ? Math.sin(t * 25) * 0.06 : 0;
      a.pose(1, ...heading(a.g));
    },
  }));
  return a.g;
}

function salamander(tiles: [number, number][], anim: Tick[]) {
  const a = painted("salamander", 0.24);
  anim.push(wanderer(a.g, tiles, {
    speed: 2, rest: [0.6, 3],
    onStep: (t, moving) => {
      a.sp.material.rotation = moving ? Math.sin(t * 25) * 0.06 : 0;
      a.pose(1, ...heading(a.g));
    },
  }));
  return a.g;
}

function slime(tiles: [number, number][], anim: Tick[], tint: string) {
  const a = painted("slime", 0.3, { tint });
  anim.push(wanderer(a.g, tiles, { speed: 0.7, rest: [1, 4], hop: 0.22, onStep: (t, moving) => a.pose(moving ? 1 + Math.sin(t * 14) * 0.12 : 1 + Math.sin(t * 3) * 0.05, ...heading(a.g)) }));
  return a.g;
}

function fireflies(scene: Scene, tiles: [number, number][], anim: Tick[]) {
  const glow = new MeshBasicMaterial({ color: "#FFF5A0" });
  const geo = new SphereGeometry(0.03, 6, 4);
  for (let i = 0; i < 10; i++) {
    const m = new Mesh(geo, glow);
    const [u, v] = tiles[Math.floor(Math.random() * tiles.length)];
    const ph = Math.random() * 10;
    scene.add(m);
    anim.push((t) => {
      m.position.set(u + Math.sin(t * 0.7 + ph) * 0.5, 0.35 + Math.sin(t * 1.3 + ph) * 0.2, v + Math.cos(t * 0.5 + ph) * 0.5);
      m.visible = Math.sin(t * 2 + ph * 3) > -0.6;
    });
  }
}

function penguin(tiles: [number, number][], anim: Tick[]) {
  const a = painted("penguin", 0.42);
  anim.push(wanderer(a.g, tiles, {
    speed: 0.45, rest: [1, 5],
    onStep: (t, moving) => {
      // a waddle: rocks side to side as it walks
      a.sp.material.rotation = moving ? Math.sin(t * 12) * 0.14 : 0;
      a.pose(1, ...heading(a.g));
    },
  }));
  return a.g;
}

function dragon(tiles: [number, number][], anim: Tick[]) {
  const a = painted("dragon", 0.34, { shadow: 0 });
  const cu = tiles.reduce((s, [u]) => s + u, 0) / tiles.length, cv = tiles.reduce((s, [, v]) => s + v, 0) / tiles.length;
  anim.push((t) => {
    const k = t * 0.45;
    a.g.position.set(cu + Math.cos(k) * 2.2, 1.6 + Math.sin(t * 1.5) * 0.2, cv + Math.sin(k) * 2.2);
    // flies round the island: heading is the circle's tangent; wing beats as a gentle squash
    a.pose(1 + Math.sin(t * 7) * 0.05, -Math.sin(k), Math.cos(k));
  });
  return a.g;
}
