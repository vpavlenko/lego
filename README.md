# Insights Roadmaps

A static digital reader for all 242 roadmap screenshots in Bob Keller's
`InsightsRoadmapsConsolidated.pdf` (revision 1, 6 October 2011).

Run `python3 -m http.server 5187 --directory dist` and open
`http://localhost:5187`. The checked-in static output serves directly. To rebuild it, run `npm ci` and
`npm run build`. React and its renderer are bundled; Web Audio uses the included
SpessaSynth runtime and licensed GeneralUser GS piano samples.
Run `npm run check` for roadmap, MIDI round-trip, chord-vocabulary, transport,
React/DOM integration, geometry, and brick-index checks.

## Reader behavior

- Each song's home tonic is transposed to C; major/minor quality and internal
  modulations remain intact. Home keys for ambiguous multi-key tunes are explicit
  in `scripts/build-data.py`; other home keys follow the source roadmap's dominant
  tonal region, rather than an often unset leadsheet key-signature field.
- Chord roots and slash basses transpose together, with diatonic spelling preserved.
- Roman numerals appear below chords and follow the active Rawl tonic from each
  modulation onset. Minor chords use lowercase numerals.
- Every source join starts a Rawl modulation: an onset-anchored fading flag,
  Lucide up/down arrow, semitone shift, and new tonic. Zero joins are retained as
  up-arrow 0; tritones use up-arrow 6. Notes, tonal guides, chord bands and RN
  share one tonic timeline, including changes carried across row breaks.
  Original join names remain in the source data and marker metadata.
- Hash routes identify individual analyses. Search matches song and brick names.
- Source view retains the exact original image; PDF links target its source page.
- JSON exports contain the selected analysis transposed to C.

## Playable standards and brick pages

The default Rawl view realizes the source chord chart as root-position piano
chords in one voice. It does not add a melody or claim an original
performance. Every fully legible chord uses the spelling/aliases from the pinned
Impro-Visor `vocab/My.voc`; `scripts/chord-vocabulary.py` extracts the vocabulary.
Eight clipped chord cells remain marked rests, preserving their original times.
Each chord has one simultaneous instance of each declared pitch class, packed
within an octave above its root (C3–B3 for the root). There is no voice-leading
optimization. A distinct slash pitch is included once in the same stack; the
root remains lowest, including for slash chords. MIDI exports and playback share the same notes,
quarter-note timing, and meter. Default tempo is an audition setting, 120 BPM;
changing BPM updates playback and MIDI downloads.

Play/Pause, Stop, seek, voice mute, and tempo controls use a sample-backed piano.
Click a note to audition it; click the score background to seek. Page changes
cancel pending initialization and stop playback. SoundFont assets are copied
from the existing Caplin runtime with licenses; no original recordings or book
PDF content is included.

`packages/rawl-notation` is a host-independent React component, ready for later
extraction into a separate repository. It accepts MIDI note events, row bounds,
key changes, render callbacks, and playback position. It uses Caplin's 3 px pitch
axis and 5 px notes, Rawl's colors/corner shapes, and row-local held-note ranges.
The host owns audio, routing, realization, and download controls.

`#bricks` lists 315 canonical brick identities from the 354 source labels. Each
`#brick/<slug>` page lists every matching standard and its exact source passages.
Brick links in both score views are reciprocal. Passage links open the standard
at that beat and highlight its brick label. These are matches in the PDF's
242 analyses, not fresh analyses of the larger Impro-Visor corpus. A reviewed
alias table combines 39 typographic variants. Ambiguous stems and hidden semantic
extensions remain distinct. Raw labels remain unchanged in `roadmaps.json` and
each indexed passage; old abbreviated page addresses resolve to their canonical
page. Search accepts both the canonical and abbreviated names.

## Colors

Rawl's exact 12-color `RAWL_COLORS` palette and foreground contrast are reused
from `~/repos/rawl/src/components/rawl/colors.ts`. Musical badges use the palette
background and its contrasting foreground, including distinguishing dots for
chromatic degrees 1 and 6. Interface controls, branding, focus, selection, and
source-clipping indicators are grayscale.

Chord roots, Roman numerals and Rawl notes share the active modulation reference.
The song itself remains transposed to its home tonic C. Flags use the signed shift modulo 12:
up 2 uses degree 2 (red), while down 2 uses degree 10 (orange). Source view and
PDF downloads retain the original source documents.

## Sources and fidelity

The PDF screenshots are authoritative for chord changes, brick labels, keys, join
locations, and layout. Current Impro-Visor parsing is not substituted for the
saved 2011 analyses. The accompanying book was read locally for conceptual context only. The book
PDF is excluded from source synchronization and deployment at the user's request;
only the Impro-Visor roadmap PDF and its screenshots are included.

The matching local Impro-Visor checkout is commit
`550bbb554962249aceb0e82a72142e3e5b3c0d4a` from
https://github.com/Impro-Visor/Impro-Visor. Its Insights and imaginary-book
leadsheets supply cross-checks and attributed composer/meter metadata.

The extraction uses pixel grid geometry, independent Tesseract and macOS Vision
OCR passes, recurring chord-glyph comparisons, and source key-color checks.
`evidence/extraction.json` retains each source rectangle, OCR readings, and chosen
value. `evidence/corpus-check.json` records corpus comparisons and tonic choices.
Those scores are comparisons, not a claim of a manual note-by-note proof.

Eight chord cells already contain clipped labels in the source screenshots.
Their visible prefixes and ellipses are retained, marked with a dotted underline, and
linked to the original image. Some brick names are likewise truncated in the
source. They are preserved rather than completed with guessed analyses.

Continuation strips at row breaks inherit the preceding labelled key and brick.
Unused grey cells are excluded. Source spelling and older analysis anomalies
remain available in the original images.

## Reproducing the extraction

The offline scripts expect the original workspace arrangement: this directory,
its sibling `Impro-Visor/`, both source PDFs, and `impro-visor-bricks.json` in the
parent directory. They use `tmp/` in that parent for intermediate files.
Dependencies are Python with Pillow and NumPy, Poppler, Tesseract, and macOS
Vision for `ocr.m`. The published app uses only the checked-in static data.

1. Extract source images with `pdfimages -png`.
2. Compile/run `scripts/ocr.m` against the extracted images for Vision readings.
3. Run `scripts/extract.py`, then `scripts/recognize.py` for the two cell OCR passes.
4. Run `scripts/corpus.py`, `scripts/digitize.py`, and `scripts/build-data.py`.
5. Run `node scripts/check.mjs` and inspect the reader against Source view.

Geologica is reused from the user's CompGeom site with its OFL license.
Lucide arrow paths are from lucide-react 1.17.0, ISC-licensed; the original path
modules and license are included under `dist/icons/`.

Brick detail pages start with a playable, MIDI-downloadable example taken from the longest fully legible matching roadmap passage, transposed to the local brick tonic C. Its source link returns to the exact passage. All 315 canonical brick identities have examples. These are source passages, not expansions from the brick dictionary.

Active and hovered Rawl notes double their height upward with the bottom edge fixed, following Rawl’s `getNoteRectangles.tsx`; playback adds no outline or brightness change. Only the note copy in the current row responds to playback. Muted voices collapse to 0.5 px.

For the one selected example with no overlapping key label (Diatonic I ii iii biii in Polkadots and Moonbeams), the original standard tonic provides the transposition reference. Source key labels are otherwise retained.

The join-key lookup uses the region covering the join onset, including joins within an unchanged key region. This corrects 90 previously forward-looking tonic pairs. Key changes without a join remain on the same shared timeline. Rawl flag geometry follows `AnalysisGrid.tsx` `NewTonicSymbol`: an 80 × 12 px gradient mask anchored at onset, with white interval/tonic text offset beside the measure number.

Typography aliases are explicit in `src/music/brick-aliases.mjs`; `evidence/brick-aliases.json` records the merged groups and counts. Impro-Visor `RoadMapSettings.trimString` and `GraphicBrick` shorten labels to fit pixels. Visible `+` modifiers are retained; an unknown `+...` extension is not equated with a base brick or a guessed Overrun/Dropback. Minor Dropback combines four shortened spellings into one page with nine unique standards and eleven source passages.
