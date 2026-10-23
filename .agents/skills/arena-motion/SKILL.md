---
name: arena-motion
description: Ant Arena's signature motion style for fast, premium product films and social promos (15–60 s) built with HyperFrames - a glowing hero object that travels through every scene, one accent colour on ink or paper, real app screens rebuilt big, camera whips and zoom-throughs with motion blur, word-by-word kinetic type, music-led sound. Use when asked for an Ant Arena (or any white-label tenant) promo, teaser, feature reel, launch clip or "make it look like those motion videos".
---

# Arena Motion

A house style for Ant Arena product films, distilled from two reference reels (`references/reference-breakdown.md`). It sits on top of HyperFrames: read `/hyperframes` (contract, work loop) first, and use this skill for the creative decisions. The working example is `pitch-video/promo30/`.

## 1. The look in numbers

| Element | Value |
| --- | --- |
| Grounds | Ink `#161512` (night scenes) and Paper `#F4F3EE` (day scenes), each with a soft radial vignette (edges about 18% darker) |
| Accent | Lime `#C6F432` for the hero object, the key word and the active control. Orange `#FF5A1F` is the one secondary, for a "hot" word or the burst. A tenant film swaps in its brand primary |
| Glow | A lime light dome rising from the bottom edge (a radial gradient 140% wide, 30–45% of the frame high, opacity 0.55) and bloom on the hero (`box-shadow 0 0 40px` plus a 90 px halo at 0.35) |
| Type | Kinetic lines in Figtree 300–500 at 64–96 px, with the key word at weight 800 in the accent colour. Hero words in Anton at 160–260 px. Never more than 7 words on screen |
| Depth | Anything the camera isn't looking at sits at `blur(6–14px)` and 60% opacity |
| Product | Real screens (phone at 1.6–2× scale, 52 px radius, ink bezel) or rebuilt pieces. Text stays at least 26 px after any push |

## 2. The hero object

Every film has one: the **lime spark** (an 18–28 px lime orb with bloom). It is the cause of every transition:

- it **writes**: words blur in as it passes;
- it **dives**: it shrinks into a button, card or logo, and that thing lights up;
- it **bursts**: it scales from 1 to 40 in 0.25 s (`power3.in`) and its colour becomes the next ground;
- it **becomes**: it morphs into a coin, a buzzer, a pin on the map;
- it **lands** last as the dot in the end card.

If a beat has no job for the spark, the spark rests at the edge of the frame, small and glowing; it never just floats.

## 3. Scene grammar (pick 3–5 transitions per film, each caused by something on screen)

| Move | Recipe |
| --- | --- |
| Whip | The outgoing group moves −700 px with blur 0→24 px in 0.18 s (`power3.in`); the incoming group arrives from +700 px with blur 24→0 in 0.28 s (`expo.out`) |
| Zoom-through | The camera wrapper scales 1→6 around the target in 0.45 s (`power3.in`) with blur 0→10 px; the next scene starts at scale 1.15 and settles to 1 in 0.5 s |
| Burst | Spark scales ×40 (0.25 s `power3.in`); the next ground is the spark's colour; content fades in at 70% of the burst |
| Pull-back reveal | A full-frame result shrinks 1→0.42 into a phone or window (0.6 s `power2.inOut`), with the device building around it |
| Morph | One rounded container tweens its width, height and radius into the next (0.3 s `power3.out`) with a horizontal blur of 12→0 |
| Colour flood | The hero stays still while the ground swaps ink↔paper behind it (0.35 s `power2.inOut`) |

The camera is always one wrapper per scene (`.cam`). Tween only its `x`, `y`, `scale` and `filter`.

## 4. Kinetic type

- **Word by word**: each word `opacity 0→1` and `filter blur(8px)→0`, 0.14 s each, 0.08 s apart, no translate. The key word lands last and **then** its underline wipes (`scaleX 0→1`, 0.3 s `expo.out`).
- **Slot roll** for numbers: digits roll through 6–8 values at 0.07 s each and land with a 6 px blur clearing.
- **Hero word**: Anton, clip-path wipe left→right in 0.35 s, then dead still.
- A landed line never moves again; the camera or the world behind it moves instead.
- Hold a line for 0.5 s plus 0.3 s a word (`/hyperframes` motion.md).

## 5. Rhythm (30 s template, music at 120 BPM, beat = 0.5 s)

| Beat | Time | Content |
| --- | --- | --- |
| Hook | 0–3 s | Ink ground and glow. The spark writes the old pain in 4–6 words, then the turn ("…now it's a game.") |
| Mark | 3–5 s | Burst to paper; the mark spins in (rotateY 540°→0 with blur) and lands on a downbeat |
| Feature run | 5–25 s | 6–8 features at 2–3 s each. Each is a real screen plus a one-word verb (Sprint. Sort. Collect. Race. Read. Host. Vote. Certify.), linked by whips and zoom-throughs and carried by the spark |
| Proof | 25–27 s | A bento grid of the remaining features, or one rolling number |
| End card | 27–30 s | The spark lands as the dot; the mark and wordmark wipe; one claim plus a call to action held at least 2 s |

Cut on beats (`t = downbeat + 0.5·k`), change layout on bars (every 2 s).

## 6. Sound

- **Music leads.** No voiceover unless asked. Bed: modern electronic pop, 118–124 BPM, tight drums, pluck bass, bright stabs. With no HeyGen sign-in, generate it with Lyria (needs `GEMINI_API_KEY`):
  `python3 .agents/skills/media-use/audio/scripts/lyria-recipe.py --output bed.wav --duration 34 --bpm 120 --brightness 0.85 --density 0.7 --prompt "punchy modern electronic pop, tight drums, deep pluck bass, bright synth stabs, confident and playful, product launch energy, instrumental"`
- **Shape the bed** with ffmpeg rather than inside the film: 6 dB quieter under the dark hook, a 0.4 s dip before the payoff, and a 1.2 s fade on a bar line at the end.
- **Effects are few and caused**: a whoosh on each whip (rotate 2–3 files), a soft impact on bursts and landings, a pop on chips and counters, one riser into the end card. Peaks land one frame after the picture, 3–6 dB over the bed.
- Final mix: −16 to −14 LUFS, true peak at or under −1 dBTP. Measure with `npx hyperframes audio <render> --json`.

## 7. Build checklist

1. `/hyperframes` contract, then `SPEC.md` with every beat's time, transition and sound.
2. Capture fresh screens (they must show today's characters and labels); put them in `assets/shots/`.
3. One sub-composition per beat; the spark is drawn in each scene at the matching position, so the hand-off at each seam is invisible.
4. `npx hyperframes check --json` until it is clean, then `snapshot` each seam (±2 frames) and the end card.
5. Render, then measure the audio.

## 8. Tells that break the style

A fade-and-slide-up on every element; a breathing or pulsing title; a small screenshot floating in the middle of empty space; three equal feature cards; a logo docked in a corner; more than one accent colour per scene; the same whoosh on every cut; a narrator reading the on-screen words.
