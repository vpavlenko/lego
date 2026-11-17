# Implementation status

Public site: https://insights-roadmaps.cxielamiko.chatgpt.site

The items below are implemented. All 127 automated checks pass. Safari checks
covered the catalogue, continuous variant cards, content heading/footer, AABA
selector, repeated A alignment, source arrangement switch and live playback
state. Hardware listening and physical mobile-device checks were not performed.
Original source data remains available independently of the learner projection.

| Request | Implemented result | Evidence |
|---|---|---|
| Singleton review | 40 candidates: 10 merges, 30 removals; 99 reusable families remain | brick-reuse-audit.json; seven focused tests |
| Superficial families | Two/Four/Three Goes and guarded Slow/Long/Extended variants join their main family | brick-families-audit.json |
| Unhelpful bricks | One-harmony and all On/Off / Off/On labels removed; chords remain | one-chord-bricks.json; runtime-projection.json |
| Original analysis preservation | All 242 source charts unchanged; runtime projection affects brick annotations only | immutable roadmaps.json; musical-data fingerprints and integration assertions |
| Shared grouped catalogue | One Bricks catalogue; 99 families in 11 Impro-Visor type groups; shared top navigation | atlas data and DOM checks |
| Complete brick previews | 100px measures; one continuous line; natural-width cards may occupy a single column | notation rows, atlas and DOM checks; Safari |
| Variant pages | 919 complete definitions; eight unresolved occurrences; similarity order; icon play buttons | variant-assets round trips; variant-order tests |
| Compact usage lists | Comma-separated titles and immediate measure links; no indices/tables/inline Rawl links | browser DOM check; Safari |
| Melody import | 131 source melodies / 16,456 notes / 131 MIDI files | melody-import-audit.json; import round trips |
| Melody above changes | 31 charts with independent GM65 alto sax; persisted Melody show/hide and mute | melody integration/audio tests; Safari playback state |
| Separate arrangements | 22 new standards plus eight RealBook alternatives; whole-chart selector | additional-standards.json; DOM/MIDI integration |
| Additional brick parsing | 554 dictionary rules; eighteen newly used dictionary names, three reused ≥3 times | brick-parsing-audit.json |
| Unknown repeated bricks | Search implemented; none met the three-composition rule in this import | discovered-bricks.json; parser tests |
| AABA subgroups | B key / A brick selector in the drawer, persisted; stable under search | aaba-groups tests; Safari selection |
| Repeated A layout | A / AB / A; four A subphrases aligned in Gone With the Wind; five reviewed display refinements | repeated-subphrases.json; section-layout tests |
| Form/timing review | Six former ABCA cases reviewed; House10+10+8+10 and Ipanema8+8+16+8 | form/timing audits and tests |
| Dense main layout | Title above content pane, no drawer standard numbers, tighter gaps, controls in footer | DOM assertions; Safari |
| Rawl fidelity | Exact palette/shapes; no cursor; active notes double upward; measure visible through flag; compact arrow offset | notation/geometry/transport tests |
| Harmony stripe | Transparent chords by default; global RN hover without reflow | DOM/notation tests |
| Realization | Dense root position, compound extensions above seventh, explicit slash bass below complete chord | vocabulary and MIDI round trips |
| Favicon / initial C | Enlarged black ii⁷ transparent favicon; initial C omitted on brick previews | labels tests; Safari |
| Rawl rendition links | Retained in standard headers only | 69 verified links across 34 standards; browser checks |
| Public access / book exclusion | Existing public Site retained; reference book PDF excluded | hosting configuration and package inspection |

Remaining limitations are explicit: melody data is not forced onto incompatible
roadmaps; uncertain or malformed source lead sheets are retained in the import
audit but excluded from playable chart additions. No unknown reusable pattern
is claimed when the corpus does not support it. The React notation component
is isolated in packages/rawl-notation; moving it to another repository is optional
and has not been done.
