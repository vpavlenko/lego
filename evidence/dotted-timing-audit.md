# Written dotted timing inventory

Snapshot: 507 performances, 266 melody charts and 266 distinct active heads, including the existing-match head on chart 73. Every performance is parsed and its melody note tuples are compared to the selected source entry under the recorded constant pitch/beat offset. All 266 original source hashes are independently verified.

Scope distinguishes written glyphs from performed interpretation:

- 716 written dotted-eighth occurrences after source repeat/navigation expansion, representing 503 unique physical source glyph locations.
- 716 complete 75/25 quarter-cell candidates across 32 heads; 89 include rests and 88 include held/tied edges. These categories overlap.
- 39 occurrences have fractional absolute start times because their written measure grid follows a pickup. Their measure-relative quarter alignment is retained.
- No selected-head written dotted-sixteenth glyphs or .375/.125 half-quarter figures were found. The scanner and regression fixtures explicitly handle isolated/offbeat dots, rests, inherited dots and tie-merged units; they are not limited to onset pairs.
- 82 cells across ten heads have both exact literal/compiler 8.-16 proof and an alternate physical plain-eighth encoding. They remain unapproved proposals. Independent transcription lineage has not been established. The other 634 cell interpretations remain unresolved. Existing Satin Doll interpretation approval is owned separately.

All candidate/figure `normalizationApproved` fields and all joined `interpretationApproved` fields are false. This audit changes no source entry, MIDI, performance, groove metadata, runtime or rendering.

261 heads have complete written-unit-to-retained-note coverage. Five exceptions remain explicit: A Night in Tunisia, Recorda Me and Whisper Not have source grace/articulation duration differences; In a Sentimental Mood has a retained source-unit timing exception; Just the Way You Are has an unresolved expanded-repeat measure mapping. Its independently parsed original XML contains no dotted eighth/sixteenth glyphs, so it does not hide a dotted-figure candidate. The exception records remain in the inventory. No unknown unit is silently dropped.

Reproduce with Python 3.11 and the pinned LilyPond 2.26.0 executable:

```sh
python3.11 scripts/audit-dotted-timings.py --project /path/to/reader --openbook-source /path/to/book-openbook-adbe5c68ff59e20068dd754e7d227979fa628d33 --lilypond /path/to/lilypond-2.26.0/bin/lilypond --psjazz-dir /path/to/insights-performance-style-source --improvisor-source /path/to/Impro-Visor --wikifonia-archive /path/to/Wikifonia.zip --work-dir /path/to/compiler-cache --output evidence/dotted-timing-inventory.json --candidates evidence/dotted-timing-candidates.json --cross-source-proposals /path/to/strong-cell-proposals-716.json
python3.11 scripts/join-dotted-source-proofs.py --inventory evidence/dotted-timing-inventory.json --candidates evidence/dotted-timing-candidates.json --proposals /path/to/strong-cell-proposals-716.json --output evidence/dotted-source-corroboration.json
node --test tests/dotted-timing-inventory.test.mjs
```

The source-path/hash/version, compiler-generated and log hashes, note indices/times/pitches, canonical composition/usage grouping, physical duration denominator/dot count, rests and tie pieces are retained in the JSON evidence. Cross-source proposals and their report are separately pinned by SHA256. Source files and compiler scratch remain outside the published reader.
