/* Look and feel for the 3D Arena Map: sky colours per land and time of day, soft billboards (mist, cloud
   skirts, lantern glows), sparse land particles (petals, snow, embers…), one landmark per land, and a
   gentle colour mute so the whole map reads as one calm palette. Nothing here changes how the map works. */
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, ConeGeometry, CylinderGeometry, DoubleSide, Group, InstancedMesh,
  Material, Matrix4, Mesh, MeshBasicMaterial, MeshLambertMaterial, NormalBlending, OctahedronGeometry, PlaneGeometry, Points, PointsMaterial,
  Quaternion, Scene, SRGBColorSpace, TorusGeometry, Vector3, BoxGeometry, DodecahedronGeometry,
} from "three";

export type Tod = "morning" | "day" | "dusk" | "night";
export function timeOfDay(h = new Date().getHours()): Tod {
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 17) return "day";
  if (h >= 17 && h < 20) return "dusk";
  return "night";
}

/** Lights for each time of day: hemisphere sky / ground / strength, sun colour / strength, ambient, lantern glow. */
export const LIGHT: Record<Tod, { sky: string; ground: string; hemi: number; sun: string; sunI: number; amb: number; lamp: number }> = {
  morning: { sky: "#FFF0DC", ground: "#8C7A5B", hemi: 1.45, sun: "#FFD9A8", sunI: 1.95, amb: 0.25, lamp: 0.15 },
  day: { sky: "#EAF6FF", ground: "#8C7A5B", hemi: 1.55, sun: "#FFF1D6", sunI: 2.1, amb: 0.25, lamp: 0 },
  dusk: { sky: "#FFD3B4", ground: "#7A5F55", hemi: 1.25, sun: "#FFB070", sunI: 1.75, amb: 0.22, lamp: 0.8 },
  night: { sky: "#B9C8F0", ground: "#4A4566", hemi: 1.15, sun: "#C9D4FF", sunI: 1.0, amb: 0.28, lamp: 1 },
};

/** Land key: "Frost Peaks II" → "frost". */
export const landKey = (name: string) => name.replace(/ [IVX]+$/, "").split(" ")[0].toLowerCase();

/** Soft sky per land (top → bottom), pastel. */
const SKY: Record<string, [string, string]> = {
  rookie: ["#F4FBF4", "#BFE3EA"],
  coral: ["#F1FAFF", "#A8DCF0"],
  sunset: ["#FFF5EC", "#F6CDB2"],
  crystal: ["#F7F3FF", "#CFC5F2"],
  frost: ["#F8FBFF", "#C6DAF0"],
  volcano: ["#FBF1EC", "#DDBDB3"],
};
const TOD_TINT: Record<Tod, [string, number, number]> = {
  morning: ["#FFE3C2", 0.18, 0.12],
  day: ["#FFFFFF", 0, 0],
  dusk: ["#FFB98C", 0.32, 0.38],
  night: ["#1E2A4C", 0.72, 0.62],
};
export function skyFor(name: string, tod: Tod): [Color, Color] {
  const [a, b] = SKY[landKey(name)] || SKY.rookie;
  // night has its own deep blue sky, just hinting at the land's colour
  if (tod === "night") return [new Color("#22325A").lerp(new Color(a), 0.1), new Color("#51629A").lerp(new Color(b), 0.16)];
  const [tint, ka, kb] = TOD_TINT[tod];
  const t = new Color(tint);
  return [new Color(a).lerp(t, ka), new Color(b).lerp(t, kb)];
}

/** A calmer palette: a little less saturation and a touch lighter. */
const hsl = { h: 0, s: 0, l: 0 };
export function mute(c: Color, k = 0.14) {
  c.getHSL(hsl);
  return c.setHSL(hsl.h, hsl.s * (1 - k), hsl.l + (1 - hsl.l) * 0.035);
}

/* ---------- soft round texture (shared) ---------- */
let dotTex: CanvasTexture | null = null;
export function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  dotTex = new CanvasTexture(c);
  dotTex.colorSpace = SRGBColorSpace;
  dotTex.userData.shared = true;
  return dotTex;
}

/** The camera never turns (it only slides), so billboards can face it once. */
export function faceCamera(off: Vector3) {
  return new Quaternion().setFromRotationMatrix(new Matrix4().lookAt(off, new Vector3(), new Vector3(0, 1, 0)));
}

/** Many soft camera-facing discs in one draw call (mist, cloud skirts, lantern glows…). */
export class Billboards {
  mesh: InstancedMesh;
  private m = new Matrix4();
  private s = new Vector3();
  private p = new Vector3();
  constructor(scene: Scene, private q: Quaternion, n: number, o: { color?: string; opacity: number; additive?: boolean; order?: number }) {
    const mat = new MeshBasicMaterial({ map: softDot(), transparent: true, opacity: o.opacity, depthWrite: false, color: o.color || "#fff", blending: o.additive ? AdditiveBlending : NormalBlending, fog: !o.additive });
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1), mat, Math.max(1, n));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = o.order ?? 1;
    scene.add(this.mesh);
  }
  get material() {
    return this.mesh.material as MeshBasicMaterial;
  }
  add(x: number, y: number, z: number, sx: number, sy = sx, c?: Color) {
    const i = this.mesh.count++;
    this.set(i, x, y, z, sx, sy);
    if (c) this.mesh.setColorAt(i, c);
    return i;
  }
  set(i: number, x: number, y: number, z: number, sx: number, sy = sx) {
    this.mesh.setMatrixAt(i, this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, 1)));
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ---------- land particles ---------- */
type PKind = { color: string[]; size: number; vy: number; sway: number; additive: boolean; twinkle?: boolean; opacity: number };
const PARTS: Record<string, PKind> = {
  rookie: { color: ["#FFB7D2", "#FFFFFF", "#FFD6E6"], size: 6, vy: -0.32, sway: 0.5, additive: false, opacity: 0.85 },
  coral: { color: ["#FFF6D8", "#FFFFFF"], size: 5, vy: 0.05, sway: 0.1, additive: true, twinkle: true, opacity: 0.9 },
  sunset: { color: ["#F7D8B5", "#FBE6CE"], size: 4, vy: -0.05, sway: 0.6, additive: false, opacity: 0.6 },
  crystal: { color: ["#D9CCFF", "#B9A6FF", "#FFFFFF"], size: 5, vy: 0.12, sway: 0.15, additive: true, twinkle: true, opacity: 0.9 },
  frost: { color: ["#FFFFFF", "#EEF5FF"], size: 5, vy: -0.45, sway: 0.35, additive: false, opacity: 0.9 },
  volcano: { color: ["#FF9A3D", "#FFC14D", "#FF6A1A"], size: 4, vy: 0.55, sway: 0.25, additive: true, twinkle: true, opacity: 0.95 },
};
const N_PART = 34;
const SPAN = 9;

/** A few drifting particles around the camera, styled by the land in view. */
export function makeParticles(scene: Scene, anim: ((t: number, dt: number) => void)[], center: () => Vector3, land: () => string) {
  const pos = new Float32Array(N_PART * 3), col = new Float32Array(N_PART * 3), base = new Float32Array(N_PART * 3), ph = new Float32Array(N_PART);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("color", new BufferAttribute(col, 3));
  const mats: Record<string, PointsMaterial> = {};
  const matOf = (k: PKind, key: string) =>
    (mats[key] ||= new PointsMaterial({ size: k.size, sizeAttenuation: false, map: softDot(), vertexColors: true, transparent: true, depthWrite: false, opacity: k.opacity, blending: k.additive ? AdditiveBlending : NormalBlending, fog: false }));
  let cur = "";
  let kind = PARTS.rookie;
  const pts = new Points(geo, matOf(kind, "rookie"));
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  scene.add(pts);
  const tmp = new Color();
  const spawn = (i: number, c: Vector3, anywhere: boolean) => {
    pos[i * 3] = c.x + (Math.random() - 0.5) * SPAN * 2;
    pos[i * 3 + 2] = c.z + (Math.random() - 0.5) * SPAN * 2;
    pos[i * 3 + 1] = anywhere ? Math.random() * 4 - 0.5 : kind.vy < 0 ? 3.5 + Math.random() : kind.vy > 0.2 ? -0.6 - Math.random() : Math.random() * 3;
    tmp.set(kind.color[Math.floor(Math.random() * kind.color.length)]);
    base[i * 3] = tmp.r;
    base[i * 3 + 1] = tmp.g;
    base[i * 3 + 2] = tmp.b;
    ph[i] = Math.random() * 6.28;
  };
  anim.push((t, dt) => {
    const c = center();
    const k = land();
    if (k !== cur) {
      cur = k;
      kind = PARTS[k] || PARTS.rookie;
      pts.material = matOf(kind, k);
      for (let i = 0; i < N_PART; i++) spawn(i, c, true);
    }
    for (let i = 0; i < N_PART; i++) {
      const j = i * 3;
      pos[j] += Math.sin(t * 0.8 + ph[i]) * kind.sway * dt;
      pos[j + 1] += kind.vy * dt * (0.7 + (ph[i] % 1) * 0.6);
      pos[j + 2] += Math.cos(t * 0.6 + ph[i]) * kind.sway * 0.5 * dt;
      const far = Math.abs(pos[j] - c.x) > SPAN || Math.abs(pos[j + 2] - c.z) > SPAN;
      if (far || pos[j + 1] < -1.4 || pos[j + 1] > 4.8) spawn(i, c, far);
      const tw = kind.twinkle ? 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + ph[i] * 3)) : 1;
      col[j] = base[j] * tw;
      col[j + 1] = base[j + 1] * tw;
      col[j + 2] = base[j + 2] * tw;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });
  return pts;
}

/* ---------- landmarks ---------- */
const L = (c: string, o: Partial<{ emissive: string; e: number; opacity: number }> = {}) =>
  new MeshLambertMaterial({ color: mute(new Color(c), 0.1), flatShading: true, emissive: o.emissive || "#000", emissiveIntensity: o.e || 0, transparent: o.opacity != null, opacity: o.opacity ?? 1 });
function part(g: Group, geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, cast = true) {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

/** The signature landmark of a land, standing on tile (u, v). Night-aware parts read `lamp()` (0–1). */
export function landmark(key: string, anim: ((t: number, dt: number) => void)[], lamp: () => number, puffs: Billboards | null): Group {
  const g = new Group();
  switch (key) {
    case "rookie": {
      // windmill with turning sails
      part(g, new CylinderGeometry(0.2, 0.32, 1.2, 8).translate(0, 0.6, 0), L("#F4ECDC"));
      part(g, new ConeGeometry(0.3, 0.38, 8).translate(0, 1.38, 0), L("#C9563C"));
      part(g, new BoxGeometry(0.14, 0.22, 0.04).translate(0, 0.2, 0.3), L("#7A5230"));
      const hub = new Group();
      hub.position.set(0.16, 1.05, 0.16);
      hub.rotation.y = Math.PI / 4;
      g.add(hub);
      const sail = new BoxGeometry(0.1, 0.62, 0.02).translate(0, 0.33, 0);
      const wood = L("#EADDC2");
      for (let i = 0; i < 4; i++) {
        const s = new Mesh(sail, wood);
        s.rotation.z = (i * Math.PI) / 2;
        s.castShadow = true;
        hub.add(s);
      }
      anim.push((_, dt) => (hub.rotation.z -= dt * 0.9));
      break;
    }
    case "coral": {
      // lighthouse with a sweeping beam
      const stripes = ["#F7F3EA", "#D9523E", "#F7F3EA", "#D9523E"];
      stripes.forEach((c, i) => part(g, new CylinderGeometry(0.2 - i * 0.02, 0.23 - i * 0.02, 0.3, 10).translate(0, 0.15 + i * 0.3, 0), L(c)));
      const lampMat = L("#FFE7A0", { emissive: "#FFC94D", e: 0.4 });
      part(g, new CylinderGeometry(0.15, 0.15, 0.2, 10).translate(0, 1.32, 0), lampMat);
      part(g, new ConeGeometry(0.2, 0.22, 10).translate(0, 1.53, 0), L("#3A4A5A"));
      const beam = new Mesh(new ConeGeometry(0.28, 2.4, 16, 1, true).rotateZ(Math.PI / 2).translate(1.2, 0, 0), new MeshBasicMaterial({ color: "#FFF1BF", transparent: true, opacity: 0.15, depthWrite: false, side: DoubleSide }));
      beam.position.y = 1.32;
      g.add(beam);
      anim.push((t, dt) => {
        beam.rotation.y += dt * 0.8;
        const l = lamp();
        (beam.material as MeshBasicMaterial).opacity = 0.06 + l * 0.22;
        lampMat.emissiveIntensity = 0.35 + l * 0.9 + Math.sin(t * 3) * 0.05;
      });
      break;
    }
    case "sunset": {
      // natural rock arch
      const rock = L("#C9764A"), dark = L("#A85E38");
      for (const x of [-0.42, 0.42]) {
        part(g, new CylinderGeometry(0.17, 0.24, 0.9, 6).translate(x, 0.45, 0), x < 0 ? rock : dark);
      }
      part(g, new TorusGeometry(0.42, 0.15, 6, 12, Math.PI).translate(0, 0.9, 0), rock);
      part(g, new DodecahedronGeometry(0.16, 0).translate(0.62, 0.1, 0.2), dark);
      g.rotation.y = Math.PI / 4;
      break;
    }
    case "crystal": {
      // one giant glowing crystal
      const glow = new MeshLambertMaterial({ color: "#CDBEFF", flatShading: true, emissive: "#7A5CF5", emissiveIntensity: 0.55, transparent: true, opacity: 0.92 });
      const big = part(g, new OctahedronGeometry(0.34, 0).scale(1, 2.6, 1).translate(0, 0.85, 0), glow);
      part(g, new OctahedronGeometry(0.18, 0).scale(1, 2, 1).translate(0.32, 0.32, 0.1), glow).rotation.z = -0.35;
      part(g, new OctahedronGeometry(0.15, 0).scale(1, 1.8, 1).translate(-0.3, 0.26, -0.08), glow).rotation.z = 0.4;
      anim.push((t) => {
        big.rotation.y = t * 0.25;
        glow.emissiveIntensity = 0.5 + Math.sin(t * 1.6) * 0.18 + lamp() * 0.3;
      });
      break;
    }
    case "frost": {
      // small ice castle
      const ice = L("#E8F3FF", { emissive: "#9CC6FF", e: 0.12 }), roof = L("#8FB6E8", { emissive: "#6FA0E0", e: 0.1 });
      part(g, new BoxGeometry(0.7, 0.4, 0.5).translate(0, 0.2, 0), ice);
      for (const [x, h] of [[-0.32, 0.9], [0.32, 0.75], [0, 1.15]] as const) {
        part(g, new CylinderGeometry(0.11, 0.13, h, 8).translate(x, h / 2, x === 0 ? -0.1 : 0.05), ice);
        part(g, new ConeGeometry(0.16, 0.34, 8).translate(x, h + 0.17, x === 0 ? -0.1 : 0.05), roof);
      }
      break;
    }
    case "volcano": {
      // a smoking crater
      part(g, new CylinderGeometry(0.26, 0.62, 0.55, 9).translate(0, 0.27, 0), L("#4A3633"));
      const lava = new Mesh(new CylinderGeometry(0.22, 0.22, 0.02, 12), new MeshBasicMaterial({ color: "#FF7A1A" }));
      lava.position.y = 0.55;
      g.add(lava);
      if (puffs) {
        const n = 5, base = new Vector3();
        const ids: number[] = [];
        for (let i = 0; i < n; i++) ids.push(puffs.add(0, -50, 0, 0.01));
        anim.push((t) => {
          g.getWorldPosition(base);
          ids.forEach((id, i) => {
            const k = (t * 0.22 + i / n) % 1;
            puffs.set(id, base.x + Math.sin(t * 0.7 + i) * 0.15 * k - k * 0.3, base.y + 0.65 + k * 1.6, base.z - k * 0.3, 0.35 + k * 0.9);
          });
        });
      }
      anim.push((t) => ((lava.material as MeshBasicMaterial).color.setHSL(0.07, 1, 0.5 + Math.sin(t * 2) * 0.06)));
      break;
    }
    default: {
      // unknown theme: a simple stone obelisk
      part(g, new CylinderGeometry(0.12, 0.22, 1.1, 4).translate(0, 0.55, 0), L("#B8B2A6"));
    }
  }
  return g;
}

/** Lanterns along the path: posts and heads instanced; their glow comes up at dusk and night. */
export function makeLanterns(scene: Scene, at: [number, number][], glows: Billboards, lampLevel: number) {
  const n = Math.max(1, at.length);
  const post = new InstancedMesh(new CylinderGeometry(0.025, 0.035, 0.55, 5).translate(0, 0.275, 0), L("#4A433A"), n);
  const headMat = new MeshLambertMaterial({ color: "#FFE2A0", emissive: "#FFB84D", emissiveIntensity: 0.15 + lampLevel * 1.1, flatShading: true });
  const head = new InstancedMesh(new BoxGeometry(0.11, 0.13, 0.11), headMat, n);
  const m = new Matrix4();
  at.forEach(([x, z], i) => {
    post.setMatrixAt(i, m.makeTranslation(x, 0, z));
    head.setMatrixAt(i, m.makeTranslation(x, 0.6, z));
    if (lampLevel > 0) glows.add(x, 0.62, z, 0.9 + lampLevel * 0.4);
  });
  post.count = head.count = at.length;
  post.castShadow = head.castShadow = true;
  scene.add(post, head);
}

