/* =====================================================================
   Side-view car physics (a small rigid body on two sprung wheels).
   - Each wheel is a spring-damper hanging from the body; contact force
     acts along the ground normal, so the car pitches over crests and
     lands on its suspension.
   - Drive/brake forces act along the ground at the contact patch and are
     limited by grip (∝ load), so a car can wheelie and spin its wheels.
   - In the air, left/right tilts the car (lean control), like classic
     hill-climb games. Units: px, s. y grows downwards.
   ===================================================================== */
import { ground, slope, WORLD_W, type CarSpec } from "./city";

export const GRAVITY = 1750;
const ANCHOR_X = 46;
const ANCHOR_Y = 4;
const K = 88; // spring rate per wheel (mass 1 car)
const DAMP = 9;
const GRIP = 1.35;
const I = 1840; // moment of inertia (140×50 box, mass 1)

export interface CarInput {
  thr: number; // -1…1, world direction (+1 = push right)
  boost: boolean;
}

export class CarBody {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  a = 0; // body angle (radians, canvas rotate)
  w = 0; // angular velocity
  dir: 1 | -1 = 1; // which way it faces
  flip = 1; // -1…1 animated facing (paper flip)
  spin = 0;
  comp = [0, 0]; // current spring compression per wheel
  contact = [false, false];
  airTime = 0;
  flippedFor = 0;
  landed = 0; // impact strength of the last landing (for dust/shake)
  private turnHold = 0;
  constructor(public spec: CarSpec, x: number) {
    this.x = x;
    this.y = ground(x) - (ANCHOR_Y + spec.travel + 16 - 10 + spec.wheelR);
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }
  private rest() {
    return this.spec.travel + 16; // anchor → wheel centre at full extension
  }

  /** Wheel centres in the car's local frame (for drawing). */
  wheelsLocal() {
    const L = this.rest();
    return [-1, 1].map((sx, i) => ({ x: sx * ANCHOR_X, y: ANCHOR_Y + L - this.comp[i] }));
  }

  step(dt: number, inp: CarInput) {
    const n = 4;
    const h = dt / n;
    for (let i = 0; i < n; i++) this.sub(h, inp);
    // facing: turn around when (nearly) stopped and pushing the other way
    if (Math.sign(inp.thr) === -this.dir && Math.abs(this.vx) < 60 && (this.contact[0] || this.contact[1])) {
      this.turnHold += dt;
      if (this.turnHold > 0.22) {
        this.dir = this.dir === 1 ? -1 : 1;
        this.turnHold = 0;
      }
    } else this.turnHold = 0;
    this.flip += (this.dir - this.flip) * Math.min(1, dt * 10);
    this.spin += (this.vx * dt) / this.spec.wheelR;
  }

  private sub(h: number, inp: CarInput) {
    const { spec } = this;
    const ca = Math.cos(this.a);
    const sa = Math.sin(this.a);
    const L = this.rest();
    let fx = 0;
    let fy = GRAVITY;
    let tq = 0;
    const was = this.contact[0] || this.contact[1];
    let any = false;
    for (let i = 0; i < 2; i++) {
      const lx = (i === 0 ? -1 : 1) * ANCHOR_X;
      // anchor in world
      const ax = this.x + lx * ca - ANCHOR_Y * sa;
      const ay = this.y + lx * sa + ANCHOR_Y * ca;
      const g = ground(ax);
      // compression: how far the fully extended wheel would sink into the ground
      let c = ay + L + spec.wheelR - g;
      if (c <= 0) {
        this.comp[i] += (0 - this.comp[i]) * Math.min(1, h * 20);
        this.contact[i] = false;
        continue;
      }
      if (c > spec.travel + spec.wheelR + 6) {
        // the ground is above the wheel: a wall (cliff face). Stop sideways.
        const push = Math.sign(this.x - ax) || 1;
        this.x += push * 1.5;
        this.vx = push * Math.abs(this.vx) * 0.25;
        c = spec.travel;
      }
      any = true;
      this.contact[i] = true;
      this.comp[i] = Math.min(c, spec.travel);
      const s = slope(ax);
      const inv = 1 / Math.hypot(1, s);
      const nx = s * inv; // ground normal (points up, i.e. -y)
      const ny = -inv;
      const tx = inv; // ground tangent (points right)
      const ty = s * inv;
      // velocity of the anchor point
      const rx = ax - this.x;
      const ry = ay - this.y;
      const pvx = this.vx - this.w * ry;
      const pvy = this.vy + this.w * rx;
      const vn = pvx * nx + pvy * ny;
      let Fn = K * Math.min(c, spec.travel) - DAMP * vn;
      if (c > spec.travel) Fn += 900 * (c - spec.travel) - 30 * vn; // bump stop
      if (Fn < 0) Fn = 0;
      // drive / brake along the ground
      const vt = pvx * tx + pvy * ty;
      let Ft = 0;
      const thr = inp.thr;
      if (thr !== 0 && Math.sign(thr) !== Math.sign(vt) && Math.abs(vt) > 40) Ft = -Math.sign(vt) * 1500 * Math.abs(thr);
      else if (thr !== 0) {
        const fade = 1 - Math.min(1, Math.max(0, (vt * Math.sign(thr)) / spec.top));
        Ft = thr * spec.accel * fade * (Math.sign(thr) === this.dir ? 1 : 0.55);
      } else Ft = -Math.sign(vt) * Math.min(Math.abs(vt) * 3, 180);
      if (inp.boost && thr * this.dir > 0) Ft += this.dir * 900;
      Ft *= 0.5; // per wheel
      const lim = GRIP * Fn;
      if (Math.abs(Ft) > lim) Ft = Math.sign(Ft) * lim;
      const Fx = nx * Fn + tx * Ft;
      const Fy = ny * Fn + ty * Ft;
      fx += Fx;
      fy += Fy;
      // torque about the body centre; the drive acts lower, at the contact patch
      const cx = ax - this.x;
      const cy = ay + (L - this.comp[i]) + spec.wheelR - this.y;
      tq += rx * (ny * Fn) - ry * (nx * Fn) + (cx * ty * Ft - cy * tx * Ft);
    }
    if (!any) {
      // lean control in the air
      this.w += inp.thr * spec.air * h * 1.4;
      if (inp.boost) {
        fx += Math.cos(this.a) * this.dir * 500;
        fy += Math.sin(this.a) * this.dir * 500;
      }
      this.airTime += h;
    } else {
      if (!was && this.airTime > 0.25) this.landed = Math.min(1, this.vy / 900 + this.airTime * 0.3);
      this.airTime = 0;
    }
    this.vx += fx * h;
    this.vy += fy * h;
    this.w += (tq / I) * h;
    this.w *= 1 - (any ? 2.2 : 0.4) * h;
    this.w = Math.max(-7, Math.min(7, this.w));
    this.x += this.vx * h;
    this.y += this.vy * h;
    this.a += this.w * h;
    // body corners must stay above ground
    const c2 = Math.cos(this.a);
    const s2 = Math.sin(this.a);
    let roof = false;
    for (const [px, py, top] of [[-68, 8, false], [68, 8, false], [-60, -44, true], [56, -44, true]] as [number, number, boolean][]) {
      const wx = this.x + px * c2 - py * s2;
      const wy = this.y + px * s2 + py * c2;
      const g = ground(wx);
      if (wy > g) {
        this.y -= wy - g;
        if (this.vy > 0) this.vy *= -0.15;
        this.vx *= 0.985;
        if (top) roof = true;
      }
    }
    this.flippedFor = roof ? this.flippedFor + h : Math.max(0, this.flippedFor - h * 2);
    if (this.x < 60) {
      this.x = 60;
      this.vx = Math.max(0, this.vx);
    }
    if (this.x > WORLD_W - 150) {
      this.x = WORLD_W - 150;
      this.vx = Math.min(0, this.vx);
    }
  }

  /** Put it back on its wheels (after a flip). */
  reset() {
    this.a = Math.atan(slope(this.x));
    this.w = 0;
    this.vx = 0;
    this.vy = 0;
    this.y = ground(this.x) - (ANCHOR_Y + this.rest() - 10 + this.spec.wheelR) - 30;
    this.flippedFor = 0;
  }
}
