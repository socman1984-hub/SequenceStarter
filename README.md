# SequenceStarter

A head start on your xLights sequences: turn a song into an [xLights](https://xlights.org) sequence,
right in your browser, then finish it your way in xLights. (Formerly *Lights Auto Sequencer*.) An
independent tool for xLights users; not made by or affiliated with the xLights project.
Everything runs on your own computer: the song and your show folder are never uploaded.

**New to it?** Read [How to use](https://socman1984-hub.github.io/SequenceStarter/tutorial.html)
(`tutorial.html`), or press **Show me around** in the app for a guided tour.

**xLights versions:** show folders from xLights 2021 or newer (tested with layouts saved by
2021–2026 versions). Saved sequences open in xLights 2023 or newer; the Moving Head effect
needs 2024.10 or newer (the Export dialog can leave it out for older versions).

**Ideas, questions, bugs?** Join the [Discord](https://discord.gg/xjgWweqCEs): #suggestions, #bugs, #help, #show-off.

Two tabs:

1. **Song & words**: beats, sections, energy, drum hits, lyrics with timing, melody.
   Word timing can be corrected by hand in the timeline.
2. **Make a sequence**: load your xLights show folder, choose which models, groups or
   submodels light up in each part of the song and on which musical events, watch it in
   a preview of your house, and save a `.xsq` that xLights opens and renders.

## Running it

**Online:** https://socman1984-hub.github.io/SequenceStarter/ (GitHub Pages, from the
`main` branch). GitHub Pages can't send the cross-origin isolation headers the models like,
so `coi.js` adds them through a service worker (one automatic reload on the first visit);
`_headers` / `netlify.toml` do the same on Cloudflare Pages or Netlify.

**On your own computer:**

```
node serve.js
```

then open http://127.0.0.1:8765 in Chrome or Edge and drop an MP3 on the page.

(Opening `index.html` directly still does the beat/section analysis, but finding words needs
the server: the speech and voice models run in module workers and need cross-origin
isolation, which `serve.js` turns on.) For testing, `--media <folder>` and `--show <folder>`
mount a song folder at `/media/` and a show folder at `/show/`.

## What it finds

| Output | How |
|---|---|
| **Tempo + beat grid** | Autocorrelation for a rough tempo, then a circular-concentration fit against the kick drum for precision, with a kick-gap test to fix half/double-time errors. Snaps to a whole BPM when that fits as well. |
| **Downbeats / bars** | Votes from kick vs snare (backbeat), chord changes, and big sound changes, which tend to land on bar lines. Shift it by ear with the beat click (the downbeat clicks higher). |
| **Sections** | Bar-by-bar self-similarity (chroma + timbre), a novelty curve, and boundaries snapped to bars and 4-bar phrases. Repeats are grouped (A/B/C) and named heuristically, so rename them. |
| **Energy** | Loudness level 1–5 per bar, plus a 50 ms loudness curve in the JSON. |
| **Drum hits** | Kick / snare / hi-hat / all onsets from band-limited spectral flux. |
| **Words** *(Find words & vocals)* | See below. |
| **Vocals** | When someone is singing (hysteresis gate on the separated voice) and the melody (YIN pitch tracking → notes like `A3`). |

### Words

1. **Separate the voice** with Demucs (htdemucs ONNX via `demucs-web`, WebGPU). ~40 s for a
   3-minute song on a desktop GPU; the 172 MB model is kept in the browser's Cache Storage.
2. **Transcribe** with Whisper (Transformers.js, word timestamps), fed only the stretches
   where someone is singing, so long instrumentals never reach the model.
   - `whisper-base.en` is the **clock**: its word starts sit on the singing.
   - `whisper-small.en` hears the words far better but starts them 0.2–1 s late, so it is
     only used for the **text**, and only when no lyrics were pasted.
3. **Align** the words (pasted lyrics, or what small heard) to base's timings: edit-distance
   anchors, line-aware gap filling, a snap of every start onto a real vocal onset, and
   guards so no word starts in silence or stays lit across a rest. This is a port of the
   desktop `align.py` with fixes for stray anchors (ad-libs) and missed line openers.
4. **Mouth shapes** from xLights' own CMU dictionary + Preston Blair mapping (`dict/`),
   with numbers spelled out ("2017" → twenty seventeen).

Results (voice stem and transcripts) are cached in IndexedDB per song, so a reopened song
is instant, and pasted lyrics are remembered per song.

Measured on Dusty Bibles against the reviewed lyric track: line starts median 75 ms apart,
77% within 0.25 s, 96% of words starting on a sung syllable, none starting in silence.
Weak spot: when Whisper badly mishears a song that repeats a line many times, a line can
land on the wrong repeat. Fix it in xLights after import.

### Fixing word timing

In the timeline's **Words** row, drag a word's left edge to move its start, or drag the
word to move it; drag a line in the **Lyrics** row to move the whole line. Starts snap to
vocal onsets (Alt places freely). Click a word and use ← → to nudge 10 ms (Shift 50 ms).
Ctrl+Z undoes. Edits are kept per song (keyed by word position + word), survive
"Update words" when the lyrics around them are unchanged, and can be removed in one go.

## Making a sequence

- **Show folder**: picked with the browser's folder picker (Chrome/Edge) and reopened by
  itself on later visits (quietly if the browser still allows reading it, otherwise with one
  OK when you open *Make a sequence*); or pick `xlights_rgbeffects.xml` (+ `xlights_networks.xml`, house photo) as
  files. Only read, unless you press *Save into show folder*.
- **Layout**: `js/show.js` ports xLights' model geometry (Custom, Matrix, Tree, Star,
  Single Line, Poly Line, Arches, Window Frame, Cube). Checked against a real layout:
  every prop lands on the house photo, and node numbering matches xLights exactly
  (channel-by-channel against an xLights render: canes, floods, matrix, snowflakes and
  singing faces 100% / 83–90%).
- **Sections are yours**: split a section at the playhead (from the Sections table or a
  section card), join neighbours, rename, or drag a boundary in the timeline (snaps to
  beats, Alt for free). Once edited, detection never changes them again (*Back to
  detected sections* undoes that). A split part starts with the lights of the part it
  came from.
- **Preview zoom and Props only** (contributed by MGXAe): scroll over the preview to zoom on
  the cursor, or − / + (50–600%, click the percentage to reset); middle-drag or Shift+scroll
  pans. Click props on the house (Ctrl-click or drag a box for several) and *💡 Props only*
  hides the photo and every other prop and frames just those.
- **House photo**: placed the way xLights places it (with *scale image* off it keeps the
  photo's proportions, fills the preview's height, anchored bottom-left; a 4:3 photo on a
  16:9 preview covers the left three-quarters). *Line up photo…* lets you drag, scroll to
  resize (Shift/Alt: width/height only), nudge with arrow keys or type numbers; the
  placement is kept per show and saved in project files.
- **Plan, per section**: every section (plus a *Whole song* layer underneath) has its
  own rows of *lights* (groups, models, submodels) → *when* (the whole time, every beat,
  first beat of a bar, kick, snare, while singing, each line, each word) → *effect* +
  colors + options. Rows read lights first, then the effect. Sung lines, words and notes
  belong to the part holding most of each and play whole (a line sung just before a chorus
  or running over into the next part keeps its words). Sections are collapsible cards; click the strip under the preview to
  play from there, Ctrl+click a part (or use
  *Go to a section*) to jump there and open its card; the playing part is
  highlighted.
- **🎨 Change colors…** (whole plan, or the 🎨 on a section card) swaps only the colors to
  another scheme for the sections you pick; the preview shows it before *Apply*, *Cancel*
  puts the old colors back, Undo works after. It opens on the scheme those parts last got.
  A part recolored this way (or whose row colors were edited by hand) keeps *its own
  colors*: its 🎲 Randomize and whole-plan ideas use them instead of the Idea-settings scheme
  (an "own colors" badge with ✕ goes back). Built-in schemes include Halloween ones
  (Halloween, Orange & purple, Green & purple, Red & orange); new built-ins are added to
  saved scheme lists too.
- **Copy to…** copies a section's lights to any others (quick picks: *All Chorus*, every
  section), replacing or adding. Copies are independent afterwards.
- **Ideas** (`js/ideas.js`): *Suggest a plan* / *Another idea* for every section, or only the
  ones chosen under *For:* (quick picks like *Only Chorus*; the rest keep their lights) (option:
  optionally the same look for every part with the same name), and *Randomize* per section, optionally limited to
  that section's *lights to use*. *🎲 Randomize the whole sequence* (above the parts) does
  every part at once, whatever *For:* says. Which effects each kind of prop may get, and how
  often, comes from the *🎛 Effects for props* tab (`js/fxprefs.js`, `js/fxpage.js`): its
  *Default* set is what the owner's own sequences use on that kind of prop; users change the
  weights, save named sets (kept in the browser, exported / imported as `.effects.json`), and
  ideas skip a kind of prop with nothing switched on. *Profiles* (`js/profile.js`) learn those weights from a
  folder of the user's own `.xsq` files: effect time share per prop kind (looks) and counts of short
  effects (hits, < 1.2 s), for all kinds, picked kinds, or single props (own columns, which groups made
  of them follow), plus up to 16 real setting combinations per effect that ideas reuse 75% of the time.
  Choices are then shifted by the section's energy.
  Undo/Redo (Ctrl+Z / Ctrl+Y on this tab) step back through tries.

### Editing while watching

- Under the preview: a transport strip (previous / next section, play, loop, ½× / ¾× / 1×
  speed, bar and beat counter) and, on wide screens, an **effect grid** for the section
  that is playing: a row per prop or group, a block per effect over time, bar lines and
  the playhead. Hover a block to see it on the house, click it to open its light row,
  click empty space to play from there.

- Wide screens: the preview is pinned on the left, the plan scrolls on the right. Narrow
  screens: a smaller preview stays pinned on top.
- *🔁 Loop* on a section card plays that section over and over (moving the playhead
  elsewhere ends it). *🎲 Randomize* loops the section it changed.
- Light rows show as one line; click to open their settings. Hover a row to outline its
  props on the house. *Solo* / *Mute* change the preview only, never the saved sequence.
- A row's *🎲* gives just its lights a new effect and colors (from the part's palette and the
  effect choices); *↶* takes that row back a step. Clicking a row's colors opens a palette box:
  single colors for the picked color, or a whole palette at once. Parts with 4+ rows get a filter box.
- Click a prop on the house to see what lights it in the playing section, add lights for
  it (or one of its groups), or use it for randomizing. Drag a box to pick several.
- Ideas take a *Feeling* (peaceful, joyful, playful, powerful, magical) and an
  *Intensity* (or both from the song). *Edit color schemes…* adds, edits, removes or
  randomizes schemes, with a way back to the defaults. *Prop mix…* sets, per prop type (or any prop or group you
  add) and per kind of section, whether ideas use it Never / Less / Normal / More / Always.
  *Leave out of ideas…* lists props,
  groups or parts that ideas must never use (a group holding one of them is skipped too);
  clicking a prop on the house can also add it to or take it off that list.
- Ideas follow the music: each part's loudness sets how many props are lit and how bright;
  repeats share effects but scale with their loudness; one or two prop types carry the
  beat over a dimmer base, and loud parts add a whole-house hit. Each lift gets its own
  transition (ramp up, sweep in, burst, color hit or crossfade, never the same twice running;
  the dark-then-flash build & land only for the biggest lift); big drops crossfade. Each part's
  *Comes in with* menu changes it. The lights fade when the song does.
- *Fit with the music* under the plan scores it (0-100): does the house follow loudness,
  does the beat show, are loud parts brighter. *Try 4 ideas, keep the best fit* makes four
  ideas and keeps the best one. Light rows have *Brightness %* and, for steady rows,
  *Fade at end*, *Fade in / out* (every effect), *Mix* (add or mask) and, on groups,
  *On a group*; each part has *Hold a breath at the end*.
- Ideas borrow pro technique (studied from bought sequences; techniques only, no effects
  copied): round props in a group all show the same picture, loud parts give them a fast
  run of short hits on kick and snare, almost every effect fades in or out, matrices and
  mega trees often get a mask (a colorful bed seen through moving blades, spirals or a
  ring), and props built from parts (rings, spokes, star on top) sometimes light each part
  differently, the same part on every prop together.
- Ideas also follow the owner's own sequences (a survey of 56 of them): in lively parts
  steady rows restart every beat or bar, chases turning round and solids changing color;
  3D looks by default; sparkles on about one row in seven; the new effects where he uses
  them (Wave on the mega tree and peace stakes, Curtain on the tree and matrix, beat meters
  on canes and mini trees, Morph and Meteors on lines); a small prop flashing on the sung
  notes or the music's hits; parts that wipe or burst in.
- A long part changes with its energy: where the music gets clearly louder or quieter
  inside it, ideas split it into phrases (same props, more or fewer lit, the other color,
  moving things turned round). Light rows can be limited to *Bars* from / to.
- Colors: each part uses one or two colors; verses take turns (red verse, green verse),
  choruses use both and swap them bar by bar, quiet parts go cool.
- *Words on the matrix in choruses* (option): the lyrics on the matrix in the lifting parts,
  a dim slow background on it everywhere else.
- *📝 Words on the matrix…* adds the words to an existing plan without changing anything
  else: choose the matrix, the parts (choruses ticked to start), text size and color, and
  whether to dim the matrix's other lights there. *Remove from these parts* takes them off.
- *Prop types…* tells ideas what a prop is when its name doesn't say. Without it, a group is
  judged by what most of its members are (so "Everything but starburst" is not a group of
  stars), and a model by its name, then its xLights type. Names are read in English,
  French, Spanish, German and Dutch, accents ignored (étoile, flocon, sapin, estrella,
  Schneeflocke, sneeuwvlok...). In the *Prop mix*, props you added show "added by you" and a
  *Remove* button.
- The control boxes above the plan fold with ▾ and, after *🔒 Layout locked* is clicked to
  unlock, move by dragging the ⠿ grip or with ↑ ↓ (*Reset layout* restores them). Locked by
  default; order and folds are remembered in the browser.
- The 🎲 tick on a section card says whether *Another idea* changes that part (same as the
  *For:* menu). The tick at the start of a light row: untick it to keep that row (🔒) when
  randomizing; new ideas fill in around it.

## Importing xLights sequences

*File › Import xLights sequence (.xsq)* (or drop an `.xsq` on the page, after the show folder is
open) reads a sequence made in xLights. Its song is found from its `mediaFile` name like a
project's. Every effect is kept exactly: its settings and palette strings, layer, submodel or
strand/node, and the file's own timing tracks, version stamp and row order. They become
*imported* rows per part, prop, layer and effect type (rows can change lights and colors, be
muted, duplicated, removed, copied to another part; splitting or joining parts re-homes them by
time). The export writes them back untouched, under anything made here. Checked: *A Christmas
Storm 2024* (3,619 effects, strands, 10 timing tracks) imported and exported renders
byte-identical in xLights. Keeping the version stamp matters: xLights upgrades old settings on
load by it.

The preview draws imported effects with the closest effect here, reading their settings,
value curves, buffer style, transforms, rotation, blends and fades, and composes rows in the
sequence's order. Pictures, videos (`<video>`, kept in step with the song) and shaders (the
ISF `.fs` files run with WebGL2 with xLights' uniforms; `js/xlmedia.js`) load from the show
folder. Every xLights effect has a drawing here (see *Effects* below), read back from its own settings.
Measured bulb by bulb against xLights renders: *A Christmas Storm* 93% of lit bulbs drawn;
*Golden*'s shaders 57–100%. Videos could not be checked in the hidden test browser (it never
decodes frames), only in a normal tab.

## Projects

*Save project* (Ctrl+S) writes `<song>.lightseq.json`: tempo grid, your sections, lyrics
with their timing and hand edits (and the voice timing they need), the whole light plan,
and the song path for xLights. The song itself is not inside, and browsers never reveal a file's folder, so the page
finds it again by itself: through the file handle the browser keeps for that song (when it
was chosen with *choose a file* or dropped, in Chrome/Edge), else by name and size in your
music folder or show folder. Only if all of that fails does a banner at the top ask you to
choose it (or pick your music folder once, so every project looks there). Chrome/Edge save back to the
same file each time (Shift+click *Save project* to save elsewhere); other browsers download
it. The page warns before closing with unsaved changes. Work is also kept in the browser
between visits, but the project file is the copy to trust.
- **Effects** (`js/effects.js`): Solid, Flash-and-fade, Color wash, Chase, Bars,
  Spirals, Pinwheel, Twinkle, Shockwave, Marquee, Butterfly, Fan, Ripple, Spirograph,
  Wave, Meteors, Curtain, Morph, Snowflakes, Strobe, Off, Beat meter (VU Meter timing-event
  flash / sweep on the Beats, Bars or Note Onsets track), Moving head, Singing face (Faces, driven by the Lyrics track; offered on any row whose lights include a prop with a face), Show the words (Text on a
  matrix, driven by the Lyrics track). Each has a browser renderer for the preview and an
  xLights settings string taken from working effects in real sequences (Fan, Ripple and
  Spirograph previews are ports of xLights' own render code). On group rows the buffer is
  written explicitly (*Per Model Default*, *Per Preview*, or *Overlay - Centered / Scaled*
  for "every prop the same"), so xLights draws what the preview shows.
- **The rest of xLights' effects** (`js/effects-more.js`): Plasma, Shimmer, Garlands, Fill, Tree,
  Life, Lightning, Lines, Fire, Candle, Snowstorm, Circles, Galaxy, Fireworks, Shape, Tendril,
  Liquid, Warp, Kaleidoscope, Adjust, Duplicate, VU Meter (music kinds), Music, Piano, Guitar,
  Text, Single Strand Skips and FX (118 WLED patterns), State, DMX, Servo, Sketch, Glediator,
  and Pictures / Video / Shader chosen by hand. Settings use xLights' own keys and defaults
  from its effect metadata (`js/xlmeta.js`, built by `node tools/xlmeta.js <xLights source>`),
  in the form the sequence's xLights version reads (keys that changed in 2026 are written the
  old way for the default 2025.09 version and migrate in newer xLights). Previews are ports of
  xLights' render code, checked effect by effect against headless xLights renders; random
  effects match in look and amount of light, WLED patterns are calibrated from xLights
  measurements, and Liquid (a physics engine in xLights) and the music-following kinds are
  approximations. Warp, Kaleidoscope and Adjust use xLights' Canvas mode (they get the layers
  under them). Piano / Guitar read a *Vocal Notes* timing track (MIDI numbers) that the export
  adds when the words have been found.
- **Rows of the sequence**: every group and model of the layout gets a row (empty if
  unused), as in a sequence started in xLights, in render order: groups first, then models,
  each by name (xLights' "sort: groups at top by name"). xLights renders rows top to bottom
  and a later row draws over earlier ones, so a prop's own effect shows over a group effect;
  the preview composes rows the same way. The master view lives in each `.xsq`, not in the
  show folder files. Imported sequences keep their own order.
- **Layers**: rows on the same lights stack. Upper rows add light (*Additive*), or act as a
  mask (*1 is Unmask*: the shape shows the colors below; *1 is Mask*: the shape cuts them
  out). Rows can fade in and out on every effect.
- **Row extras** (written as xLights' own settings): restart every beat / bar with the
  direction or color changing each time; palette sparkles (optionally music-driven); wipe /
  circle-explode in and out transitions; buffer rotation (*Spin*); 3D looks on Pinwheel,
  Spirals and Bars; value curves for pinwheel arms, spiral twist and a moving shockwave
  centre. Triggers include hi-hats, the music's note onsets and each sung note; the export
  adds a *Note Onsets* timing track.
- **Preview accuracy**: rendering the exported sequence with xLights headless and
  comparing bulb by bulb at four moments, 76–82% of bulbs agree on/off; solids, faces,
  words on the matrix (95–97%) and washes match; chases and marquees have the right
  pattern but can be out of phase. The preview is a guide; xLights' render is the truth.


**Switching and auto-save.** Projects open through the browser's file picker, so *Save*
writes back to the same file. The *File* menu lists recent projects (kept as file handles in
the browser) and everything in a chosen projects folder; switching with unsaved changes asks
Save / Don't save / Cancel. *Auto-save* saves 1.5 s after each change (Chrome/Edge). When the
browser wants permission to read a remembered song again, a note offers one **Open** click
instead of browsing (Chrome/Edge also offer *Allow on every visit*). The theme menu at the top
right switches Auto / Light / Dark.

## Exports

- **.xtiming**: imports into xLights (timing track header → Import Timing Tracks). Pick the
  snap that matches the sequence's frame time; xLights rounds non-aligned marks down.
  The **Lyrics** track has three layers (lines / words / mouth shapes), which is what the
  Faces effect and the Text effect's lyric mode read.
- **.analysis.json**: everything, including the pitch curve, for the next steps.

Everything runs on this computer; the song is never uploaded. Models download from the
Hugging Face hub and libraries from jsDelivr the first time.

## Checked against known songs

| Song | Detected | Known |
|---|---|---|
| Dusty Bibles | 103.00 | 103 |
| No Fear | 94.00 | 94 |
| Home in My Heart | 160.00 | 160 |
| Gonna Be Alright | 76.00 (halved from 152) | 76 |

The browser's MP3 decode lines up sample-for-sample with FFmpeg (which xLights uses), so
exported marks line up with the audio in xLights.

## Files
- `js/analysis.js`: beat/section/energy analysis (no DOM)
- `js/vocals.js`: voice separation, transcription, alignment, phonemes, melody
- `js/workers/separate.js`, `js/workers/transcribe.js`: the two models, off the main thread
- `js/app.js`: page, timeline, playback and beat click, word-timing edits, timing export
- `js/show.js`: show folder access, rgbeffects parsing, model geometry, row targets
- `js/effects.js`: effect library (preview renderer + xLights settings) and color schemes
- `js/xlmedia.js`: imported Shader (WebGL2) and Video effects for the preview
- `js/sequence.js`: plan → timed effects, preview frame renderer, `.xsq` writer
- `js/ideas.js`: random-but-sensible light ideas for a section or the whole song
- `js/sequi.js`: the "Make a sequence" tab (show, preview, section cards, picker, copy, undo, saving)
- `dict/`: phoneme dictionaries copied from xLights (`resources/dictionaries`)
- `serve.js`: local server with the headers the models need

From the console, `XLWeb.loadUrl('/media/song.mp3')` loads a song by URL.

## License

GNU General Public License v3.0 or later (see `LICENSE`). The prop geometry in the preview
is ported from xLights (`src-core/models`, GPLv3) and the mouth-shape mapping follows
Papagayo (GPLv2 or later).

### Third-party pieces

Loaded at run time (not stored in this repository unless noted):

| Piece | Used for | License |
|---|---|---|
| [Transformers.js](https://github.com/huggingface/transformers.js) | runs the speech model | Apache 2.0 |
| [Whisper](https://github.com/openai/whisper) (base.en, small.en) | finding the words | MIT |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | runs the voice separator | MIT |
| [Demucs](https://github.com/facebookresearch/demucs) via demucs-web | separating the voice | MIT |
| [CMU Pronouncing Dictionary](http://www.speech.cs.cmu.edu/cgi-bin/cmudict) (in `dict/`) | word sounds for the singing faces | BSD-style |
