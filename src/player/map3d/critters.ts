/* Animals that live on the Arena Map islands, each land its own: sheep, rabbits and butterflies in the
   meadow, crabs and a turtle on the coast, lizards in the canyon, slimes and fireflies in the caves,
   penguins on the frost peaks and a little dragon over the volcano. Low-poly, built from primitives,
   wandering between free tiles of their own island. Tap one and it hops and "says" something. */
import {
  BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, DoubleSide, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, PlaneGeometry, Scene, SphereGeometry, Vector3, type BufferGeometry, type Material,
} from "three";
import type { Land } from "../../lib/arenaMap";

export interface Critter { obj: Group; name: string; say: string; height: number; pos: () => Vector3; poke: () => void }
type Tick = (t: number, dt: number) => void;

const L = (color: string, extra: Partial<{ emissive: string; e: number; transparent: boolean; opacity: number }> = {}) =>
  new MeshLambertMaterial({ color, flatShading: true, emissive: extra.emissive || "#000", emissiveIntensity: extra.e || 0, transparent: !!extra.transparent, opacity: extra.opacity ?? 1 });

function part(g: Group, geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, cast = true) {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  g.add(m);
  return m;
}

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
      for (let i = 0; i < 3; i++) add(butterfly(tiles, anim, ["#FF7EB6", "#FFD84D", "#8FD3FF"][i]), "Butterfly", "Flutter flutter", 0.1, 2.6);
    } else if (kind === "Coral Coast") {
      for (let i = 0; i < n(3); i++) add(crab(tiles, anim), "Crab", "Click clack!", 0.3);
      add(turtle(tiles, anim), "Turtle", "Slow and steady wins 🐢", 0.35);
      for (let i = 0; i < 2; i++) add(butterfly(tiles, anim, i ? "#FF9F43" : "#FFFFFF"), "Butterfly", "Flutter flutter", 0.1, 2.6);
    } else if (kind === "Sunset Canyon") {
      for (let i = 0; i < n(3); i++) add(lizard(tiles, anim, "#6BAA3A"), "Lizard", "Zip!", 0.25);
    } else if (kind === "Crystal Caves") {
      for (let i = 0; i < n(3); i++) add(slime(tiles, anim, ["#9B7BFF", "#5FD3C9", "#FF7EB6"][i % 3]), "Slime", "Bloop!", 0.45);
      fireflies(scene, tiles, anim);
    } else if (kind === "Frost Peaks") {
      for (let i = 0; i < n(3); i++) add(penguin(tiles, anim), "Penguin", "Waddle waddle!", 0.55);
    } else if (kind === "Volcano Summit") {
      for (let i = 0; i < n(2); i++) add(lizard(tiles, anim, "#D9432B"), "Salamander", "Hot hot hot!", 0.25);
      add(dragon(tiles, anim), "Dragon", "Roar! 🔥", 0.2, 2.4);
    }
    wrap();
  });
  return out;
}

/* ---------------- the animals ---------------- */
function sheep(tiles: [number, number][], anim: Tick[]) {
  const g = new Group(), wool = L("#F7F7F2"), dark = L("#3A3530");
  const body = new Group();
  g.add(body);
  part(body, new IcosahedronGeometry(0.2, 1).scale(1.25, 0.95, 1), wool, 0, 0.3, 0);
  for (const [x, z] of [[-0.1, -0.08], [0.1, -0.08], [-0.1, 0.08], [0.1, 0.08]]) part(g, new CylinderGeometry(0.03, 0.03, 0.18, 5), dark, z, 0.09, x);
  const head = new Group();
  head.position.set(0, 0.34, 0.24);
  body.add(head);
  part(head, new BoxGeometry(0.13, 0.13, 0.14), dark);
  part(head, new BoxGeometry(0.16, 0.04, 0.05), dark, 0, 0.04, -0.03);
  anim.push(wanderer(g, tiles, {
    speed: 0.35, rest: [2, 6],
    onStep: (t, moving) => {
      // grazes while resting, trots while moving
      head.rotation.x = moving ? Math.sin(t * 8) * 0.08 : 0.45 + Math.sin(t * 3) * 0.12;
      body.position.y = moving ? Math.abs(Math.sin(t * 10)) * 0.025 : 0;
    },
  }));
  return g;
}

function rabbit(tiles: [number, number][], anim: Tick[]) {
  const g = new Group(), fur = L(Math.random() < 0.5 ? "#FFFFFF" : "#C79A6B"), pink = L("#FFB3C7");
  part(g, new SphereGeometry(0.11, 8, 6).scale(1, 0.9, 1.25), fur, 0, 0.12, 0);
  part(g, new SphereGeometry(0.08, 8, 6), fur, 0, 0.22, 0.1);
  for (const x of [-0.035, 0.035]) {
    const ear = part(g, new CapsuleGeometry(0.022, 0.12, 3, 6), fur, x, 0.34, 0.08);
    ear.rotation.x = -0.25;
    part(g, new SphereGeometry(0.012, 4, 3), pink, x, 0.24, 0.17, false);
  }
  part(g, new SphereGeometry(0.04, 6, 4), L("#FFFFFF"), 0, 0.14, -0.14);
  anim.push(wanderer(g, tiles, { speed: 1.4, rest: [1, 4], hop: 0.18 }));
  return g;
}

function butterfly(tiles: [number, number][], anim: Tick[], color: string) {
  const g = new Group(), wingM = new MeshBasicMaterial({ color, side: DoubleSide }), bodyM = L("#2A2522");
  part(g, new CapsuleGeometry(0.012, 0.06, 2, 4).rotateX(Math.PI / 2), bodyM, 0, 0, 0, false);
  const wl = part(g, new PlaneGeometry(0.11, 0.09).translate(-0.055, 0, 0).rotateX(-Math.PI / 2), wingM, 0, 0, 0, false);
  const wr = part(g, new PlaneGeometry(0.11, 0.09).translate(0.055, 0, 0).rotateX(-Math.PI / 2), wingM, 0, 0, 0, false);
  const [u, v] = tiles[Math.floor(Math.random() * tiles.length)];
  const ph = Math.random() * 10, r = 0.6 + Math.random() * 0.8;
  anim.push((t) => {
    const a = t * 0.6 + ph;
    g.position.set(u + Math.cos(a) * r, 0.55 + Math.sin(t * 2.3 + ph) * 0.18, v + Math.sin(a * 1.3) * r);
    g.rotation.y = -a;
    const f = Math.sin(t * 22 + ph) * 1.1;
    wl.rotation.z = f;
    wr.rotation.z = -f;
  });
  return g;
}

function crab(tiles: [number, number][], anim: Tick[]) {
  const g = new Group(), shell = L("#E8553A"), dark = L("#1E1E1E");
  const body = new Group();
  g.add(body);
  part(body, new SphereGeometry(0.11, 8, 6).scale(1.3, 0.55, 1), shell, 0, 0.08, 0);
  for (const x of [-0.05, 0.05]) {
    part(body, new CylinderGeometry(0.008, 0.008, 0.06, 4), shell, x, 0.15, 0.06, false);
    part(body, new SphereGeometry(0.018, 5, 4), dark, x, 0.18, 0.06, false);
  }
  const claws: Mesh[] = [];
  for (const x of [-0.17, 0.17]) claws.push(part(body, new SphereGeometry(0.05, 6, 4).scale(1, 0.7, 1.2), shell, x, 0.08, 0.1));
  anim.push(wanderer(g, tiles, {
    speed: 0.9, rest: [1, 3],
    onStep: (t, moving) => {
      body.rotation.z = moving ? Math.sin(t * 18) * 0.12 : 0;
      claws.forEach((c, i) => (c.position.y = 0.08 + Math.max(0, Math.sin(t * 6 + i * 2)) * 0.04));
    },
  }));
  // crabs walk sideways
  anim.push(() => (body.rotation.y = Math.PI / 2));
  return g;
}

function turtle(tiles: [number, number][], anim: Tick[]) {
  const g = new Group(), shell = L("#3E8E5A"), skin = L("#8BC98A");
  part(g, new SphereGeometry(0.17, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1.15), shell, 0, 0.05, 0);
  part(g, new CylinderGeometry(0.18, 0.18, 0.04, 10).scale(1, 1, 1.15), L("#2F6E45"), 0, 0.05, 0);
  const head = part(g, new SphereGeometry(0.06, 6, 5), skin, 0, 0.09, 0.22);
  const legs = [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]].map(([x, z]) => part(g, new SphereGeometry(0.04, 5, 4), skin, x, 0.03, z));
  anim.push(wanderer(g, tiles, {
    speed: 0.12, rest: [3, 7],
    onStep: (t, moving) => {
      head.position.z = 0.22 + (moving ? Math.sin(t * 3) * 0.015 : 0);
      legs.forEach((l, i) => (l.position.y = 0.03 + (moving ? Math.max(0, Math.sin(t * 5 + i * 1.6)) * 0.03 : 0)));
    },
  }));
  return g;
}

function lizard(tiles: [number, number][], anim: Tick[], color: string) {
  const g = new Group(), skin = L(color), belly = L("#F2D27A");
  const body = new Group();
  g.add(body);
  part(body, new CapsuleGeometry(0.04, 0.16, 3, 6).rotateX(Math.PI / 2), skin, 0, 0.04, 0);
  part(body, new SphereGeometry(0.045, 6, 4).scale(1, 0.8, 1.3), skin, 0, 0.05, 0.14);
  const tail = part(body, new ConeGeometry(0.03, 0.22, 5).rotateX(-Math.PI / 2), skin, 0, 0.035, -0.2);
  part(body, new SphereGeometry(0.03, 5, 3).scale(1.2, 0.4, 2), belly, 0, 0.015, 0, false);
  anim.push(wanderer(g, tiles, {
    speed: 2.2, rest: [0.6, 3],
    onStep: (t, moving) => {
      body.rotation.y = moving ? Math.sin(t * 25) * 0.25 : 0;
      tail.rotation.y = Math.sin(t * (moving ? 25 : 3)) * 0.4;
    },
  }));
  return g;
}

function slime(tiles: [number, number][], anim: Tick[], color: string) {
  const g = new Group(), jelly = L(color, { emissive: color, e: 0.25, transparent: true, opacity: 0.85 });
  const blob = part(g, new SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62).translate(0, -0.05, 0), jelly, 0, 0.05, 0);
  const eyes = new Group();
  for (const x of [-0.05, 0.05]) part(eyes, new SphereGeometry(0.022, 6, 4), L("#1E1E1E"), x, 0.08, 0.12, false);
  g.add(eyes);
  anim.push(wanderer(g, tiles, {
    speed: 0.7, rest: [1, 4], hop: 0.22,
    onStep: (t, moving) => {
      const s = moving ? 1 + Math.sin(t * 14) * 0.12 : 1 + Math.sin(t * 3) * 0.05;
      blob.scale.set(2 - s, s, 2 - s);
      eyes.position.y = (s - 1) * 0.12;
    },
  }));
  return g;
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
  const g = new Group(), black = L("#25282E"), white = L("#FFFFFF"), orange = L("#FF9F1C");
  const body = new Group();
  g.add(body);
  part(body, new CapsuleGeometry(0.1, 0.14, 4, 8), black, 0, 0.17, 0);
  part(body, new CapsuleGeometry(0.075, 0.1, 4, 8).scale(1, 1, 0.6), white, 0, 0.16, 0.05, false);
  part(body, new ConeGeometry(0.025, 0.06, 4).rotateX(Math.PI / 2), orange, 0, 0.3, 0.11, false);
  for (const x of [-0.035, 0.035]) part(body, new SphereGeometry(0.012, 4, 3), white, x, 0.32, 0.085, false);
  const wings = [-0.11, 0.11].map((x) => part(body, new BoxGeometry(0.02, 0.14, 0.07), black, x, 0.17, 0));
  for (const x of [-0.04, 0.04]) part(g, new BoxGeometry(0.05, 0.015, 0.07), orange, x, 0.01, 0.03, false);
  anim.push(wanderer(g, tiles, {
    speed: 0.45, rest: [1, 5],
    onStep: (t, moving) => {
      body.rotation.z = moving ? Math.sin(t * 12) * 0.16 : 0;
      wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (moving ? 0.35 + Math.sin(t * 12) * 0.2 : 0.1)));
    },
  }));
  return g;
}

function dragon(tiles: [number, number][], anim: Tick[]) {
  const g = new Group(), red = L("#E03A2A"), dark = L("#9C1F14"), wingM = new MeshLambertMaterial({ color: "#FF7A45", side: DoubleSide, flatShading: true });
  part(g, new CapsuleGeometry(0.09, 0.3, 4, 8).rotateX(Math.PI / 2), red, 0, 0, 0);
  part(g, new SphereGeometry(0.09, 8, 6).scale(1, 0.9, 1.3), red, 0, 0.06, 0.26);
  for (const x of [-0.04, 0.04]) part(g, new ConeGeometry(0.02, 0.08, 4), dark, x, 0.14, 0.24, false);
  part(g, new ConeGeometry(0.05, 0.3, 5).rotateX(-Math.PI / 2), red, 0, 0, -0.33);
  const wl = part(g, new ConeGeometry(0.16, 0.42, 3).rotateZ(Math.PI / 2).translate(-0.21, 0, 0).scale(1, 0.15, 1), wingM, -0.05, 0.05, 0);
  const wr = part(g, new ConeGeometry(0.16, 0.42, 3).rotateZ(-Math.PI / 2).translate(0.21, 0, 0).scale(1, 0.15, 1), wingM, 0.05, 0.05, 0);
  const cu = tiles.reduce((s, [u]) => s + u, 0) / tiles.length, cv = tiles.reduce((s, [, v]) => s + v, 0) / tiles.length;
  anim.push((t) => {
    const a = t * 0.45;
    g.position.set(cu + Math.cos(a) * 2.2, 1.6 + Math.sin(t * 1.5) * 0.2, cv + Math.sin(a) * 2.2);
    g.rotation.y = -a + Math.PI;
    const f = Math.sin(t * 7) * 0.7;
    wl.rotation.z = f;
    wr.rotation.z = -f;
  });
  return g;
}
