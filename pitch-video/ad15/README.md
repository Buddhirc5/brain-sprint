# Ant Arena · 15 s launch ad (vertical)

1080×1920, 60 fps, 15 s. Tagline: **"Learning, now playing."**

The reference was the "engraving-style Claude ad" on prompt-motion.com (14.5 s, vertical: black engravings on white, one orange dot that leads the eye, serif words that morph letter by letter, a 3D mark, then the logo).

**Borrowed techniques**
- one hero dot that carries every cut;
- 0.3–1 s shots;
- letter morphs;
- paint drawn over old art;
- a 3D mark before the logo.

**What is ours**
- Bold Anton type instead of a serif.
- Ant Arena's legacy colours: lime `#C6F432`, ink `#161512`, orange `#FF5A1F`, yellow `#FFD84D`, on pure white.
- A lime game token with an ink rim.
- Arena and sport subjects.
- A hand-drawn SVG runner.
- Real app screens and 3D characters.

| Time | Shot |
| --- | --- |
| 0–0.5 | The token drops and squashes |
| 0.5–1.25 | The token opens into the Colosseum; a lime lap ring is painted on; zoom into an arch |
| 1.25–2.25 | **learn → earn**: the token knocks the "l" out and lands as the full stop |
| 2.25–3.55 | Eight images at once; the Muybridge plate grows, then we push into one frame |
| 3.55–4.25 | Match cut to a drawn runner (lime head) on a numbered Muybridge track |
| 4.25–5.0 | **run → fun**, with a lime starburst |
| 5.0–6.0 | Discobolus on black: the painted discus is thrown along a dotted arc, +50 XP |
| 6.0–6.75 | Hourglass: lime sand runs, then it flips |
| 6.75–8.25 | The app: an engraved hand taps FALSE, "Spot on +146", characters pop |
| 8.25–9.0 | Trophy: painted crown, sparkles, the token lands on top |
| 9.0–10.0 | Engraved brain lit with lime paint; **train → brain** |
| 10.0–12.0 | **learning → playing**, "now" drops in, the full stop becomes ▶ and zooms through |
| 12.0–15.0 | Lime fills the frame, folds into the 3D logo tile, then ANT ARENA and "Learning, now playing." |

## Morphs
Each letter is a span whose width is Anton's true advance (`ADV` in `index.html`, read from the font file). Letters that leave or arrive animate their width with their glyph, so the word reflows exactly. Swaps (r→f, t→b, r→y) roll inside a clipped slot.

## Media
- **Images:** public domain or CC0 (see `assets/img/CREDITS.md`).
- **App screens and characters:** Ant Arena's own.
- **Music:** Google Lyria, 120 BPM, trimmed so beats land every 0.5 s.
- **Effects:** the bundled Pixabay set.

## Render
```bash
npx hyperframes check
npx hyperframes render --fps 60 --quality delivery --output renders/ant-arena-launch-15s.mp4
```
