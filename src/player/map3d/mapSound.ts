/* Arena Map sounds. Each land has its own music (made with Google Lyria) under a real nature recording
   (a summer field, sea waves with gulls, bubbling lava; credits in src/assets/mapsound/CREDITS.md), and the two
   cross-fade as you move between lands. Lands without a recording get a soft synthesised breeze. Sheep and
   turtles use real recordings; the other animals keep small synthesised voices. Taps and arriving use the live
   quiz's pop and chime. Only the files for the land in view are fetched; until they arrive the old soft chord
   pad plays. On by default but silent until the player first touches the map (browsers require a tap before
   audio); the speaker button turns it off and the choice is remembered on this device. */
import { LS } from "../../lib/util";

const FILES = {
  ...(import.meta.glob("../../assets/mapsound/*.mp3", { eager: true, query: "?url", import: "default" }) as Record<string, string>),
  ...(import.meta.glob(["../../assets/sound/pop.mp3", "../../assets/sound/right.mp3"], { eager: true, query: "?url", import: "default" }) as Record<string, string>),
};
const fileUrl = (name: string) => FILES[`../../assets/mapsound/${name}.mp3`] || FILES[`../../assets/sound/${name}.mp3`];
/** each land: its music and its nature bed (or a synthesised breeze) */
const LAND: Record<string, { amb?: string; breeze?: number; gulls?: boolean }> = {
  rookie: { amb: "amb-meadow" },
  coast: { amb: "amb-waves", gulls: true },
  sunset: { breeze: 0.016 },
  crystal: { amb: "amb-pond", breeze: 0.006 },
  frost: { breeze: 0.022 },
  volcano: { amb: "amb-bubbles", breeze: 0.008 },
};
const MUSIC_OF: Record<string, string> = { rookie: "music-meadow", coast: "music-coast", sunset: "music-canyon", crystal: "music-crystal", frost: "music-frost", volcano: "music-volcano" };
const MUSIC_VOL = 0.5;
const AMB_VOL = 0.55;

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
  private playing = false;
  private noise: AudioBuffer | null = null;
  private bufs = new Map<string, Promise<AudioBuffer | null>>();
  private land = "rookie";
  private layers: { src: AudioScheduledSourceNode; gain: GainNode }[] = [];
  private landTimers: number[] = [];
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
    this.landTimers.forEach((t) => clearTimeout(t));
    this.landTimers = [];
    this.playing = false;
    const c = this.ctx;
    if (c) for (const l of this.layers) l.src.stop(c.currentTime + 2);
    this.layers = [];
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

  /* ---------------- the background: land music + nature ---------------- */
  /** Fetch and decode one file once; null if it isn't there or can't be decoded. */
  private buf(name: string): Promise<AudioBuffer | null> {
    let p = this.bufs.get(name);
    if (!p) {
      const u = fileUrl(name);
      const c = this.ctx;
      p = !u || !c ? Promise.resolve(null) : fetch(u).then((r) => r.arrayBuffer()).then((a) => c.decodeAudioData(a)).catch(() => null);
      this.bufs.set(name, p);
    }
    return p;
  }

  /** The land in view changed: cross-fade to its music and nature bed. */
  setLand(key: string) {
    if (!LAND[key] || key === this.land) return;
    this.land = key;
    if (this.playing) this.startLand();
  }

  private ambient() {
    const c = this.ctx;
    if (!c || !this.out || this.playing) return;
    this.playing = true;
    const amb = c.createGain();
    amb.gain.value = 0;
    amb.gain.setTargetAtTime(1, c.currentTime, 1.2);
    amb.connect(this.out);
    this.amb = amb;
    this.startLand();
  }

  /** Fade out what's playing and start this land's layers (the soft pad stands in until the music loads). */
  private async startLand() {
    const c = this.ctx;
    const amb = this.amb;
    if (!c || !amb) return;
    const key = this.land;
    const conf = LAND[key] || {};
    // the old layers fade out over 1.5 s
    for (const l of this.layers) {
      l.gain.gain.setTargetAtTime(0.0001, c.currentTime, 0.5);
      l.src.stop(c.currentTime + 2.5);
    }
    this.layers = [];
    this.landTimers.forEach((t) => clearTimeout(t));
    this.landTimers = [];
    const loopLayer = (buf: AudioBuffer, vol: number) => {
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = buf;
      src.loop = true;
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(vol, c.currentTime, 0.7);
      src.connect(g).connect(amb);
      src.start();
      this.layers.push({ src, gain: g });
    };
    if (conf.breeze) this.breeze(conf.breeze);
    const [music, bed] = await Promise.all([this.buf(MUSIC_OF[key]), conf.amb ? this.buf(conf.amb) : Promise.resolve(null)]);
    if (!this.playing || this.land !== key) return; // moved on while loading
    if (music) loopLayer(music, MUSIC_VOL);
    else this.pad();
    if (bed) loopLayer(bed, AMB_VOL);
    if (conf.gulls) {
      const gull = () => {
        if (!this.playing || this.land !== key) return;
        void this.clip("call-gull", 0.35 + Math.random() * 0.2, 0.92 + Math.random() * 0.16);
        this.landTimers.push(window.setTimeout(gull, 9000 + Math.random() * 12000));
      };
      this.landTimers.push(window.setTimeout(gull, 2500));
    }
  }

  /** A soft synthesised breeze: noise through a slowly wandering band-pass. */
  private breeze(vol: number) {
    const c = this.ctx!;
    const wind = this.white();
    wind.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const wg = c.createGain();
    wg.gain.value = 0.0001;
    wg.gain.setTargetAtTime(vol, c.currentTime, 0.8);
    const lfo = c.createOscillator(), lfoG = c.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(bp.frequency);
    wind.connect(bp).connect(wg).connect(this.amb!);
    wind.start();
    lfo.start();
    this.layers.push({ src: wind, gain: wg }, { src: lfo, gain: lfoG });
  }

  /** The old soft chord pad: only while a land's music hasn't loaded (or can't). */
  private pad() {
    const c = this.ctx!;
    const key = this.land;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    lp.connect(this.amb!);
    let k = 0;
    const chord = () => {
      if (!this.playing || this.land !== key) return;
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
      this.landTimers.push(window.setTimeout(chord, 6500));
    };
    chord();
  }

  /** Play a recorded one-shot; false if it isn't available (the caller then synthesises). */
  private async clip(name: string, vol = 1, rate = 1): Promise<boolean> {
    const c = this.ac();
    if (!c || !this.out) return false;
    const b = await this.buf(name);
    if (!b) return false;
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = b;
    src.playbackRate.value = rate;
    g.gain.value = vol;
    src.connect(g).connect(this.out);
    src.start();
    return true;
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
    void this.clip("pop", 0.7, 0.95 + Math.random() * 0.12).then((ok) => {
      if (!ok) this.tone(c.currentTime, 520, 0.12, { to: 780, vol: 0.12 });
    });
  }

  /** You reached your stop. */
  arrive() {
    const c = this.ac();
    if (!c) return;
    void this.clip("right", 0.7).then((ok) => {
      if (ok) return;
      const t = c.currentTime;
      [523.25, 659.25, 783.99].forEach((f, i) => this.tone(t + i * 0.09, f, 0.35, { type: "triangle", vol: 0.08 }));
    });
  }

  /** The voice of a tapped animal. */
  animal(name: string) {
    const c = this.ac();
    if (!c) return;
    // real recordings where there are good free ones; the rest keep their synthesised voices
    const real: Record<string, [string, number]> = { Sheep: ["call-sheep", 0.9], Turtle: ["call-splash", 0.6] };
    if (real[name]) {
      void this.clip(real[name][0], real[name][1], 0.95 + Math.random() * 0.1).then((ok) => ok || this.synthAnimal(name));
      return;
    }
    this.synthAnimal(name);
  }

  private synthAnimal(name: string) {
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
