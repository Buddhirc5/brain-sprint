/* The live quiz sound kit. Music beds (lobby, question, race) and the winner fanfare were made with Google Lyria;
   the effects are recorded Pixabay sounds (src/assets/sound/CREDITS.md). The files load only once sound is turned
   on, and until they arrive each sound falls back to a small synthesised version.
   Browsers only allow sound after a tap or key press, so the host turns it on with a button. */
import { LS } from "../lib/util";

const FILES = import.meta.glob("../assets/sound/*.mp3", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const url = (name: string) => FILES[`../assets/sound/${name}.mp3`];
type Clip = "pop" | "tap" | "tick" | "tick-last" | "go" | "reveal" | "right" | "wrong" | "whoosh" | "drumroll" | "fanfare";
type Bed = "lobby" | "question" | "race";
const CLIPS: Clip[] = ["pop", "tap", "tick", "tick-last", "go", "reveal", "right", "wrong", "whoosh", "drumroll", "fanfare"];
const MUSIC_VOL = 0.32; // beds sit under the effects

type Wave = OscillatorType;
const KEY = "bs.live.sound";

class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private loopTimer = 0;
  private loopKind: Bed | null = null;
  private bufs = new Map<string, AudioBuffer>();
  private loading = false;
  private bed: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
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
        void this.load();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }
  /** Fetch and decode every file once (they're small); missing ones keep the synthesised fallback. */
  private async load() {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    const c = this.ctx;
    await Promise.all(
      [...CLIPS, "music-lobby", "music-question", "music-race"].map(async (n) => {
        const u = url(n);
        if (!u) return;
        try {
          const buf = await c.decodeAudioData(await (await fetch(u)).arrayBuffer());
          this.bufs.set(n, buf);
        } catch {
          /* keep the fallback */
        }
      }),
    );
    // a bed asked for before its file arrived starts now
    const want = this.loopKind;
    if (want && !this.bed) {
      this.loopKind = null;
      this.loop(want);
    }
  }
  /** Play a recorded clip; false if it isn't loaded (the caller then synthesises). */
  private play(name: Clip, vol = 1, rate = 1): boolean {
    const c = this.ac();
    const b = this.bufs.get(name);
    if (!c || !this.master || !b) return false;
    const src = c.createBufferSource();
    const g = c.createGain();
    src.buffer = b;
    src.playbackRate.value = rate;
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start();
    return true;
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
    if (this.play("pop", 0.9, 0.94 + Math.random() * 0.12)) return;
    const t = this.now();
    if (!t) return;
    this.tone(520, t, 0.09, "triangle", 0.2, 1040);
  }
  tap() {
    if (this.play("tap", 0.8)) return;
    const t = this.now();
    if (!t) return;
    this.tone(880, t, 0.05, "square", 0.08);
  }
  tick(last = false) {
    if (this.play(last ? "tick-last" : "tick", 0.8)) return;
    const t = this.now();
    if (!t) return;
    this.tone(last ? 1320 : 990, t, 0.06, "square", 0.09);
  }
  go() {
    if (this.play("go", 0.9)) return;
    const t = this.now();
    if (!t) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.07, 0.16, "square", 0.1));
  }
  gong() {
    if (this.play("reveal", 0.8)) return;
    const t = this.now();
    if (!t) return;
    this.tone(196, t, 0.9, "triangle", 0.25);
    this.tone(294, t, 0.7, "sine", 0.12);
    this.tone(392, t + 0.02, 0.5, "sine", 0.08);
  }
  right() {
    if (this.play("right", 0.9)) return;
    const t = this.now();
    if (!t) return;
    [659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.08, 0.22, "triangle", 0.18));
  }
  wrong() {
    if (this.play("wrong", 0.7)) return;
    const t = this.now();
    if (!t) return;
    this.tone(300, t, 0.25, "sawtooth", 0.08, 180);
    this.tone(200, t + 0.2, 0.35, "sawtooth", 0.08, 120);
  }
  whoosh() {
    if (this.play("whoosh", 0.8, 0.9 + Math.random() * 0.25)) return;
    const t = this.now();
    if (!t) return;
    this.tone(200, t, 0.35, "sine", 0.12, 900);
  }
  drum() {
    if (this.play("drumroll", 0.9)) return;
    const t = this.now();
    if (!t) return;
    for (let i = 0; i < 14; i++) this.tone(90 + (i % 2) * 8, t + i * 0.07, 0.07, "triangle", 0.15 + i * 0.01);
  }
  fanfare() {
    if (this.play("fanfare", 1)) return;
    const t = this.now();
    if (!t) return;
    const seq: [number, number, number][] = [[523, 0, 0.15], [523, 0.16, 0.1], [523, 0.28, 0.1], [698, 0.4, 0.5], [880, 0.4, 0.5], [784, 0.95, 0.15], [880, 1.12, 0.7], [1047, 1.12, 0.7]];
    for (const [f, d, l] of seq) this.tone(f, t + d, l, "square", 0.1);
  }

  /** Background music: calm in the lobby, tense during a question, a stadium theme during a race. */
  loop(kind: Bed | null) {
    if (kind === this.loopKind) return;
    this.stopLoop();
    this.loopKind = kind;
    const c = this.ac();
    if (!kind || !c || !this.master) return;
    const buf = this.bufs.get(`music-${kind}`);
    if (buf) {
      // the recorded bed, looping seamlessly, faded in
      const src = c.createBufferSource();
      const gain = c.createGain();
      src.buffer = buf;
      src.loop = true;
      gain.gain.setValueAtTime(0.0001, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(MUSIC_VOL, c.currentTime + 0.6);
      src.connect(gain).connect(this.master);
      src.start();
      this.bed = { src, gain };
      return;
    }
    if (this.loading && !this.bufs.size) return; // the files are on their way; load() starts the bed
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
        if (kind !== "lobby" && s % 4 === 2) this.tone(2400, this.nextAt, 0.02, "square", 0.02);
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
    if (this.bed && this.ctx) {
      // fade the bed out rather than cutting it
      const { src, gain } = this.bed;
      const t = this.ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      src.stop(t + 0.5);
    }
    this.bed = null;
  }
}

export const sound = new Sound();
