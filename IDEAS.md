# Ideas and plans

One running list for the web sequencer. New ideas get added here; when one is built it
moves to **Done** with the date.

## Where things stand (2026-10-10)

- **Name:** *SequenceStarter – a head start on your xLights sequences* (renamed 2026-10-09 from Lights Auto
  Sequencer: another project uses "Auto Sequencer"; repo and site moved to SequenceStarter; the old LightsAutoSequencer repo is a forwarding page).
- **Live:** https://socman1984-hub.github.io/SequenceStarter/ (GitHub Pages, public repo
  `socman1984-hub/SequenceStarter`, GPLv3). Guide: `tutorial.html`. Feedback: Discord
  https://discord.gg/xjgWweqCEs. Posted to the xLights Facebook group; testers active on Discord.
  Outside contributors send pull requests (MGXAe: preview zoom + Props only, computergeek1507:
  preview clipping, jjlauterbach / Jeff Lauterbach: solo/mute on removed rows, PR #5); after a merge on GitHub, pull locally, test, credit in What's new.
- **Everything built is live** (latest release 2026.10.10.2, pushed 2026-10-10): every xLights effect
  and the *🎛 Effects for props* tab; profiles built from a folder of the user's sequences (sequence list,
  prop kinds and single props, Select all / Deselect all); the rename to SequenceStarter with the new
  address and forwarding page; words on the matrix no longer lose lines at part edges; rows show props
  first; Singing face offered on any row for a prop with faces. Guide, tour, README and page notes cover
  all of it. Earlier: xLights sequence import, Halloween schemes, per-part colors, Randomize the whole
  sequence, prop names in 5 languages, render order, Find-words repeats, preview zoom / Props only.
- **Built 2026-10-12 (release 2026.10.12.2):** a 🎲 and ↶ on every light row (Ideas.rowIdea: new effect, settings
  and colors for just that row; ↶ is a per-row history kept outside the plan, Undo works too), a palette box
  from a row's colors (single colors per slot, colors in the part, or a whole palette), and a filter box plus
  a display-only Sort list on parts with 4+ rows. All suggested by Fame28 (Discord).
- **Waiting on testers:** imported videos in a real browser tab (the hidden test browser never
  decodes video frames); the xLights 2023 show folder that crashed (need its
  `xlights_rgbeffects.xml` or the copied error).
- **Needs checking in a real browser:** the pop-out window, Chrome's *Allow on every visit*
  prompt, the native open/save dialogs, imported videos.
- **Needs checking in a real browser:** *Choose…* (show-folder file list) needs a folder opened with
  *Choose show folder…*; the test browser loads the show by URL, so the listing itself is untested. Same
  for the profile builder's *Choose a folder of sequences…* dialog (its reading was tested through the
  folder input).
- **Next up:** the open items in *Lessons from the owner's show folder* and *Lessons from pro sequences*;
  closer previews for the approximated effects (see *Known weak spots*).

## Open ideas

### Waiting for a decision

- **Community effect presets** (tester idea; plan below under *Effect presets*).
- **Erase the owner's first name from the repo's history** (it's gone from the current files;
  two old versions of IDEAS.md still have it). Needs a forced history rewrite; best done before
  more people copy the repo.

### Lights and looks (from the reviews below)

- House style per song (*matched to the prop* or *one picture across the house*).
- Props in a row travel: per-cane / per-arch sweeps, spinners counter-rotating.
- Vocal accents: whole-house hits on the ~9 strongest sung moments.
- Phrase changes every 4 or 8 bars, and a varied last chorus.
- Follow the voice (background dims while singing).
- Colour from the feeling (scheme picked from the song's mood).
- Grow the fit score (matrix share, colour change, vocal accents, phrase variation).
- Moving heads: hits on the beat (dimmer pulses or snaps to a new position), and an option for
  heads that hang upside down (the preview assumes tilt 0 = pointing straight up).

### Lessons from pro sequences (xTreme Sequences study, 2026-10-04)

Studied three xTreme Sequences files the owner bought (Fight Song 2026, A Holly Jolly
Christmas 2024, Toy Sack; 880–1,927 effects each). Their licence forbids copying effects into
other sequences, so only general technique is taken, never settings. What they do that we don't:

1. **Effects on groups, almost never on single props** (62–85% of effects on groups). One
   group effect makes all props of a kind move as one.
2. **Overlay - Centered buffer** on groups (the most used buffer style in all three): every
   prop in the group shows the same pattern, centered on itself. We only write Per Model
   Default / Per Preview.
3. **Groups of prop parts** (Toy Sack): "flake outer legs", "flake centers", "spinner spokes",
   "drum stick left/right" — effects aimed at the same part across every prop of a kind.
   Needs submodel groups; we could build them from submodel names in the layout.
4. **Lots of short hits on spinners and flakes:** Shockwave and On of 0.45–0.9 s, hundreds per
   song (Toy Sack: 849 Shockwaves). Our hit layer is one row per part; theirs is a dense
   rhythm vocabulary on round props.
5. **Fades on almost every effect** (Holly Jolly: 81% fade out, 62% fade in). Ours: only the
   end fade and build-ups.
6. **Masks and reveals on big props**, not just Additive: matrices and mega trees use
   *Unmask*, *Reveals*, *Shadow on*, *Average* (Fight Song matrix: 8 layers, 21% not Normal).
   A shape effect on one layer cuts or reveals the effect under it.
7. **Effects we don't offer:** Fan (in all three, on every prop kind), Spirograph (Toy Sack's
   2nd most used), Ripple, Morph, VU Meter, Warp, Curtain, Shader, Pictures, Kaleidoscope,
   Candle, Wave.
8. **Matrices and mega trees are the busiest props:** matrix 7–8 layers stacked, long effects
   (≈ 23 s) carrying the look while small props do the short hits.
9. **Value curves** mainly in the newest one (Fight Song, 20%): Pinwheel twist, Shockwave
   centre moving, Fan centre moving.

**Status (2026-10-04): built** — 1–7 in part (see Done). Still open from this list: more
effects (Morph, VU Meter, Warp, Curtain, Shader, Kaleidoscope, Candle, Wave), value curves (a
moving Shockwave/Fan centre, twisting Pinwheel), more layers on matrices (they stack 7–8),
Shadow/Average blends. Ripple's preview on spinners is ~1.6× dimmer than xLights.

### Lessons from the owner's show folder (survey of 56 sequences, 2026-10-04)

All `.xsq` in `C:\xLights\Show` except backups and the four made by Claude: 83,676 effects.
Scripts and full reports: `~/.claude/skills/xlights-sequence/reference/survey/technique_survey*.js`,
`report_techniques.txt`, `report_technique_chains.txt`. (The earlier per-prop survey is
`report_effects.txt` there.) What they do that the tool doesn't, biggest first:

1. **Short effects, one per beat.** The four most used effects (chase 28%, shockwave 18%,
   colour wash 12%, on 12%) last about half a second; 34% of them are exactly one beat long,
   and 67% of all effects start exactly on a timing mark. Consecutive chases on a prop **flip
   direction half the time** (ping-pong each beat) and On / Colour wash **change colour 25–40% of
   the time**. Our steady rows are one long effect per part. Idea: a row option *Restart every
   beat / bar* that chops it, alternating direction and/or colour; ideas use it in lively parts.
2. **3D looks are the norm:** Pinwheel 3D 61% (we write None), Spirals 3D 77% (we write off),
   Bars 3D 82% (off), chase fade "From Head" 61%. Switch our defaults (and the preview) to 3D.
3. **Sparkles on the colours:** 15% of effects have palette sparkles, 7.5% music-reactive
   sparkles. A *Sparkles* row option (C_SLIDER_SparkleFrequency / C_CHECKBOX_MusicSparkles).
4. **Effects we don't have, by how many of the 56 songs use them:** Wave 38, VU Meter 36 (mostly
   "Timing Event" pulses and sweeps driven by a timing track), Meteors 33, Pictures 31, Video 35
   (likely matrix-only), Morph 27, Snowflakes 26, Shader 26, Shape 23, Warp 21, Curtain 20,
   Garlands 19, Strobe 17, Galaxy 16. **Off** in 43 songs (a prop deliberately dark ~8 s).
5. **Value curves** on 1 effect in 12: Pinwheel arm size growing (618), Spirals rotation (361),
   Shockwave end width / radius / centre moving (765), Pinwheel twist (207), Curtain rotation,
   chase colour mix. Curve shapes: Ramp, Ramp Up/Down, Sine, Saw Tooth.
6. **Wipe-style transitions** instead of fades at effect edges: Wipe (≈1,200), Circle Explode
   (≈270), Zoom, Fold, Bow Tie, Circular Swirl, Blinds, From Middle, Doorway, Dissolve. A part
   could *come in* with a wipe or circle explode.
7. **Buffer tricks:** rotation / zoom of the buffer (12% have a buffer transform; rotation curves
   spin an effect), blur 5%, *Per Model Single Line* on groups (a chase through each prop as one
   line) 2%, *Layer Star* on stars.
8. **More timing tracks to react to:** Note Onsets (13 songs), Drums, Structure, Flourishes,
   Piano, per-vocal tracks. We have beats / kick / snare / words; a *Melody notes* trigger from
   the vocal-notes analysis would add the "note onsets" style.
9. **Colours:** 54% one colour, 27% two, 15% three — matches what we do. Brightness / contrast /
   saturation adjust on ~5%.
10. **Blends:** 90% Normal; Layered 2%, 2 is Unmask 2%, Average 1.3% (masks are used, rarely).

**Status (2026-10-04): all 8 built** (see Done). Still open: Pictures/Video, Shader, Shape,
Warp, Garlands, Galaxy; blur and zoom; more transition types (Zoom, Fold, Blinds...); Layered
and Average blends; brightness/contrast/saturation adjust. Preview gaps found: Strobe is near
invisible on sparse custom buffers in xLights too (mini trees: 115x368 cells for 100 bulbs),
so ideas only use it on the mega tree and stars; Meteors and chopped chases are random/phase
approximations (brightness 0.7-0.9 of xLights).

### Using the empty space under the preview (wide screens)

The preview column ends where the preview does, while the plan keeps scrolling beside it.
Ideas for that space, roughly in order of usefulness:

1. ~~**Effect grid for the section.**~~ *(built 2026-10-03)* An xLights-style view of the section being played: one
   row per prop or group, a block for each effect over time, a playhead. Click a block to
   open its light row. It's the one view that shows the *whole* section at a glance,
   which the card list can't.
2. ~~**Transport strip.**~~ *(built 2026-10-03)* ⏮ previous section, ⏭ next section, 🔁 loop, playback speed
   (½× to check fast chases, 1×), and the beat number flashing with the beat.
3. **"Now playing" panel.** The sung line (karaoke style) and section name, plus which
   props are lit right now and by which effect; each clickable to its row.
4. **Notes.** A notes box per section ("make this build up more"), saved in the project.
5. **Show filter.** Tick prop types on or off in the preview, to judge one layer of the
   house at a time (preview only).
6. **History.** A list of the last undo steps ("Randomized Chorus 1", "Changed colours"),
   click to go back to one.

**Recommendation:** 1 and 2 first. Together they turn the left column into a mini
xLights: see the section's effects over time and move through the song fast. 3 fits
under them if room remains.

**Status:** 1 and 2 built; 3–6 open. (The pop-out preview from the same list was built
2026-10-04.)

## Making the lights fit the music (review of 2026-10-03)

I played a default *Suggest a plan* for Dusty Bibles (feeling and intensity from the song,
same idea for repeats) and measured the preview frame by frame (3805 frames at 20 fps).

**What it does now:**

| Check | Result | What it means |
|---|---|---|
| Brightness vs loudness | correlation −0.06 | Loud and quiet parts look the same |
| Light change on beats vs between | 1.08× | The beat barely shows |
| Downbeats vs other beats | 1.37× | Bar starts show a little |
| Change at section boundaries | 9–39× the usual | Section changes are clear (good) |
| Singing vs not singing | 0.225 vs 0.215 brightness | The vocals don't show |
| Choruses vs verses | choruses *darker* (0.13 vs 0.27), less lit (33% vs 40%) | Backwards |
| Verse 4 (loud) vs Verse 7 (quiet break) | identical | Repeats ignore energy |
| Busiest part | the Outro | Should be the last chorus |

**Why:** *Same idea for repeats* copies by section name, so all 7 verses get one plan
whatever their energy. Choruses get ~7 beat rows (shockwaves and pulses) that are mostly
dark between hits, while verses get steady *On* and *Twinkle*, so verses read brighter.
Effects on every beat on every prop cancel out: when everything flashes, nothing stands
out.

**Suggestions, in order of payoff:**

1. **Energy drives the plan.** Every section gets a level from its loudness: how many props
   are lit, base brightness, how fast effects move. Choruses always brighter and fuller
   than the verses around them; quiet breaks (like Verse 7) go down to one or two props.
2. **Repeats match by energy, not just name.** *Same idea for repeats* keeps the same
   effects for a repeat but scales them: a loud verse adds props, a quiet one drops them.
3. **One beat layer, the rest steady.** In a section, put the beat on one or two prop types
   (e.g. arches pulse on the beat, mini-trees on the kick) over a steady base (wash, twinkle,
   spirals). Base layer keeps brightness up; the beat layer gives the punch.
4. **Accent the bar.** Big props (house outline, mega tree, matrix) change on downbeats only;
   small props on beats. Gives a two-level rhythm instead of everything at once.
5. **Builds and drops.** The bar or two before a chorus ramps up (brightness rising, chase
   speeding up); the chorus' first downbeat gets a flash on everything; the last chorus is
   the peak, and the ending follows the audio fade (see the endings memory).
6. **Follow the voice.** While singing: faces and matrix words lead, background dims a step;
   between lines, the background comes back. Optionally the mega tree's height follows the
   melody's pitch.
7. **Colour from the feeling.** Pick the colour scheme from the song's mood (and per
   section: warmer and brighter in choruses, cooler and softer in verses) rather than one
   scheme for everything.
8. **Fit check.** Show these numbers in the app (loudness follow, beat sync, chorus vs verse)
   as a small score under *Another idea*. *Suggest* can then try several ideas quietly and
   keep the one that scores best.

**Recommendation:** 1, 2 and 3 together (they fix most of the table), then 5 and 8.

**Status:** 1, 2, 3, 4, 5 and 8 built (2026-10-03, see Done). Open: **6** (follow the voice)
and **7** (colour from the feeling).

**Result on Dusty Bibles**, rendered in xLights and measured with the benchmark from the owner's own
sequences (targets from those finished shows in brackets):

| | old Suggest | new Suggest |
|---|---|---|
| Fit score in the app | 2 | 97-99 |
| Median vs mean brightness (median below mean = room to punch) | 67 > 59 | 39-70 < 58-81 |
| Drum hits that show (≥ 45%) | 15% | 41-46% |
| Brightness follows loudness, r (0.40-0.60) | 0.37 | 0.40-0.43 |
| Dark time (5-10%) | 8% | 1-3% |

Still to watch: dark time is a little low (the house is rarely fully off) and the mean is
brighter than the owner's references; a *Feeling* of Peaceful or a lower *Intensity* brings both
down.

## Second look: from "fits the music" to "looks like the owner's" (review of 2026-10-03)

Watched a fresh default *Suggest* on Dusty Bibles (fit 98, words found) and measured what the
fit score can't see. The timing side is now right: quiet start, build, held breath, flash
into the chorus, whole-house hits, fade at the end. What's missing is taste, and most of it is
already written down in the owner's own notes (sequence-aesthetics, prop feedback, Dusty Bibles
feedback):

| What I saw | Measured | Owner's rule |
|---|---|---|
| Quiet parts are mostly a green block on the matrix | matrix = 63-65% of all light in Verse 1, 1 b, 7; 45% in choruses | Matrix is for content (lyrics in the chorus), not full-field fills; a butterfly there once made a quiet break brighter than the choruses |
| Every part has the same colour mix | red/green/blue ≈ 38/37/25 in every loud part | Tiny palette per part; alternate red and green between verses and bar by bar in a chorus; blue for quiet parts |
| A chorus is 12 props doing 8 different effects | chase, butterfly, bars, wash, marquee, twinkle, pinwheel, on | One house style per song: *shape-matched* for gentle songs (pinwheel on spinners, spirals on tree and canes, shockwave on snowflakes and crosses) or *unified* (one image across props) |
| Canes, spinners, arches run as one group each | "All CandyCanes", "All Spinners" | Group canes were rejected; wants each cane on its own row, sweeps that travel and cross; spinners counter-rotating |
| The voice only moves the faces | 63-100% of each part is sung; no lyrics on the matrix | Lyrics on the matrix in the chorus (the owner's ask); ~9 whole-house hits on the strongest sung moments, the only time the house breaks the beat |
| A part looks the same from start to end | Chorus 2 (23 s): look change start→end 0.14 | Direction or colour flips each phrase; the last chorus varies the detail |

**Suggestions, in order of payoff:**

1. **House style per song.** A *Style* choice next to Feeling: *Matched to the prop* (default
   for gentle songs) or *One picture across the house*. Matched: each prop type gets the effect
   that fits its shape; house = steady texture, yard = rhythm, big props flow, small props
   sparkle. Fewer effect types per part (2-3), shared across props.
2. **Matrix as a screen, not a light.** Lyrics on the matrix in choruses (track already there);
   a slow dim bed otherwise; never a full-brightness fill in quiet parts. Cap its share of the
   show's light (~25%).
3. **Colour story.** One or two colours per part from the scheme: red verses and green verses
   alternating, chorus hits alternating bar by bar, quiet parts in the scheme's cool colour.
4. **Props in a row travel.** Canes, arches, peace stakes, mini trees: each prop its own row,
   chases offset left to right so the light sweeps across the yard (crossing in verses,
   out-and-back in choruses, one direction in the last chorus); spinners counter-rotate. Group
   row kept for the steady base.
5. **Vocal accents.** Find the ~9 strongest sung moments (held notes, phrase peaks from the
   melody) and give each a whole-house shockwave.
6. **Phrase changes.** Every 4 or 8 bars, flip chase direction or swap the colour pair; the last
   chorus gets a variation rather than a copy.
7. **Grow the fit check** with these measures (matrix share, colour change between parts, vocal
   accents, phrase variation), so *Try a few* also prefers ideas that look like the owner's.
8. **Small UI:** the house photo fills only about 3/4 of the preview; the rest is a black band.
   Fit the preview's width to the photo.

**Recommendation:** 1 + 4 together (they change the look most and match the owner's strongest
feedback), then 2 and 3, then 5.

**Owner's addition (2026-10-03):** a long part (a long chorus) should change a little where
its energy changes, automatically, without having to split it.

**Status:** built 2026-10-03: **2** as an option (*Words on the matrix in choruses*), **3**,
**8**, and the owner's addition (see Done). Open: **1**, **4**, **5**, **6**, **7**.

Result on Dusty Bibles (xLights render, benchmark from the owner's sequences): drum hits that show
57% (target ≥ 45%), loudness r 0.48 (owner's 0.40-0.60), median below mean; xLights vs preview
0.98. Dark time is still only 1% (owner's 5-10%).

## Effect presets from the community (open, needs a decision)

Tester idea: let people contribute effect presets per kind of prop, so ideas can use richer
effects than the 13 built in. Neither the owner's show nor the tester's has xLights effect
presets saved, so they'd come as shared packs. Plan:

1. **A preset pack format** (one JSON file): for each preset its name, the kinds of prop it
   suits (snowflake, spinner, wreath, star = "round"; arches, canes = "line"; matrix…), how
   busy it is (calm / medium / busy), whether it's for the whole part or a beat hit, and the
   xLights effect settings copied from xLights (right-click an effect → *Copy*).
2. **Ideas use them**: alongside the built-in effects, weighted by kind of prop and loudness.
   The saved .xsq carries the exact xLights settings, so xLights renders them faithfully.
3. **Preview**: effects the app knows preview exactly; others show an approximation (a
   colour shimmer labelled with the effect's name). That's the main trade-off.
4. **Sharing**: packs posted in Discord or as GitHub pull requests; a *Load preset pack…*
   button; a starter pack built from the owner's own sequences.

## From testers' files (open)

- Layout scenery: picture objects (e.g. "Night Sky.png") and 3D house meshes (`.obj`) in
  xLights' 3D layouts aren't drawn in the preview. Pictures would be easy (placed like the
  photo); a mesh could be drawn as a flat silhouette from the front.
- DMX: moving heads are supported now (2026-10-04). Other DMX fixtures (floods, servos,
  skulls, general DMX) still show as one dot and get no effects.

## Going public (putting it online for everyone)

**Short answer: yes, and cheaply.** Everything runs in the visitor's own browser (analysis,
voice separation, speech model, preview, export), so a public site is just static files:
no server doing work, no song or show uploaded, nearly free hosting.

**Hosting:** a static host that lets us set two response headers (the speech and voice
models need cross-origin isolation): Cloudflare Pages or Netlify (a `_headers` file), or
Vercel (`vercel.json`). GitHub Pages can't set headers, so it would need a workaround. Each
visitor downloads the models (~400 MB) once from Hugging Face / jsDelivr, on their own
bandwidth.

**What has to happen first:**

1. ~~**Model types.**~~ *(done 2026-10-03 except DMX, image and label models)* Only the 10 types in the owner's layout are drawn properly. Others (Icicles,
   Circle, Spinner, Wreath, Sphere, Candy Cane model, DMX, …) fall back to a single dot, so
   other people's previews would look broken. Port the rest from xLights' `src-core/models`.
2. **License.** xLights is GPLv3 and the model geometry here is ported from it; the
   phoneme mapping is Papagayo (GPLv2+). Publish the site's source under GPLv3 (e.g. a
   public GitHub repo). Everything else used (Demucs, Whisper, Transformers.js, ONNX
   Runtime, CMU dictionary) is permissively licensed.
3. **Name.** Don't call it "xLights" or make it look official. "… for xLights" is fine.
4. **Browser support.** Chrome and Edge do everything. Firefox and Safari can't open folders
   (the "pick the two files" fallback works) and the voice models may fall back to slower
   CPU paths. Say so on the page, and test there.
5. ~~**Generalize owner-specific defaults.**~~ *(mostly done 2026-10-03: group-by-members guessing, Prop types…, note on the page)* Idea weights come from the owner's 44 sequences (fine as a
   starting point, but say so); the prop-type guessing relies on group names like "All
   Arches"; check the "not wired to a controller" rule on other layouts.
6. **Test with other shows.** Ask a few xLights users for their `xlights_rgbeffects.xml`;
   check the preview against their xLights and render the exported sequence there.
7. **Remove test-only bits** (`XLWeb.loadUrl`, the `--media`/`--show` server mounts) and
   add a short help/privacy page ("nothing is uploaded").
8. **Optional:** host the models ourselves (Cloudflare R2) if Hugging Face rate-limits
   heavy use; that adds a small bandwidth cost.

**Status (2026-10-04): published.** Live on GitHub Pages (`coi.js` supplies the isolation
headers there; `_headers` / `netlify.toml` cover other hosts), GPLv3 repo, named *Lights Auto
Sequencer* "for xLights", footer and guide say nothing is uploaded. Of the list above: 1 done
except other DMX fixtures; 2, 3 done; 4 said on the page, not yet tested in Firefox/Safari;
5 mostly done; 6 partly done (vendor layouts in the owner's folders, one tester's packaged
show); 7 the test hooks stay on purpose (harmless, used for testing); 8 not needed so far.

## Known weak spots

- **New effects that are approximations** (2026-10-09): the 118 Single Strand FX (WLED) patterns are
  drawn by family (chase, sparkle, fire, flow...) with xLights' measured background and brightness, not
  ported one by one; VU Meter music kinds, Music, Piano and Guitar follow this app's own audio analysis
  (xLights uses its own); Liquid is a simple particle pour (xLights runs a physics engine). Glediator
  and Duplicate show a dim shimmer; Sketch draws its path roughly. Everything else was ported and
  checked against headless xLights (most pixel-exact).

- Section names from detection are rough (verse/chorus guesses); rename them.
- Which beat starts a bar is a best guess; check it with the beat click.
- When the speech model badly mishears a song that repeats a line many times, a lyric
  line can land on the wrong repeat; drag it in the timeline's Lyrics row.
- In the preview, chases and marquees have the right pattern but can be out of step with
  xLights' own render (76–82% of bulbs match overall).
- Not exercised by testing: the browser's native folder picker, *Save into show
  folder*, the native *Save as* / open dialogs for projects, Chrome's *Allow on every visit*,
  and the pop-out window (tested only with a stand-in inside the page).
- Moving heads: the preview's beam direction assumes tilt 0 points straight up; hanging or
  sideways-mounted heads will look different in xLights. Pan/tilt ranges come from each
  fixture's own motor settings in xLights, so degrees in the app match xLights' Moving Head
  effect, not necessarily the real fixture.
- Ideas never put moving heads in a group effect, but a user-made group that mixes heads and
  ordinary props would send ordinary effects to the heads' channels.
- The *Feeling* and *Intensity* settings shape new ideas only; they don't change lights
  already planned.
- The fit score measures brightness, beat and loudness only. It can't judge colour, taste
  or whether a prop suits the moment, so a high score is a good start, not a verdict.

## Done

- **2026-10-10:** *Profiles from the user's own sequences* (requested 2026-10-10). Effects for props tab:
  choose a folder of `.xsq` (File System Access, `webkitdirectory` fallback; backups and this app's own exports
  skipped), `js/profile.js` reads each with regexes (EffectDB, palettes, model / submodel / strand layers), maps
  every effect through `Effects.fromXl` (looks >= 1.2 s by time share, hits by count, < 1% dropped, Off never a
  look), then builds a profile for all or picked prop kinds and optional single props (own grid columns;
  a group uses the column of the prop making up most of it). Up to 16 real option sets per effect are reused
  by ideas 75% of the time (rows, hits, masks, overlays). Profiles are EffectPrefs sets (props, looks, about),
  saved / renamed / deleted / exported. Tested on Christmas 2024 (35 sequences in ~1 s): arches learned chase
  38% / wash 18%; two thirds of planned looks reuse the owner's settings; export renders in xLights with no
  warnings, preview vs xLights r = 0.95.

- **2026-10-09:** *Every xLights effect, and which effects each prop may get* (requested 2026-10-07).
  All 56 xLights effects are in the app (`js/effects-more.js`; settings from xLights' metadata,
  `js/xlmeta.js` via `tools/xlmeta.js`). Previews ported from xLights' render code and checked in a lab
  show (one 48x24 matrix, a 100-light line, a tree) against headless xLights: Plasma, Shimmer,
  Garlands, Tree, Galaxy, Warp (all geometric kinds), Kaleidoscope Square/Radial, Adjust pixel-exact;
  Fill 99.5%, Tendril 95%; random ones (Life, Lightning, Lines, Snowstorm, Fireworks, Circles, Shape,
  Candle) match lit share and brightness. Whole-show test (Sounding Joy, only new effects, 62 props):
  preview vs xLights brightness over time r = 0.94-0.98, total light within 3-8%. The *🎛 Effects for
  props* tab (`js/fxprefs.js`, `js/fxpage.js`): grid of effect weights per prop kind for steady looks
  and hits, built-in *Default* (the old `WEIGHTS` table, now there) and *Every effect*, named saved sets
  in the browser, export / import `.effects.json`, ideas skip prop kinds with nothing on. Decisions
  taken: a tab; numbers (weights) per cell; per prop kind (no per-prop overrides yet); presets and
  file export now. Lessons: on a Normal layer xLights draws with an alpha channel (Snowstorm's
  alpha wraps round for old trail points); xLights' Music effect is stored as "Music Effect"; keys
  that moved in 2026 (Lines_Speed, Garlands_Cycles, Guitar wave factors, Liquid units, Wave's
  Number_Waves) must be written per the sequence's version.

- **2026-10-07:** Words missing on part of *Dom Dolla - Dreamin'* (Discord). Pasted lyrics: 209 words;
  Whisper heard 1,139, but the extra was Whisper looping on vocal chops ("I, I, I", "ha ha",
  "I'm a little bit nervous"), not lyrics. Two passes after alignment in `Vocals.build`:
  `missingRepeats` (sung stretches no line landed on, matched to pasted lines at >= 0.5
  similarity, inserted in time order and re-aligned; none here, guards against hallucinations) and
  a sung-sound filler (a lyric line made only of ah/oh/ooh/yeah... fills every uncovered voiced
  piece >= 0.5 s, one word per vocal onset). Dreamin': 63 "Ah-ah" parts, unworded singing 19 s ->
  7 s of 122 s. Dusty Bibles unchanged (0 added, 96% on onsets).

- **2026-10-05:** Render order (Discord suggestion). xLights renders sequence rows top to bottom and a
  later row draws over earlier ones (RenderEngine wires each row after earlier rows sharing its
  channels). Export now writes every layout group and model (empty if unused), groups first then
  models, each by name (`rowOrder` in sequence.js); imported sequences keep their order. The master
  view is not in xlights_rgbeffects.xml (`<views>` is empty) or networks.xml: it lives in each .xsq.
  Preview composes rows the same way (lit pixels of a later row replace earlier). Checked: new plan
  vs xLights 0.84-1.09 per prop; Storm import round trip still byte-identical.

- **2026-10-05:** Shaders and videos in imported sequences (js/xlmedia.js). Golden had 60% of xLights'
  lit bulbs dark in the preview: Video 57% / Shader 26% of that. Shaders: ISF files run in WebGL2
  with xLights' uniforms (TIME = lead-in + time x Speed/100, RENDERSIZE, XL_OFFSET, XL_ZOOM with
  ZoomFactor, inputs from E_SLIDER_SHADERXYZZY_* / 100, palette colors for color inputs, xl_pow);
  retries with int literals as floats and with non-constant globals moved into main() (GLSL ES).
  All 4 of Golden's compile; house bulbs during them match 57-100%. Videos: <video> per effect,
  plays along while the song plays, seeks otherwise; Starttime, Speed, crop, Manual-and-Loop
  duration. NOT verified here: the in-app test browser is a hidden page, which never decodes
  video frames (always black); ffmpeg shows the frames have content. Check in a real tab.

- **2026-10-05:** Imported-sequence preview fidelity (owner: "missing a lot of stuff"). Measured bulb
  by bulb on *A Christmas Storm* (xLights render vs preview, every 0.5 s): lit-in-xLights-but-dark
  went 17% -> 7%, total mismatches -34%. Fixes: value curves (incl. Custom) on mapped settings;
  Pinwheel ArmSize/Thickness/Rotation/Offset/XC/YC; Snowflakes Driving pattern (two scrolled
  copies, 9 shapes); Pictures from the show folder (`Effects.setPictureLoader`, Show.pictureIn);
  buffer transforms; RotoZoom spin/static rotation; On transparency/cycles; Off Transparent;
  Average blend; group buffers = members' spread scaled to GridSize (Per Preview = unscaled);
  rows render in the sequence's order and a row with an Off covers earlier rows; Color Wash is
  non-circular (also fixes the tool's own washes); Shockwave radius/width per xLights (r/200,
  w/100 of the longer side, palette blend for imported); unknown effects shimmer sparsely; Warp /
  Kaleidoscope draw nothing. Own-plan render check unchanged (0.85-1.02 per prop).
  Still open: Galaxy, Shape, Liquid, Fire, Lines, Shader drawings; Pictures zoom/scroll; chase
  FX modes; the matrix and mega tree remain the least exact.

- **2026-10-05:** Import xLights sequences (owner's choice: keep effects exact). `Sequencer.importXsq`
  turns an .xsq into *imported* rows (trigger `fixed`, effect `xl`) per part / prop / layer /
  effect type, with items {s, e, r, p} indexing `plan.imported.db` / `.pals`; timing tracks,
  version and row order kept in `plan.imported`. Export writes raw settings and palettes, imported
  layers under ours, strands/nodes, original timing XML, version stamp and element order.
  Round trip of *A Christmas Storm 2024* renders byte-identical (before keeping the version, every
  channel differed: xLights migrates old settings by version). Preview via `Effects.fromXl`
  (closest effect + brightness, fades, blend, buffer); ~0.6–0.9 brightness of xLights, faces 0.98.
  Open: preview fidelity for imported effects (value curves, transforms, more settings), an
  "imported" filter/bulk actions, and converting an imported part into editable tool rows.

- **2026-10-05:** Discord feedback round: Halloween schemes (Halloween, Orange & purple, Green &
  purple, Red & orange; new built-ins are merged into saved scheme lists via
  `xlweb-schemes-seen`); a *Randomize the whole sequence* bar above the parts (Suggest for every
  part, ignoring the *For:* choice); bug fix: a part's own colours (`container.scheme` from its 🎨,
  or `container.colors` from hand-edited row colours) now win over the Idea-settings palette for
  its 🎲 Randomize and for whole-plan ideas, shown as an "own colours" chip with ✕.

- **2026-10-04:** Bug: File > Open project "didn't load" when the page was scrolled down. The
  project opened fine; when its song needed a click (permission) or choosing, the banner asking
  for it was scrolled to the top of the page, under the sticky song bar, so it was never seen.
  The banner is now sticky under the song bar; done-notes auto-hide after 8 s.

- **2026-10-04:** Everything from the show-folder survey. Effects Wave, Meteors, Curtain, Morph,
  Snowflakes, Strobe, Off (placed on its own top Normal layer so it hides what is under it) and
  Beat meter (VU Meter *Timing Event Pulse* / *Alternate Timed Sweep* on Beats / Bars / Note
  Onsets). Row options: restart every beat/bar with direction/colour alternation, palette
  sparkles (+ music), in/out Wipe / Circle Explode transitions, Spin (B_SLIDER_Rotations +
  Rotation ramp curve). 3D looks on Pinwheel/Spirals/Bars; value curves (Pinwheel ArmSize,
  Spirals Rotation, Shockwave CenterY). Triggers: hats, onsets, sung notes; Note Onsets timing
  track. Ideas use all of it in his proportions; transitions gain *Wipe in* / *Circle burst in*.
  xLights renders on Dusty Bibles (xLights / preview brightness): curtain 0.98, wave 1.05, off
  0.99, sparkles 1.00, circle-out 0.99, colour-chop 1.00, rising shockwave 0.88, beat-meter
  sweep 0.87, pinwheel 3D grow 1.04, spin + wipe 0.93, meteors 0.87; a full idea plan (4,917
  effects) 0.85-1.02 on most props (matrix 1.37).

- **2026-10-04:** Pro techniques from the xTreme study. New effects Fan, Ripple, Spirograph
  (previews ported from xLights' render code). Row *Mix*: add, mask (*1 is Unmask*) or cut-out
  (*1 is Mask*), done in the preview the way xLights' PixelBuffer mixes. *On a group → Every prop
  the same* writes *Overlay - Centered* (same-size props) or *- Scaled*. Row *Fade in / out* on
  every effect (`softIn` / `softOut`; a straight cut removes them where parts meet). Ideas: round
  props in groups use Overlay; loud parts add kick + snare hits (fan / ripple / shockwave) on
  round props; matrices and mega trees get a mask half the time (butterfly/wash bed + moving
  shape); props with submodels sometimes get per-part rows (numbered submodels merged, e.g.
  snowflake *Level-1..6*, mini tree *Tree Only* / *Star Only*). Checked with xLights renders on
  Dusty Bibles: spirograph 1.00, fan on snowflakes 0.99, mask 0.91, hits 0.91 (xLights /
  preview brightness); a full idea plan (2,985 effects) correlates 0.8–0.93 per prop.

- **2026-10-04:** Older xLights versions. A tester said loading a show from xLights 2023
  crashed. Could not reproduce: seven vendor layouts saved by xLights 2021–2025 and a
  deliberately broken file all load, suggest and export. Made loading forgiving anyway (a prop,
  submodel or face that can't be read is skipped and named in the status line; old layouts with
  groups in the model list load), the preview keeps drawing after an error, and any unexpected
  error shows a note with *Copy details* for Discord #bugs. Supported versions are listed in the
  footer, guide and README; the Export dialog can leave out moving-head effects for xLights before
  2024.10 (the effect was added in 2024.10; 2023 skips it). Still waiting on the tester's
  `xlights_rgbeffects.xml` or copied error to find the real cause.

- **2026-10-04:** ✨ What's new: release notes (`releases.json`, newest first, New / Better /
  Fixed) in a dialog from the header, a dot and a one-time note for returning visitors, and
  "Last updated …" (the newest commit on GitHub) in the dialog and footer. `CHANGELOG.md` is
  built from the same file (`node tools/changelog.js`). **Routine for every push:** add or
  extend the release at the top of `releases.json`, run the script, commit, push.
- **2026-10-04:** Fixed: moving heads set to "No Controller" in xLights (common for DMX with an
  absolute channel, like the owner's) were skipped by ideas and Randomize, though the Moving
  heads box showed. Heads always count now; a part ticked in the box gets the heads even when
  it has its own *Lights to use when randomizing* list.
- **2026-10-04:** *Moving heads* box (only when the show has heads): the parts they join (ideas
  and Randomize only use heads there), *Apply to ticked parts* / *New moving-head ideas* that
  change only the head rows, fixture size and beam length for the preview (smaller default);
  *+ Moving heads* on each part.
- **2026-10-04:** Moving heads: DMX moving heads read from the layout (fixture MHn); a
  *Moving head* effect (pattern, size, aim, rounds, spread between heads, brightness, colours)
  exported as xLights' Moving Head commands, per head ("Per Model" buffer: xLights only runs it
  on a head's own buffer); beams in the preview; ideas/randomizer include them by loudness;
  other effects, brightness and fades never touch heads. Verified with an xLights render of a
  4-head test layout: pan/tilt follow the pattern, colour and dimmer match.
- **2026-10-04:** File menu (open song / project, recent, save, save as, auto-save, export),
  ⤓ Export to xLights dialog replacing the save bar, project name with • for unsaved changes,
  Ctrl+O / Ctrl+E. ⧉ Pop out: the preview in its own window (for a second screen).
- **2026-10-03:** From tester feedback: a step tracker under the tabs (Song › Words (optional)
  › Your show › Plan the lights › Save for xLights) that ticks off, highlights the next step
  and jumps there; *Save* un-ticks when the plan changes after saving. Matrices and other
  screen-like props (dense custom props) get a layered look (base + lighter overlay). Big
  singing-face props (300+ lights, e.g. a snow globe) get a background effect in every part
  under the face. Round props share moves (pinwheel/spirals on snowflakes, spirals on
  spinners, pinwheel on stars). "…flake" names count as snowflakes.
- **2026-10-03:** From a tester's packaged sequence (.xsqz, "Here comes Santa Claus Trap Remix
  LAS Test", their 47-prop 3D layout): no missing props; layout lines up with their photo.
  Added Image props in the preview (the picture, dimmed to its OffBrightness when off,
  glowing in the light's colour when on; WhiteAsAlpha; found by path or by name in the show
  folder). Saved sequences now say "Made with Lights Auto Sequencer".
- **2026-10-03:** "Props cannot be found" reports: a plan (saved per song, or from a project)
  could name props of another layout. If the show loaded after the plan, those names went into
  the .xsq and xLights complained; if before, they were silently deleted. Now they're kept by
  name, left out of the preview and the saved sequence, and a ⚠ note offers *Fix…* (swap each
  for a prop in this show, with a best guess, or leave it out).
- **2026-10-03:** Transitions: every lift no longer goes dark then flashes white. Each lift
  gets a move (ramp up, sweep in, burst, colour hit in the part's colour, crossfade), never
  the same twice running; *build & land* (dark, then flash) only for the single biggest
  lift; big drops crossfade. Cards show "↗ how it comes in"; *Comes in with* changes it
  (tagged rows, so a new choice cleanly replaces the old). New: row fade-in, *Last bar of
  the part* trigger.
- **2026-10-03:** Plan control boxes can be folded (▾) and, once unlocked (*🔒 Layout
  locked*, locked by default), dragged by a ⠿ grip or moved with ↑ ↓; *Reset layout*; all
  remembered. Drag uses pointer events (works with mouse and touch).
- **2026-10-03:** New start screen: twinkling string of lights, "Turn a song into a light
  show", big *Choose a song* / *Open a saved project* buttons, recent projects, three steps,
  a drop glow; shrinks to one line once a song is open. *Save the sequence for xLights* moved
  to the top of *Make a sequence* as a highlighted bar.
- **2026-10-03:** Plan controls grouped: *Ideas* (Suggest + For:, and a foldable *Idea
  settings* with Look / Props / How ideas are made, each option with a one-line
  explanation), *Change what's planned*, *View*. *View → Only the part that's playing*
  shows just the current part, opened, following the song (waits while you type). *Same
  idea for repeats* renamed *Same look for parts with the same name*, off by default.
- **2026-10-03:** *📝 Words on the matrix…*: add the sung words to the matrix in chosen parts
  (choruses by default) on the current plan, with size, colour and dimming of the matrix's
  other lights; remove again; one undo step. (The older checkbox only shapes new ideas.)
- **2026-10-03:** Projects: why opening one always asked for the MP3 (the page remembered the
  song, but the browser only re-allows reading it during a click, and the file box doesn't
  count), now one *Open* click (and *Allow on every visit* in Chrome/Edge stops it asking).
  Projects open through the picker so Save writes back in place; *Projects ▾* switcher
  (recent projects + a projects folder; also on the start screen); Save / Don't save /
  Cancel before switching or loading another song; *Auto-save*; Undo/Redo now count as
  changes. Dark mode: Auto / Light / Dark menu (app and guide).
- **2026-10-03:** Ready for other people's shows (tested on the vendor "Wizards in Winter"
  traditional layout, 155 models, 160 groups):
  - Preview draws circles, icicles (with height and shear, so peak icicles hang straight),
    candy canes, spinners, wreaths, spheres (incl. the pre-version-8 rescale), multi-point and
    channel blocks, plus the older names (Tree 180/360/Flat, Vert/Horiz Matrix) and older
    files that store sizes in parm1/2/3. Arches now stay upright when drawn right to left.
    Still a single dot: DMX fixtures, image and label models.
  - Fixed: a prop whose kind couldn't be guessed crashed *Suggest a plan*.
  - Groups are judged by their members; small "Tree" models count as mini trees; a part of
    a prop ("Snowflake/Outline") belongs to that prop. *Prop types…* overrides any guess.
    On the owner's show the only change: house lines now use *All House Outline* (roofline and
    verticals) instead of *All House Horizontal* (mostly window segments).
  - Page notes that ideas start from one person's style.
- **2026-10-03:** Tutorial: *How to use* page (`tutorial.html`, 11 steps plus questions and
  fixes) and an in-app *Show me around* tour (14 steps that point at the real controls,
  offered once on a first visit; `?tour=1` starts it).
- **2026-10-03:** Randomizing parts of a plan: each section card has a 🎲 tick (blue stripe
  when the next *Another idea* will change it; kept in step with *For:*), and each light row
  has a tick: untick to keep that row (🔒) through *Another idea* and *Randomize*. New
  rows skip props a kept row already covers. (*Copy to…* copies the kept state too.)
- **2026-10-03:** Changes inside long parts: where the next 4 bars are clearly louder or
  quieter than the 4 before (parts of 8+ bars, up to 3 changes), the part becomes phrases.
  Same props and effects, but each phrase lights as much as its own loudness asks, takes the
  next colour turn, and turns moving things round. Light rows get *Bars from / to*. On
  Dusty Bibles the 14-bar Outro splits into red (1-4), a near-chorus green middle with the
  words (5-10) and a quiet blue tail (11-14). *Change with the energy inside long parts*
  (on by default) turns it off.
- **2026-10-03:** Colour plan: each part uses one or two colours. Verses take turns between
  the scheme's first two (red verse, green verse), lifting parts use both with whole-house
  hits changing colour each bar, quiet parts go cool (blue for a red/green scheme).
- **2026-10-03:** *Words on the matrix in choruses* (option): the matrix shows the lyrics in
  lifting parts and is a dim, slow background everywhere else (no beat hits on it).
- **2026-10-03:** The preview shows just the house photo and the lights (no black band beside
  the photo); while lining up the photo it shows the whole area.
- **2026-10-03:** Fixed: the effect grid under the preview changed height from part to part
  while playing, which nudged the preview; it now has a fixed height (scrolls inside when a
  part has many rows), and the changing text lines no longer wrap.

- **2026-10-03:** Lights that fit the music (suggestions 1-5 and 8 above):
  - Every part's loudness sets how many props are lit and how bright (new *Brightness %* per
    light row, written as xLights' Brightness slider).
  - *Same idea for repeats* keeps a kind's effects but scales each repeat by its loudness;
    quiet breaks get their own calm look.
  - One or two prop types carry the beat over a dimmer base (big props on the bar, small on
    the beat); loud parts add a whole-house hit, alternating colours hit by hit.
  - Build-ups (new *When*: last 2 bars of the part), a held breath before a lift (*Hold a
    breath at the end*, 1.5 beats dark), a flash on the first beat (new *When*), the last
    chorus as the peak, and the lights fading with the song's own fade (*Fade at end*).
  - *Fit with the music* score under the plan (follows loudness, on the beat, loud parts
    brighter, per-part table); *Try a few, keep the best fit* makes four ideas and keeps the
    best.
- **2026-10-03:** Fixed: in exported sequences, beat and drum effects sat *under* the steady
  lights in xLights (its layer 0 is the top), so they only showed through dark bulbs. Hits
  now go above the steady rows and add to them; xLights and the preview now agree 0.96-0.996.

- **2026-10-02:** Song analysis (tempo, bars, sections, energy, drum hits) and .xtiming
  export.
- **2026-10-02:** Words and vocals: voice separation, lyrics with timing, mouth shapes,
  melody.
- **2026-10-02:** Hand-editing word timing in the timeline.
- **2026-10-02:** Make a sequence: show folder, house preview, plan editor, .xsq export.
- **2026-10-02:** Own sections (split/join/rename/drag), per-section lights, Copy to…,
  randomize, undo, project files.
- **2026-10-02:** House photo placed the way xLights places it, plus *Line up photo…*.
- **2026-10-02:** *Suggest a plan* for chosen sections only (*For:* menu); plain click on
  the strip moves the playhead, Ctrl+click opens the section.
- **2026-10-03:** *Feeling* (from the song, peaceful, joyful, playful, powerful, magical)
  and *Intensity* (from the song, or very calm … full on) for ideas.
- **2026-10-03:** Colour schemes you can add, edit, rename and delete, with random
  schemes (per scheme or new) and *Back to the default schemes*; saved in the browser and
  in project files.
- **2026-10-03:** Edit while watching:
  1. Preview pinned beside the plan on wide screens, pinned on top (smaller) on narrow
     ones.
  2. *🔁 Loop* per section; *Randomize* loops the section it changed.
  3. Hovering a light row outlines its props on the house; *Solo* / *Mute* per row
     (preview only, the saved sequence keeps everything).
  4. Click a prop on the house: what lights it now, add lights for it or one of its
     groups, or use it for randomizing. Drag a box to pick several props.
  5. Light rows collapse to one line; click to open the settings.
- **2026-10-03:** Projects find their song by themselves (remembered file, music folder or
  show folder); opening a project reports what it is doing in a banner at the top.
- **2026-10-03:** *Leave out of ideas…*: props, groups or parts that Suggest / Another
  idea / Randomize never use.
- **2026-10-03:** Fixed: peace stakes drawn too narrow (cube models use xLights' raw units);
  row arrow not closing settings; jumping to a section hiding it under the pinned preview.
- **2026-10-03:** The show folder used last time reconnects by itself (quietly if the
  browser still allows it, else on opening *Make a sequence*); the panel then shrinks to one
  line with *Choose a different folder…*.
- **2026-10-03:** ⏮ back-to-start button (and Home key) by Play.
- **2026-10-03:** *🎨 Change colours…*: give planned lights a different colour scheme without
  touching effects, for chosen sections, previewed before *Apply*, one undo step.
- **2026-10-03:** *Prop mix…*: per prop (or added prop/group) and per kind of section,
  Never / Less / Normal / More / Always for *Suggest a plan* and *Randomize*.
- **2026-10-03:** Effect grid under the preview (rows of props, effect blocks over the
  section, bar lines, playhead; click a block to open its row, empty space to play from
  there) and a transport strip (prev/next section, play, loop, ½× / ¾× / 1× speed, bar and
  beat counter).
