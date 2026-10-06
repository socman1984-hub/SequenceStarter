# What's new

Release notes for Lights Auto Sequencer, newest first. The same list is in the app under **✨ What's new**.

## 2026.10.05.2 — Pan + zoom the preview, and a props-only view you control by clicking

_2026-10-05_

- **New:** Zoom the preview: scroll to zoom in/out on whatever's under the cursor (like a map), or use the − / + buttons next to Line up photo — from 50% to 600%. Click the zoom percentage to reset.
- **New:** Pan around once zoomed in: drag with the middle mouse button, or Shift+scroll to pan sideways.
- **New:** 💡 Props only, next to Pop out: click a prop on the house to select it (Ctrl/⌘-click, or drag a box, to pick more than one), then Props only hides everything else — the house photo and every other prop — and frames just what you picked, centered. Click Full view, or the hint's button, to go back. If you turn it on before picking anything, it fits all your props instead and shows a hint asking you to click one.
- **New:** Thanks to MGXAe for this one: the zoom, panning and Props only view are their contribution!

## 2026.10.05 — Import xLights sequences, Halloween colors and per-part colors

_2026-10-05_

- **New:** Import xLights sequences: File › Import xLights sequence (.xsq) brings in a sequence made in xLights with every effect exactly as it was. Change its lights or colors, mute or remove rows, or add new lights on top; the export gives back everything you didn't change, untouched (checked: a 3,619-effect sequence comes back byte-for-byte the same in xLights).
- **New:** Halloween color schemes: Halloween (orange, purple, green), Orange & purple, Green & purple, Red & orange. They're added to your list even if you've edited your schemes.
- **New:** 🎲 Randomize the whole sequence: a button above the parts that gives every part new lights at once (each part's own 🎲 Randomize still changes just that part).
- **Fixed:** A part's 🎲 Randomize went back to the palette in Idea settings even after you changed that part's colors. A part you recolor (its 🎨, or by editing its rows' colors) now keeps its own colors for new ideas, shown as "own colors" on its card; ✕ goes back to the main palette.
- **Fixed:** The 🎨 color window now opens on the scheme the part last had applied, instead of always the same one.
- **Better:** Props named in French, Spanish, German or Dutch (étoile, sapin, flocon, maison, estrella, Stern, sneeuwvlok…) are now recognized, so ideas use them without adding them by hand.
- **Better:** In the Prop mix, props you added yourself now say "added by you" with a Remove button (the old ✕ looked like the prop was crossed out), and the window explains what to do with props it can't recognize.
- **Better:** Imported sequences look much closer to xLights in the preview: moving settings (value curves), full-size pinwheels, driving snowflakes, pictures from your show folder, rotated, flipped and spinning effects, transparent On and Off, the Average blend, group sizes and row order. On a test sequence, bulbs xLights lights that the preview missed went from 17% to 7%.
- **Fixed:** Color Wash in the preview now goes through its colors once (as xLights does) instead of wrapping back to the first; Shockwave rings use xLights' exact size and width.
- **New:** Imported Shader effects now play in the preview (the .fs files from your show folder, run in the browser), and imported Video effects play the video files from your show folder in step with the song.

## 2026.10.04.5 — Preview fix from the community

_2026-10-04_

- **Fixed:** Props placed outside xLights' preview area are no longer cut off in the preview. Thanks to computergeek1507 for the first community contribution!

## 2026.10.04.4 — Opening projects fix

_2026-10-04_

- **Fixed:** Opening another project while scrolled down looked like it did nothing: the note asking for the project's song was hidden behind the song bar. It now stays in view at the top until you answer it.
- **Better:** "Opened the project" notes clear themselves after a few seconds.

## 2026.10.04.3 — New effects, layered looks and pro techniques

_2026-10-04_

- **New:** Ten new effects: Fan, Ripple, Spirograph, Wave, Meteors, Curtain, Morph, Snowflakes, Strobe, Off (dark) and a Beat meter that flashes or sweeps on every beat or bar. Checked against xLights' own render.
- **New:** Restart every beat or bar: a steady row becomes short effects that turn round or change color each time, the way most pro sequences are built.
- **New:** Masks: a row can be a moving shape that shows the colors of the row under it only where it's lit, or cuts them out.
- **New:** On a group: "Every prop the same" makes every spinner, snowflake or wreath show exactly the same picture (xLights' Overlay).
- **New:** Per row: Fade in / Fade out, Sparkles (optionally with the music), Comes in / Goes (wipe or circle burst), and Spin (the whole picture turns).
- **New:** Pinwheel, Spirals and Bars get xLights' 3D look; pinwheel arms can grow or pulse, spirals can wobble, shockwaves can rise or fall.
- **New:** New triggers: hi-hat hits, the music's hits (note onsets) and each sung note. The export adds a Note Onsets timing track.
- **New:** Parts can now come in with a wipe or a circle burst.
- **Better:** Ideas learned from 56 of the owner's own sequences and three pro ones: chopped rows in lively parts, 3D looks, sparkles, the new effects on the props they suit, fast hits on spinners and snowflakes, masks on the matrix and mega tree, and props made of parts lit part by part.

## 2026.10.04.2 — Older xLights versions

_2026-10-04_

- **New:** The page lists which xLights versions work: show folders from xLights 2021 or newer; saved sequences open in xLights 2023 or newer; moving-head effects need xLights 2024.10 or newer.
- **New:** Export option for xLights older than 2024.10: leave out the moving-head effects.
- **New:** If something goes wrong, a note says so, with Copy details to paste into Discord #bugs.
- **Better:** The show line names your layout's xLights version, and any props that couldn't be read.
- **Fixed:** One prop that can't be read (or an odd submodel or face) no longer stops the whole show from loading; very old layouts with groups in the model list load too.

## 2026.10.04 — Moving heads, a File menu and a pop-out preview

_2026-10-04_

- **New:** Moving heads: a Moving head effect (pattern, size, aim, speed, spread between heads, brightness, colors) that xLights renders with its own Moving Head effect. Tested in an xLights render.
- **New:** Moving heads are drawn in the preview as fixtures with beams that sweep in their color.
- **New:** Moving heads box: choose which parts of the song the heads join, add or re-roll just the heads without touching anything else, and set how big they look in the preview. Each part also has + Moving heads.
- **New:** Ideas and 🎲 Randomize include moving heads: slow, small shapes in quiet parts, big fast ones in loud parts.
- **New:** File menu: open a song or project, recent projects, Save, Save as, Auto-save and Export, like any program. The project's name shows beside it, with a • while there are unsaved changes.
- **New:** ⤓ Export to xLights (Ctrl+E): one dialog to save the .xsq into your show folder or download it.
- **New:** ⧉ Pop out: the preview in its own window, handy on a second screen.
- **New:** Step tracker under the tabs: Song › Words › Your show › Plan the lights › Export, ticking off as you go.
- **New:** What's new (this list) and when the website was last updated.
- **Better:** Matrices get a layered look (a base plus a lighter effect on top), and big singing props like a snow globe get a background with the face on top.
- **Better:** Round props (snowflakes, spinners, wreaths, stars) share each other's moves, and names like "ChromaFlake" count as snowflakes.
- **Better:** Image props are drawn as their picture, glowing in the light's color.
- **Fixed:** Moving heads set to "No Controller" in xLights were skipped by ideas and Randomize.

## 2026.10.03.2 — Tester feedback round: guide, projects, transitions and more

_2026-10-03_

- **New:** How to use guide and a Show me around tour in the app.
- **New:** More prop types in the preview: circles, icicles, candy canes, spinners, wreaths, spheres, multi-point and channel blocks, and older xLights files.
- **New:** Prop types…: tell ideas what a prop is when its name doesn't say.
- **New:** Projects: recent projects to switch between, a projects folder, and Save / Don't save / Cancel before switching. Auto-save.
- **New:** Dark mode (Auto / Light / Dark).
- **New:** 📝 Words on the matrix: put the sung words on your matrix in the parts you choose.
- **New:** Only the part that's playing: the plan shows just the part you hear and follows the song.
- **New:** The control boxes above the plan can be folded and rearranged (unlock the layout first).
- **New:** Each part shows how it comes in (ramp up, sweep in, burst, color hit, crossfade…) and you can change it.
- **New:** Discord link for ideas, bugs and help.
- **Better:** Going into a chorus no longer goes dark and flashes white every time: each lift gets its own transition.
- **Better:** A new start screen, and the controls above the plan grouped into Ideas, Change what's planned and View.
- **Better:** Same look for parts with the same name is off by default, with a clearer explanation.
- **Fixed:** Opening a project kept asking where the MP3 is: now one click (and Chrome/Edge can allow it on every visit).
- **Fixed:** Props that aren't in your show (from another layout, or renamed) are never written into the sequence; a note offers to swap them.
- **Fixed:** Suggest a plan crashed on props whose type couldn't be guessed.

## 2026.10.03.1 — First public version

_2026-10-03_

- **New:** Load an MP3: tempo, beats, bars, song parts, loud and quiet sections and drum hits are found for you.
- **New:** Find the words: voice separation and speech recognition, matched to your lyrics, for singing faces and timing tracks.
- **New:** Open your xLights show folder and watch the plan on a preview of your own house.
- **New:** Suggest a plan and 🎲 Randomize, with feeling, intensity, color schemes, prop mix and props to leave out.
- **New:** Lights that follow the music: louder parts brighter and fuller, the beat on one or two props, build-ups into choruses, and a fit-with-the-music score.
- **New:** Save projects, and export an .xsq for xLights with Beats, Bars, Song Parts and Lyrics timing tracks.
- **New:** Free and open source (GPLv3). Everything runs in your browser; nothing is uploaded.
