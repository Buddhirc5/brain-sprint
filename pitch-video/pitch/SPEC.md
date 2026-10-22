# SPEC: Ant Arena pitch, storyline A "Module 4 of 19"

GOAL:    A buyer ends knowing Ant Arena does daily learning, comic case studies, live games, polls, certificates and gap analytics in one branded app, and wants to try it.
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps
TIME:    73 s x 30 = 2190 frames. The voice is the clock (Kokoro af_heart, 12 lines). Bundled Pixabay SFX, no music bed (no music source without a HeyGen sign-in).
LOOK:    ground Paper #F4F3EE, flat, no texture; ink #161512; accent Lime #C6F432 (one highlighted word per shot, the payoff, the end card);
         hit colour Orange #FF5A1F (numbers that land). Old-way world: cold grey #D6D6D2 with ink at 55% opacity.
         Display: Anton 400, 120-150 px titles, tracking -0.5%, uppercase. Body: Figtree 600, 34-40 px.
         Comic world only: Bangers 400 on Yellow #FFD84D with an 8 px halftone dot screen at 18% ink.
         Medium: the real product UI. Phone screenshots in an ink bezel (14 px, radius 64 px), 900-980 px tall;
         desktop screens full-bleed. Shadow 0 30 60 rgba(22,21,18,.18). No grain, no vignette.
OBJECTS: the phone (the carrier, from scene 2 to 5); the employee's character Nadeesha (glasses, black hair) with Biscuit the corgi and a kick scooter (SVG from the app);
         the grey e-learning player (not a real product: a generic window, "Module 4 of 19"); the projector screen (live quiz); the certificate sheet; the logo mascot.
MOTION:  enter expo.out 0.5-0.7 s; camera power2.inOut 0.6 s; exit power3.in 0.3 s; springs back.out(1.6) on characters, pets and coins only (playful, damping ~0.5).
         Titles: per-word blur 6px→0 in 0.13 s, 0.07 s apart; land, then dead still. Screen changes inside the phone: iris from the tap point, 0.18 s.
SHOTS:
  1  0-7      Grey LMS window, the progress bar crawls 21→22 %, the cursor clicks "Next" and nothing happens. VO a01. Phone rises from the bottom edge at 5.6; the ground floods to Paper.
  2  7-13     Phone (real lobby) centred-right; "ANT ARENA" lands left in Anton, "2 minutes a day" below with "2 minutes" in lime. VO a02.
  3  13-23    Tap "Play" → question → tap B → "SPOT ON +146" → swipe card leaning SAFE → buckets filling → "SO CLOSE +67". Labels land one by one on the VO verbs. VO a03.
  4  23-28.5  Results card → punch-in on the SECOND CHANCE button → tap → "Fix your miss" → retry with the struck-through first try. VO a04.
  5  28.5-36.5 Colour flood to Lime. Nadeesha drops in, the scooter slides under, the corgi hops in; the coin counter rolls 0→335; six pets pop in a row; whip to the 3D map phone. VO a05.
  6  36.5-42  Comic world: the story cover slams in, page turns to "What do you do?", the reply, the reaction. Bangers title "STORY MODE". VO a06.
  7  42-47.5  Projector: full-bleed lobby PIN, punch-in on the PIN, cut to the question, the race board, the podium. VO a07.
  8  47.5-51.5 Word cloud full-bleed, whip to the bar chart. VO a08.
  9  51.5-56  The certificate slides up like paper from a printer; punch-in on the seal with a stamp hit. VO a09.
  10 56-61.5  The admin dashboard; the camera travels to "Biggest gap · AML & Compliance 38%", then down to the gap-trend chart. VO a10.
  11 61.5-66.5 Three cuts on the claims: the Branding page, the Security page, the phone in a browser frame. VO a11.
  12 66.5-73  The end card: the logo mascot drops onto the Paper ground, the wordmark wipes in, the tagline lands, then the "Try it free — no sign-up" button. Held 3 s. VO a12.
BANNED:  dark void grounds; glow, particles, gradients; three cards in a row; a title over a dimmed screenshot; a docked logo; tilted 3D product UI;
         every element fading and sliding up; titles that drift after landing; repeating the spoken sentence word for word on screen;
         the forest-arena hero art (it resembles another game); localhost URLs on any screen (crop them out).
QA:      t=3 (old way reads as tedious), 10 (brand + phone), 17 (swipe), 25 (second chance), 32 (kit), 39 (comic), 44 (PIN), 49 (cloud), 53 (cert), 58 (gap), 64 (claims), 71 (end card).
