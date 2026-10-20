/* Arena Map sounds, made on the fly with WebAudio (no audio files): a calm ambient bed of soft chords,
   a breeze and the odd bird chirp, plus a voice for each animal and little chimes for the player.
   On by default but silent until the player first touches the map (browsers require a tap before
   audio); the speaker button turns it off and the choice is remembered on this device. */
import { LS } from "../../lib/util";

const KEY = "bs.map.sound";
// gentle chords (Hz): Cmaj7 → Am7 → Fmaj7 → G6, a few seconds each
const CHORDS = [
  [130.81, 196.0, 246.94, 329.63],
  [110.0, 164.81, 196.0, 261.63],
  [87.31, 174.61, 220.0, 329.63],
  [98.0, 146.83, 196.0, 246.94],
];

class MapSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private amb: GainNode | null = null;
  private timers: number[] = [];
  private playing = false;
  private noise: AudioBuffer | null = null;
  on = LS.get(KEY) !== "0";

  private ac() {
    if (!this.on) return null;
    try {
      if (!this.ctx) {
        const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!C) return null;
        this.ctx = new C();
        this.out = this.ctx.createGain();
        this.out.gain.value = 0.7;
        this.out.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** From a tap: lets the browser start audio, then starts the ambient bed. */
  unlock() {
    if (this.ac()) this.ambient();
  }

  set(on: boolean) {
    this.on = on;
    LS.set(KEY, on ? "1" : "0");
    if (on) this.unlock();
    else this.stop();
  }

  /** Leaving the map, or the tab is hidden. */
  stop() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.playing = false;
    if (this.amb && this.ctx) {
      const g = this.amb;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => g.disconnect(), 2000);
      this.amb = null;
    }
  }

  private white() {
    const c = this.ctx!;
    if (!this.noise) {
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource();
    s.buffer = this.noise;
    return s;
  }

  private later(ms: number, f: () => void) {
    this.timers.push(window.setTimeout(f, ms));
  }

  /* ---------------- the calm background ---------------- */
  private ambient() {
    const c = this.ctx;
    if (!c || !this.out || this.playing) return;
    this.playing = true;
    const amb = c.createGain();
    amb.gain.value = 0;
    amb.gain.setTargetAtTime(1, c.currentTime, 1.5);
    amb.connect(this.out);
    this.amb = amb;

    // soft pad: each chord fades in and out over ~7 s through a warm low-pass
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.connect(amb);
    let k = 0;
    const chord = () => {
      if (!this.playing) return;
      const t = c.currentTime;
      for (const f of CHORDS[k % CHORDS.length]) {
        for (const det of [-4, 4]) {
          const o = c.createOscillator(), g = c.createGain();
          o.type = "sine";
          o.frequency.value = f;
          o.detune.value = det;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.018, t + 2.5);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 8);
          o.connect(g).connect(lp);
          o.start(t);
          o.stop(t + 8.2);
        }
      }
      k++;
      this.later(6500, chord);
    };
    chord();

    // a breeze: noise through a slowly wandering band-pass
    const wind = this.white();
    wind.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const wg = c.createGain();
    wg.gain.value = 0.012;
    const lfo = c.createOscillator(), lfoG = c.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(bp.frequency);
    wind.connect(bp).connect(wg).connect(amb);
    wind.start();
    lfo.start();

    // birds now and then
    const bird = () => {
      if (!this.playing) return;
      const t = c.currentTime;
      const base = 2200 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.chirp(t + i * 0.13, base * (1 + (i % 2) * 0.12), 0.09, 0.012, amb);
      this.later(5000 + Math.random() * 9000, bird);
    };
    this.later(3000, bird);
  }

  private chirp(at: number, f: number, dur: number, vol: number, to?: AudioNode) {
    const c = this.ctx!;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f, at);
    o.frequency.exponentialRampToValueAtTime(f * 1.35, at + dur * 0.6);
    o.frequency.exponentialRampToValueAtTime(f * 0.9, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(to || this.out!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /* ---------------- one-shot sounds ---------------- */
  private tone(at: number, f: number, dur: number, o: { type?: OscillatorType; vol?: number; to?: number; vib?: number; filter?: [BiquadFilterType, number, number] } = {}) {
    const c = this.ctx!;
    const osc = c.createOscillator(), g = c.createGain();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(f, at);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + dur);
    if (o.vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = 7;
      lg.gain.value = o.vib;
      l.connect(lg).connect(osc.frequency);
      l.start(at);
      l.stop(at + dur);
    }
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.1, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f2 = c.createBiquadFilter();
      [f2.type, f2.frequency.value, f2.Q.value] = o.filter;
      node = osc.connect(f2);
    }
    node.connect(g).connect(this.out!);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private burst(at: number, dur: number, vol: number, filter: [BiquadFilterType, number, number], sweepTo?: number) {
    const c = this.ctx!;
    const s = this.white(), f = c.createBiquadFilter(), g = c.createGain();
    [f.type, f.frequency.value, f.Q.value] = filter;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(this.out!);
    s.start(at, Math.random());
    s.stop(at + dur + 0.05);
  }

  /** A tap on a character. */
  pop() {
    const c = this.ac();
    if (!c) return;
    const t = c.currentTime;
    this.tone(t, 520, 0.12, { to: 780, vol: 0.12 });
  }

  /** You reached your stop. */
  arrive() {
    const c = this.ac();
    if (!c) return;
    const t = c.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(t + i * 0.09, f, 0.35, { type: "triangle", vol: 0.08 }));
  }

  /** The voice of a tapped animal. */
  animal(name: string) {
    const c = this.ac();
    if (!c) return;
    const t = c.currentTime;
    switch (name) {
      case "Sheep": // baa: buzzy, wobbly, a little falling
        this.tone(t, 260, 0.65, { type: "sawtooth", to: 220, vib: 14, vol: 0.12, filter: ["bandpass", 1100, 3] });
        break;
      case "Rabbit":
        this.tone(t, 320, 0.14, { to: 640, vol: 0.12 });
        this.tone(t + 0.18, 340, 0.14, { to: 700, vol: 0.1 });
        break;
      case "Butterfly":
        [1760, 2349, 2960].forEach((f, i) => this.tone(t + i * 0.07, f, 0.2, { type: "triangle", vol: 0.05 }));
        break;
      case "Crab":
        for (let i = 0; i < 4; i++) this.burst(t + i * 0.09, 0.03, 0.2, ["highpass", 2500, 1]);
        break;
      case "Turtle":
        this.tone(t, 130, 0.8, { type: "triangle", to: 110, vib: 3, vol: 0.12 });
        break;
      case "Lizard":
      case "Salamander":
        this.tone(t, 1200, 0.08, { type: "triangle", to: 2400, vol: 0.08 });
        this.tone(t + 0.11, 1300, 0.08, { type: "triangle", to: 2600, vol: 0.07 });
        break;
      case "Slime":
        this.tone(t, 620, 0.25, { to: 150, vol: 0.14 });
        this.tone(t + 0.22, 480, 0.18, { to: 140, vol: 0.09 });
        break;
      case "Penguin":
        this.tone(t, 900, 0.12, { type: "square", to: 1300, vol: 0.05, filter: ["bandpass", 1200, 4] });
        this.tone(t + 0.16, 950, 0.12, { type: "square", to: 1400, vol: 0.05, filter: ["bandpass", 1200, 4] });
        break;
      case "Dragon": // roar: a growl under a rushing breath
        this.tone(t, 90, 1.1, { type: "sawtooth", to: 60, vib: 6, vol: 0.12, filter: ["lowpass", 500, 1] });
        this.burst(t, 1.1, 0.18, ["lowpass", 300, 1], 1600);
        break;
      default:
        this.pop();
    }
  }
}

export const mapSound = new MapSound();
