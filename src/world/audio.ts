/* Tiny synthesised sound kit for Knowledge World — no audio files.
   Browsers only allow audio after a tap/key press; unlock() is called then. */
import { LS } from "../lib/util";

const KEY = "bsx.world.sound";

export class Sfx {
  on = LS.get(KEY) !== "0";
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  unlock() {
    if (!this.on || this.ctx) {
      if (this.ctx?.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!C) return;
      this.ctx = new C();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.35;
      this.out.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }
  set(on: boolean) {
    this.on = on;
    LS.set(KEY, on ? "1" : "0");
    if (!on) this.engineOff();
    if (on) this.unlock();
    if (this.out) this.out.gain.value = on ? 0.35 : 0;
  }
  dispose() {
    this.engineOff();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private tone(freq: number, dur: number, type: OscillatorType = "square", vol = 0.25, slide = 0, delay = 0) {
    const c = this.ctx;
    if (!this.on || !c || !this.out) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol = 0.2, freq = 900) {
    const c = this.ctx;
    if (!this.on || !c || !this.out) return;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.out);
    src.start();
  }

  jump() { this.tone(330, 0.16, "square", 0.12, 380); }
  land() { this.noise(0.08, 0.12, 500); }
  coin() {
    this.tone(988, 0.07, "square", 0.1);
    this.tone(1319, 0.16, "square", 0.1, 0, 0.06);
  }
  bubble() {
    this.tone(520, 0.12, "sine", 0.25, 500);
    this.tone(880, 0.2, "triangle", 0.18, 300, 0.08);
  }
  right() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, "triangle", 0.18, 0, i * 0.07)); }
  wrong() { this.tone(300, 0.3, "sawtooth", 0.08, -140); }
  door() { this.noise(0.12, 0.15, 1400); this.tone(180, 0.1, "square", 0.08); }
  beep(high = false) { this.tone(high ? 880 : 440, high ? 0.4 : 0.18, "square", 0.14); }
  bounce() { this.tone(200, 0.25, "sine", 0.3, 500); }
  crash() { this.noise(0.35, 0.3, 700); }
  win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.18, "square", 0.12, 0, i * 0.1)); }
  lose() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.16, 0, i * 0.14)); }

  /** Continuous engine note while driving (0 = idle … 1 = flat out). */
  engineSet(level: number, boost: boolean) {
    const c = this.ctx;
    if (!this.on || !c || !this.out) return;
    if (!this.engine) {
      const osc = c.createOscillator();
      const osc2 = c.createOscillator();
      const filter = c.createBiquadFilter();
      const gain = c.createGain();
      osc.type = "sawtooth";
      osc2.type = "square";
      filter.type = "lowpass";
      filter.frequency.value = 600;
      gain.gain.value = 0;
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.out);
      osc.start();
      osc2.start();
      this.engine = { osc, osc2, gain, filter };
    }
    const t = c.currentTime;
    const f = 48 + level * 120 + (boost ? 30 : 0);
    this.engine.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(f * 0.502, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(420 + level * 900, t, 0.05);
    this.engine.gain.gain.setTargetAtTime(0.055 + level * 0.04, t, 0.08);
  }
  engineOff() {
    if (!this.engine || !this.ctx) return;
    const e = this.engine;
    this.engine = null;
    e.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => {
      try {
        e.osc.stop();
        e.osc2.stop();
      } catch {
        /* already stopped */
      }
    }, 300);
  }
}
