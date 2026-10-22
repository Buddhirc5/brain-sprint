# Ant Arena pitch videos

Two HyperFrames films built from the real app:
- the screens were captured from the in-browser demo with Ant Arena branding;
- the characters, pets, rides and logo are the app's own SVGs;
- the fonts are the app's Anton, Figtree, Bangers and Comic Neue.

| Film | Folder | Length | What it is |
|---|---|---|---|
| A · "Module 4 of 19" | `pitch/` | 73 s | The full pitch. It opens on a dull e-learning module, then follows one chain through every feature, ending on the manager view, the claims and the end card. |
| C · "From compulsory to competitive" | `teaser/` | 29.5 s | A short kinetic teaser with one word and one real screen per feature, cut on the voice. |

The two films were picked from the three storylines in `STORYLINES.md`.

## Sound
- **Voiceover:** Kokoro "Heart", generated free on the device. The source lines are in `vo/a.tsv` and `vo/c.tsv`.
- **Effects:** bundled Pixabay sound effects (see `pitch/assets/sfx/CREDITS.md`).
- **Music:** there is no music bed, because music needs a HeyGen sign-in (`heygen auth login --oauth`). To add a track, drop it into `assets/` and add an `<audio id="music" … data-volume="0.14">` to each `index.html`.

## Edit and re-render
```bash
cd pitch            # or teaser
npx hyperframes preview          # the Studio preview in the browser
npx hyperframes check            # lint, layout and contrast
npx hyperframes render --quality delivery --output renders/out.mp4
```
- **Copy:** the call to action and the tagline are variables in each `index.html`.
- **Scenes:** each scene is one file in `compositions/`.
- **Timing:** the voiceover and effect timings are the `<audio>` tags in `index.html`.

## Things to know
- The demo's join address (a dev URL) is cropped out of the live quiz and poll screens. Recapture those screens once the real domain is live if you want the address on screen.
- The finished MP4s are in `out/` (not committed, they are large). Their loudness has been normalised to about −15 LUFS.
