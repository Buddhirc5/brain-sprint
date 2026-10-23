# Ant Arena · 30 s product film

A fast feature reel in the **Arena Motion** style (`.agents/skills/arena-motion`), modelled on two reference reels:
- a lime spark carries the eye through every scene;
- one accent colour sits on ink or paper;
- the transitions are camera whips and zoom-throughs with motion blur;
- type arrives word by word;
- music carries it, with no voiceover.

The shot list is in `SPEC.md`.

| Time | Beat |
| --- | --- |
| 0–3 s | "Training took an **hour**. Now it's a **game**." The spark writes it, then bursts |
| 3–5 s | The mark spins in, then ANT ARENA |
| 5–8 s | **Sprint**: the spark taps an answer, SPOT ON, +146 |
| 8–10.5 s | **Swipe it / Sort it**: swipe cards and buckets |
| 10.5–13.5 s | **Collect**: the store, 3D characters, a pet, coins |
| 13.5–16 s | **Race**: the 3D arena map |
| 16–18.5 s | **Read the story!**: comic case studies |
| 18.5–22 s | **Host it live**: the race on the big screen and players' phones |
| 22–26 s | Bento: polls, certificates, gap trend, security, your brand, streaks. "It's all **one app**." |
| 26–30 s | The end card and "Try it free — no sign-up" |

## Media
- **Screens:** captured from today's demo (3D characters, race mode), in `assets/shots/`.
- **Music:** Google Lyria (`assets/music/bed.mp3`), 120 BPM, trimmed so the bars land on 0, 2, 4 … s, then shaped (quiet hook, a dip before the drop at 26 s, a fade at the end).
- **Effects:** the bundled Pixabay set (`assets/sfx/CREDITS.md`), plus two pitched whoosh takes so no two cuts sound the same.

## Edit and re-render
```bash
npx hyperframes preview            # Studio preview
npx hyperframes check              # lint, layout and timing
npx hyperframes render --quality delivery --output renders/ant-arena-30s.mp4
```
- **Call to action and tagline:** these are variables in `index.html`.
- **Scenes:** each scene is one file in `compositions/`.
- **Timing:** the sound effect timings are the `<audio>` tags in `index.html`.
- **The finished file:** it goes to `renders/` (not committed).
