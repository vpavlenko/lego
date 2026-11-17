# Insights Roadmaps

Public reader: https://insights-roadmaps.cxielamiko.chatgpt.site

The reader preserves all 242 analyses from Bob Keller's
`InsightsRoadmapsConsolidated.pdf` (revision 1, 6 October 2011), and adds 118 sourced
arrangements. There are 269 standards in the drawer and 360 charts.

## Run and verify

```
npm ci
npm run build
npm run check
python3 -m http.server 5187 --directory dist
```

The checked-in `dist/` serves directly. React, SpessaSynth and licensed
GeneralUser GS piano/alto-sax subsets are included. No account is required.
The existing Sites identity is retained in `.openai/hosting.json`.

## Musical rendering

- Every chart's home tonic is transposed to C; major/minor and internal key
  changes are retained. Slash bass and chord roots transpose together.
- Chords use simultaneous root-position notes in one piano voice. The root
  starts in C3–B3; 9ths, 11ths and 13ths stay above the seventh. An explicitly
  written slash bass sits below the complete root-starting chord.
- Rawl notation uses the existing Rawl palette, shapes and modulation flags,
  with Caplin's 3px pitch axis and 5px notes. Active and hovered notes double
  upward with their bottom edge fixed. There is no vertical playback cursor.
- Join flags show Lucide up/down arrows and signed semitone shifts, followed by
  the new tonic. Zero shifts remain in the tonic timeline but have no marker.
  Measure numbers remain above flags; arrows follow their actual digit width.
- The transparent harmony stripe shows chords by default. Hovering any stripe
  shows Roman numerals everywhere through fixed overlay cells, without reflow.
  Notes, chord/RN symbols and flags share the active tonic reference. Interface
  colors are grayscale; color is reserved for musical degrees and shifts.
- Playback, note highlighting and MIDI use the same event timing. Highlighting
  follows Caplin's output-aware audible clock, including render-ahead and device
  latency. Seek, tempo changes, voice muting and route changes cancel stale work.

`packages/rawl-notation/` is a host-independent React component. It accepts MIDI
note events, row spans, tonic changes and render/interaction callbacks; the host
owns audio, harmony realization, routing and export. It can be extracted later.

## Melodies and arrangements

`dist/data/melodies.json` contains 131 imported lead melodies (16,456 notes), and
`dist/melodies/` contains 131 GM65 MIDI files. The source is the MusicXML RealBook
in [PSjazzEval](https://github.com/florento/PSjazzEval), pinned to
`b6a559e8bd2719c3279ed0e81554b5cdbab0da03`. Per-file URLs, hashes, source rights,
selection decisions, repeats, ties, rests, pickups and malformed source measures
are recorded in the manifest and `evidence/melody-import-audit.json`.

The importer selects the primary melody staff/voice, excluding auxiliary bass
and harmonized voices. Source onsets and durations are retained. Four titles
without a source meter are excluded; uncertain tonics, unresolved repeats,
pickups or malformed bar grids are not silently repaired to fit a roadmap.
The downloaded archive contains 135 distinct titles, rather than the larger
count advertised by the upstream project.

The initial PSjazzEval import enabled 31 playable melody charts. The Girl from Ipanema matches its existing
roadmap by exact quarter-beat chord-root boundaries under one constant
transposition. Thirty further charts use their own same-source MusicXML changes
and melody. Eight are separate RealBook arrangements, selectable beside the
standard title, because their changes or lengths differ from the roadmap.
Switching arrangements switches the entire chart, source and MIDI.

The footer's Melody control persists across the website and controls both
notation visibility and the separate alto-sax voice. Piano and melody use MIDI
channels 0 and 1, programs 0 and 65. Standard exports contain both tracks when a
melody exists. The sax subset was compared with its licensed full-bank source
in nine offline audio renders; this does not claim a hardware listening test.

To reproduce imports, extract upstream MusicXML files to a local directory,
then run:

```
python3 scripts/import-melodies.py --source-dir /path/to/PSjazzEval
node scripts/import-melodies.mjs
node scripts/import-standards.mjs
npm run build
```

The importer retains upstream per-score rights and does not declare the
underlying compositions public domain. No downloaded score PDFs are shipped.

## Reusable bricks

`bricks.html` is the single grouped catalogue, with the same top navigation as
standards and no left drawer. Its 117 learner families are grouped into 11
Impro-Visor brick types. Each group is a column. Complete previews keep 100px
measures on one continuous line; groups/cards use natural widths and wrap only
between complete examples. Oversize examples scroll horizontally.

Each brick page groups standards under their exact structural variants, with
1,218 complete definitions and eight unresolved occurrences. Simple core forms
come first, the same added-chord families stay adjacent, and substitutions,
qualities, explicit bass and rhythm determine neighboring variants. There are
Lucide play buttons beside examples; no variant-number rows, source captions or
MIDI buttons. Usage lists contain comma-separated title links without measure references.
Rawl rendition links appear only in standard headers, never inline in brick
usage lists. Initial C labels are omitted in brick previews.

The data pipeline has separate source and learner layers:

1. `roadmaps.json` retains every original label, chord, key, join and position.
   Explicit typography corrections group 354 labels into 299 source identities.
   The additional charts bring the source index to 334 identities.
2. `brick-families.mjs` combines named Approach/Cadence/Launcher roles and
   terminal adjuncts, then repetition wrappers such as Two Goes and guarded
   length/tempo qualifiers. Mode, degree and destination remain meaningful.
3. `brick-coverage.mjs` removes 1,607 row spans: 1,200 one-harmony spans and 407
   On/Off or Off/On spans. Harmony and modulation stay in the charts unbricked.
4. `brick-reuse.mjs` reviews the 37 families used by one distinct standard.
   Nine merge into a supported harmonic variant; twenty-eight are removed, taking 50
   further labels out of the chart. All 117 remaining families are reused.

Singleton matches require complete source material, ordered tonic-relative
root/core-quality anchors, support in at least two target standards, limited
structural distance and an unambiguous best family. Repeated occurrences in one
standard do not count as independent reuse. Full qualities, compound extensions,
explicit bass, key context and rational durations remain in variant definitions.
Ambiguous and idiosyncratic labels are removed without deleting their chords.
The final index accounts for 4,588 retained row spans. Surviving/merged legacy
page routes and search aliases are preserved.

`evidence/brick-reuse-audit.json` records every singleton decision with source
positions and compared structures. `one-chord-bricks.json`,
`brick-families-audit.json` and generated `runtime-projection.json` record the
other projection stages and musical-data preservation fingerprint.

## Additional parsing

`brick-parser.mjs` reuses the inspected Impro-Visor dictionary: 554 definitions,
nested named rules, relative transposition, chord equivalence families and
relative duration constraints. It uses minimum-cost segmentation and rejects
Impro-Visor's expensive non-scaling fallback. Unexplained changes stay unbricked.

The initial thirty PSjazzEval charts introduce eighteen existing dictionary names absent from
the original roadmap labels. Three recur in at least three compositions:
7sus4 to 3, Dominant Cycle 2 Steps and Dogleg Approach. No previously unnamed
uncovered pattern met the minimum three-composition reuse rule; no new brick
name was fabricated. `evidence/brick-parsing-audit.json` records every analysis.

## Structure and layout

The compact standards drawer groups blues, rhythm-like forms, AABA and other
structures without standard numbers. Within AABA, the B key / A brick selector
provides exclusive subgroups. It computes representatives on the complete
catalogue before applying search and persists the selected grouping.

Repeated A sections align on the left; contrasting material extends right.
All six former ABCA results were reviewed: Bemsha Swing, I Wish You Love and
Yours Is My Heart Alone align as AABA variations; three contrasting cases retain
ABCA. Form labels inferred from chords remain provisional.

Source-reviewed boundaries preserve A House is Not a Home's 38 bars
(10+10+8+10) and Ipanema's forty bars (8+8+16+8). Five charts, including Gone
With the Wind, additionally align repeated brick-sized halves of formal A
sections. Display subphrases are separate from formal section metadata.
Short unaligned rows retain proportional widths rather than stretching every
row. Thirty-six unequal-row charts were audited against encoded changes;
source-version and chord-quality differences are preserved.

The standard title sits above its content pane. Analysis/Rawl/Source and
playback controls are in the footer, which stays at or below the bottom of the
first viewport. The transparent ii⁷ favicon has an upward Rawl degree2–4–6 gradient.

## Source fidelity and licenses

The original PDF screenshots remain authoritative for the 2011 roadmaps.
`evidence/extraction.json`, `corpus-check.json`, `typography-audit.json` and
`measure-timing-audit.json` retain extraction and comparison evidence. Eight
source-clipped chord cells remain timed silent gaps. Explicit NC cells and harmony gaps in
new arrangements also remain silent, without interrupting melody.

The inspected [Impro-Visor source](https://github.com/Impro-Visor/Impro-Visor)
is commit `550bbb554962249aceb0e82a72142e3e5b3c0d4a`. Its saved 2011 analyses are
not replaced by a fresh parser. Source PDF/image views remain available, and
new arrangements link to their actual MusicXML sources.

The accompanying **Insights in Jazz.pdf** was used locally for context only.
It is excluded from source synchronization and deployment. Only the supplied
Impro-Visor roadmap PDF and its extracted screenshots are included.

Geologica retains its OFL license. Lucide icons retain their ISC license under
`dist/icons/`. Rawl and GeneralUser GS license/provenance files ship alongside
the corresponding code and assets. There are 69 verified public Rawl renditions
across 34 original standards, recorded in `src/music/rawl-links.json`; no missing
rendition URLs are guessed.


## Expanded melody sources and current interactions

The combined registry `dist/data/melody-sources.json` contains 219 encoded heads:
131 PSjazzEval melodies, 79 validated OpenBook arrangements and nine explicit
Impro-Visor Head parts. There are 119 melody-enabled charts. The original 30
PSjazzEval chart addresses242–271 are retained; new arrangements append after
them. `scripts/merge-melody-sources.mjs` combines validated sources without
changing existing addresses. `evidence/melody-source-intake.json` records intake.

OpenBook is pinned to `adbe5c68ff59e20068dd754e7d227979fa628d33` at
https://github.com/veltzer/book-openbook. Actual LilyPond2.26 compilation unfolds
repeats, ties and tuplets and checks the MIDI against source chord pitches.
Omitted repeated chord labels continue their explicit preceding harmony; source
rests remain unharmonized. Pickups, unresolved textual D.C./Coda and uncertain
key/mode cases are excluded. The repository README and current license disagree;
both notices and per-song copyright are retained in the source manifest.

Body and Soul is available as **OpenBook Real**, chart286:32bars,129 melody
notes, explicit Db-major source transposed to C. Its changes differ from the
roadmap, so it is a separate complete arrangement. The Impro-Visor source files
for this tune contain rests, a placeholder or a Hawkins solo; none is presented
as the head. Only explicitly labeled Head parts are imported from that corpus.
`openbook-melody-audit.json` and `improvisor-melody-audit.json` retain the evidence.

A standard's header has a synchronized play/pause icon instead of the counter
and previous/next arrows. Melody notes draw above chord notes. Superscript
extensions and alterations use the represented sounding pitch relative to the
active tonic, following Caplin's semantic color rule. 11/13 remain whole jazz
extension tokens. Slash characters are gray and explicit bass symbols have
their own degree color in both chord and RN views.

Click a Rawl measure number, hover a note to preview its pitch class as tonic,
and click a note to commit. Leaving restores saved colors; Escape cancels the
selection. Notes, tonic/fifth guides, flags and chord/RN colors share the preview.
This is guest-state analysis in the current chart, matching Rawl's local behavior;
source data, MIDI pitches and playback position are unchanged.

The tonal display merges395 one-harmony modulation regions into their preceding
or following context. All34 weak/tied passages were reviewed individually;
17 decisions override the automatic score. The49 initial C home contexts remain.
`modulation-regions-audit.json` and generated `modulation-projection.json` retain
both alternatives, guarded musical rationales and source/cleaned timelines.

The catalogue and brick drawer share the same type groups and descending usage
order within each group. Counts deduplicate alternate arrangements of the same
standard. A group index at the catalogue top jumps to each section. Catalogue
previews select the variant found in most distinct standards, then most passages,
then existing semantic order. Brick-to-standard title links scroll to and pulse
the matching passage while playback remains at the beginning.

Longer primitive repeated phrases are aligned generally rather than accepting
printed row breaks as musical structure.29 charts receive longer phrase grouping;
Love for Sale displays0–16 A /16–32 A +32–48 B. Existing fine brick-sized layouts
remain. Formal metadata and every source event time stay intact. Section letters
are enclosed in square boxes. `general-section-layout.json` records every case.


Measure grids use the Rawl AnalysisGrid Measure and NewTonicSymbol source at
Rawl commit73fe6ab. Rawl and Analysis share one React header component: full-height
1px bars, brighter phrase-start bars, 12px sans-serif measure numbers offset6px
from the measure boundary and−4px vertically, and80×12px fading modulation flags.
The original Lucide join arrows and interactive tonic recoloring remain.

Every arrangement has an explicit quarter-beat phrase grid in forms.json.
Four measures are the default, independent of printed rows, bricks and modulations.
The source-audited10+10+8+10 House arrangement resets its grid at each section;
Blue and Sentimental retains its expanded ending. The audit records uncertain
final remainders instead of assigning unsupported irregular phrase analyses.
See evidence/phrase-grid-audit.json and evidence/rawl-phrase-sources.json. The
69 linked Rawl renditions were checked against their public encoded measure grids;
none has verified exact arrangement alignment, so their phrase patches are kept
as references. The source research follows https://rawl.rocks/s/hypermeter/.
