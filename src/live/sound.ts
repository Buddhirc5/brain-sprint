/* Tiny WebAudio sound kit for the live quiz — no audio files, nothing to download.
   Browsers only allow sound after a tap or key press, so the host turns it on with a button. */
import { LS } from "../lib/util";

type Wave = OscillatorType;
const KEY = "bs.live.sound";

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private loopTimer = 0;
  private loopKind: "lobby" | "question" | null = null;
  private step = 0;
  private nextAt = 0;
  on = LS.get(KEY) === "1";

  private ac(): AudioContext | null {
    if (!this.on) return null;
    try {
      if (!this.ctx) {
        const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!C) return null;
        this.ctx = new C();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }
  /** Call from a click/keypress so the browser lets audio start. */
  unlock() {
    this.ac();
  }
  set(on: boolean) {
    this.on = on;
    LS.set(KEY, on ? "1" : "0");
    if (!on) {
      this.stopLoop();
      void this.ctx?.suspend();
    } else this.unlock();
  }

  private tone(freq: number, at: number, dur: number, type: Wave = "square", vol = 0.12, slide?: number) {
    const c = this.ac();
    if (!c || !this.master) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
  private now() {
    return this.ac()?.currentTime ?? 0;
  }

  pop() {
    const t = this.now();
    if (!t) return;
    this.tone(520, t, 0.09, "triangle", 0.2, 1040);
  }
  tap() {
    const t = this.now();
    if (!t) return;
    this.tone(880, t, 0.05, "square", 0.08);
  }
  tick(last = false) {
    const t = this.now();
    if (!t) return;
    this.tone(last ? 1320 : 990, t, 0.06, "square", 0.09);
  }
  go() {
    const t = this.now();
    if (!t) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.07, 0.16, "square", 0.1));
  }
  gong() {
    const t = this.now();
    if (!t) return;
    this.tone(196, t, 0.9, "triangle", 0.25);
    this.tone(294, t, 0.7, "sine", 0.12);
    this.tone(392, t + 0.02, 0.5, "sine", 0.08);
  }
  right() {
    const t = this.now();
    if (!t) return;
    [659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.08, 0.22, "triangle", 0.18));
  }
  wrong() {
    const t = this.now();
    if (!t) return;
    this.tone(300, t, 0.25, "sawtooth", 0.08, 180);
    this.tone(200, t + 0.2, 0.35, "sawtooth", 0.08, 120);
  }
  whoosh() {
    const t = this.now();
    if (!t) return;
    this.tone(200, t, 0.35, "sine", 0.12, 900);
  }
  drum() {
    const t = this.now();
    if (!t) return;
    for (let i = 0; i < 14; i++) this.tone(90 + (i % 2) * 8, t + i * 0.07, 0.07, "triangle", 0.15 + i * 0.01);
  }
  fanfare() {
    const t = this.now();
    if (!t) return;
    const seq: [number, number, number][] = [[523, 0, 0.15], [523, 0.16, 0.1], [523, 0.28, 0.1], [698, 0.4, 0.5], [880, 0.4, 0.5], [784, 0.95, 0.15], [880, 1.12, 0.7], [1047, 1.12, 0.7]];
    for (const [f, d, l] of seq) this.tone(f, t + d, l, "square", 0.1);
  }

  /** Background loop: calm in the lobby, driving during a question. */
  loop(kind: "lobby" | "question" | null) {
    if (kind === this.loopKind) return;
    this.stopLoop();
    this.loopKind = kind;
    if (!kind || !this.ac()) return;
    this.step = 0;
    this.nextAt = this.now() + 0.05;
    const bpm = kind === "lobby" ? 112 : 150;
    const eighth = 60 / bpm / 2;
    const bass = kind === "lobby" ? [110, 110, 165, 110, 147, 147, 131, 165] : [98, 98, 147, 98, 117, 117, 131, 147];
    const lead = kind === "lobby" ? [440, 0, 554, 659, 0, 554, 494, 0, 440, 0, 659, 587, 0, 554, 494, 440] : [392, 466, 587, 466, 392, 466, 587, 698, 392, 466, 587, 466, 440, 523, 587, 523];
    const schedule = () => {
      const c = this.ac();
      if (!c) return;
      while (this.nextAt < c.currentTime + 0.2) {
        const s = this.step;
        if (s % 2 === 0) this.tone(bass[(s / 2) % bass.length], this.nextAt, eighth * 1.6, "triangle", 0.14);
        const l = lead[s % lead.length];
        if (l) this.tone(l, this.nextAt, eighth * 0.8, "square", 0.035);
        if (kind === "question" && s % 4 === 2) this.tone(2400, this.nextAt, 0.02, "square", 0.02);
        this.nextAt += eighth;
        this.step++;
      }
    };
    schedule();
    this.loopTimer = window.setInterval(schedule, 60);
  }
  stopLoop() {
    clearInterval(this.loopTimer);
    this.loopTimer = 0;
    this.loopKind = null;
  }
}

export const sound = new Sound();
