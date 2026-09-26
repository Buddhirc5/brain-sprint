/* The app's cartoon characters, rebuilt in low-poly 3D for Knowledge World.
   Same palette and hairstyles as components/Chibi.tsx (big head, small body). */
import {
  BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, SphereGeometry,
  type Material,
} from "three";
import { lookOf } from "../components/Chibi";

export interface Rig {
  root: Group;
  body: Group; // bobs while walking
  legL: Group;
  legR: Group;
  armL: Group;
  armR: Group;
  head: Group;
}

const mats = new Map<string, Material>();
function mat(color: string): Material {
  let m = mats.get(color);
  if (!m) {
    m = new MeshLambertMaterial({ color });
    mats.set(color, m);
  }
  return m;
}
const dark = new MeshBasicMaterial({ color: "#1B1A17" });
const white = new MeshBasicMaterial({ color: "#FFFFFF" });
const blush = new MeshBasicMaterial({ color: "#FF9BB0", transparent: true, opacity: 0.55 });
const shadowMat = new MeshBasicMaterial({ color: "#000000", transparent: true, opacity: 0.22, depthWrite: false });

function m(geo: ConstructorParameters<typeof Mesh>[0], material: Material, x = 0, y = 0, z = 0): Mesh {
  const mesh = new Mesh(geo, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Soft round shadow under things (cheap stand-in for real shadows on phones). */
export function blobShadow(radius: number): Mesh {
  const s = new Mesh(new CircleGeometry(radius, 20), shadowMat);
  s.rotation.x = -Math.PI / 2;
  s.position.y = 0.03;
  s.renderOrder = -1;
  return s;
}

export function buildCharacter(look: number): Rig {
  const L = lookOf(look);
  const root = new Group();
  const body = new Group();
  root.add(body);
  root.add(blobShadow(0.62));

  // legs (pivot at the hip)
  const leg = (x: number) => {
    const g = new Group();
    g.position.set(x, 0.56, 0);
    g.add(m(new CylinderGeometry(0.13, 0.14, 0.46, 8), mat(L.pants), 0, -0.25, 0));
    g.add(m(new BoxGeometry(0.26, 0.14, 0.38), mat(L.shoe), 0, -0.5, 0.06));
    body.add(g);
    return g;
  };
  const legL = leg(-0.16);
  const legR = leg(0.16);

  // torso + trim
  body.add(m(new CylinderGeometry(0.3, 0.38, 0.58, 12), mat(L.top), 0, 0.84, 0));
  body.add(m(new CylinderGeometry(0.385, 0.385, 0.08, 12), mat(L.trim), 0, 0.58, 0));
  body.add(m(new CylinderGeometry(0.2, 0.2, 0.06, 10), mat(L.trim), 0, 1.13, 0));

  // arms (pivot at the shoulder)
  const arm = (x: number) => {
    const g = new Group();
    g.position.set(x, 1.06, 0);
    g.add(m(new CylinderGeometry(0.09, 0.08, 0.44, 8), mat(L.top), 0, -0.2, 0));
    g.add(m(new SphereGeometry(0.1, 8, 6), mat(L.skin), 0, -0.45, 0));
    body.add(g);
    return g;
  };
  const armL = arm(-0.4);
  const armR = arm(0.4);

  // head
  const head = new Group();
  head.position.set(0, 1.62, 0);
  body.add(head);
  head.add(m(new SphereGeometry(0.52, 20, 16), mat(L.skin)));
  // eyes (+z is forward)
  for (const x of [-0.18, 0.18]) {
    const e = new Mesh(new SphereGeometry(0.075, 10, 8), dark);
    e.position.set(x, 0.02, 0.47);
    e.scale.set(1, 1.35, 0.6);
    head.add(e);
    const h = new Mesh(new SphereGeometry(0.025, 6, 4), white);
    h.position.set(x + 0.025, 0.06, 0.515);
    head.add(h);
  }
  if (L.g === "f") {
    for (const x of [-0.3, 0.3]) {
      const b = new Mesh(new CircleGeometry(0.07, 12), blush);
      b.position.set(x, -0.12, 0.44);
      b.rotation.y = x * 0.9;
      head.add(b);
    }
  }
  const mouth = new Mesh(new BoxGeometry(0.12, 0.03, 0.02), dark);
  mouth.position.set(0, -0.18, 0.49);
  head.add(mouth);

  // hair
  const hm = mat(L.hair);
  const tip = mat(L.tips || L.hair);
  const cap = new Mesh(new SphereGeometry(0.56, 20, 12, 0, Math.PI * 2, 0, Math.PI * (L.h === "buzz" || L.h === "crew" ? 0.38 : 0.52)), hm);
  cap.rotation.x = -0.35;
  cap.position.set(0, 0.04, -0.03);
  cap.castShadow = true;
  head.add(cap);
  switch (L.h) {
    case "long":
    case "wavy":
      head.add(m(new BoxGeometry(0.98, 0.9, 0.34), hm, 0, -0.28, -0.3));
      head.add(m(new BoxGeometry(1.0, 0.18, 0.36), tip, 0, -0.76, -0.3));
      break;
    case "bob":
      head.add(m(new CylinderGeometry(0.58, 0.6, 0.5, 16, 1, true), hm, 0, -0.12, -0.06));
      break;
    case "twin":
      for (const x of [-0.58, 0.58]) {
        head.add(m(new SphereGeometry(0.2, 10, 8), hm, x, -0.05, -0.12));
        head.add(m(new SphereGeometry(0.14, 10, 8), tip, x * 1.08, -0.32, -0.12));
      }
      break;
    case "bun":
      head.add(m(new SphereGeometry(0.24, 12, 10), hm, 0, 0.56, -0.2));
      break;
    case "pony":
      head.add(m(new SphereGeometry(0.16, 10, 8), hm, 0, 0.18, -0.55));
      head.add(m(new ConeGeometry(0.16, 0.7, 8), hm, 0, -0.25, -0.62));
      break;
    case "curly":
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        head.add(m(new SphereGeometry(0.17, 8, 6), hm, Math.cos(a) * 0.42, 0.34 + Math.sin(i * 1.7) * 0.05, Math.sin(a) * 0.36 - 0.06));
      }
      break;
    case "spiky":
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const c = m(new ConeGeometry(0.13, 0.38, 6), i % 2 ? tip : hm, Math.cos(a) * 0.3, 0.52, Math.sin(a) * 0.28 - 0.08);
        c.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
        head.add(c);
      }
      break;
    case "quiff":
      head.add(m(new SphereGeometry(0.22, 10, 8), hm, 0.06, 0.52, 0.22));
      break;
    case "side":
      head.add(m(new BoxGeometry(0.5, 0.16, 0.3), hm, -0.18, 0.4, 0.3));
      break;
  }
  if (L.beard) {
    const b = new Mesh(new SphereGeometry(0.44, 14, 8, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), hm);
    b.position.set(0, -0.06, 0.08);
    head.add(b);
  }
  return { root, body, legL, legR, armL, armR, head };
}

/** Walk cycle: `phase` advances with distance travelled; `amt` 0 (standing) … 1 (full stride). */
export function animateRig(r: Rig, phase: number, amt: number, airborne: boolean) {
  const s = Math.sin(phase) * 0.7 * amt;
  r.legL.rotation.x = airborne ? -0.5 : s;
  r.legR.rotation.x = airborne ? 0.3 : -s;
  r.armL.rotation.x = airborne ? -2.4 : -s * 0.9;
  r.armR.rotation.x = airborne ? -2.4 : s * 0.9;
  r.body.position.y = airborne ? 0 : Math.abs(Math.cos(phase)) * 0.07 * amt;
  r.head.rotation.z = Math.sin(phase * 0.5) * 0.04 * amt;
}
