# Insights Roadmaps

Public reader: https://insights-roadmaps.cxielamiko.chatgpt.site

The reader preserves all 242 analyses from Bob Keller's
`InsightsRoadmapsConsolidated.pdf` (revision 1, 6 October 2011), and adds 30
MusicXML arrangements: 22 additional standards and eight alternatives to existing
roadmaps. There are 264 entries in the standards drawer and 272 charts.

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

There are 31 playable melody charts. The Girl from Ipanema matches its existing
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
standards and no left drawer. Its 99 learner families are grouped into 11
Impro-Visor brick types. Each group is a column. Complete previews keep 100px
measures on one continuous line; groups/cards use natural widths and wrap only
between complete examples. Oversize examples scroll horizontally.

Each brick page groups standards under their exact structural variants, with
919 complete definitions and eight unresolved occurrences. Simple core forms
come first, the same added-chord families stay adjacent, and substitutions,
qualities, explicit bass and rhythm determine neighboring variants. There are
Lucide play buttons beside examples; no variant-number rows, source captions or
MIDI buttons. Usage lists are comma-separated titles followed by measure links.
Rawl rendition links appear only in standard headers, never inline in brick
usage lists. Initial C labels are omitted in brick previews.

The data pipeline has separate source and learner layers:

1. `roadmaps.json` retains every original label, chord, key, join and position.
   Explicit typography corrections group 354 labels into 299 source identities.
   The additional charts bring the source index to 317 identities.
2. `brick-families.mjs` combines named Approach/Cadence/Launcher roles and
   terminal adjuncts, then repetition wrappers such as Two Goes and guarded
   length/tempo qualifiers. Mode, degree and destination remain meaningful.
3. `brick-coverage.mjs` removes 952 row spans: 694 one-harmony spans and 258
   On/Off or Off/On spans. Harmony and modulation stay in the charts unbricked.
4. `brick-reuse.mjs` reviews the 40 families used by one distinct standard.
   Ten merge into a supported harmonic variant; thirty are removed, taking 51
   further labels out of the chart. All 99 remaining families are reused.

Singleton matches require complete source material, ordered tonic-relative
root/core-quality anchors, support in at least two target standards, limited
structural distance and an unambiguous best family. Repeated occurrences in one
standard do not count as independent reuse. Full qualities, compound extensions,
explicit bass, key context and rational durations remain in variant definitions.
Ambiguous and idiosyncratic labels are removed without deleting their chords.
The final index accounts for 3,178 retained row spans. Surviving/merged legacy
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

The thirty new charts introduce eighteen existing dictionary names absent from
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
first viewport. The enlarged black ii⁷ favicon has a transparent background.

## Source fidelity and licenses

The original PDF screenshots remain authoritative for the 2011 roadmaps.
`evidence/extraction.json`, `corpus-check.json`, `typography-audit.json` and
`measure-timing-audit.json` retain extraction and comparison evidence. Eight
source-clipped chord cells remain timed silent gaps. Nine explicit NC cells in
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
