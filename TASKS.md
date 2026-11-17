# Implementation status

Public site: https://insights-roadmaps.cxielamiko.chatgpt.site

Current implementation: 360 arrangements / 269 standards; 119 melody charts;
117 reusable brick families in 11 type groups. Original 242 roadmap records stay
unchanged. Tests and source audits distinguish original analysis from display
choices and alternate arrangements.

| Request | Implemented result | Evidence |
|---|---|---|
| Header controls | Counter and arrows replaced by synchronized Lucide play/pause | browser DOM; Safari playback |
| Melody drawing order | Melody notes always above piano chord notes | melody integration; Safari |
| Broader melody coverage | 219 encoded heads:131 PSjazzEval +79 OpenBook +9 explicit Impro-Visor heads | source-specific audits and MIDI tests |
| Body and Soul | OpenBook Real separate arrangement286,32bars/129notes; actual head | OpenBook compiler/MIDI proof; arrangement switching test; Safari |
| Arrangement identity | 119 melody-enabled charts; original30 imported addresses preserved | melody-source-intake.json; MIDI/source integration |
| Recoloring | Click measure, hover pitch to preview tonic, click to apply; Esc cancels | Rawl source review; recolor tests; Safari |
| One-chord modulation |395 regions assigned previous/next;34 weak cases individually reviewed;49 initial C contexts retained | modulation-regions-audit.json; ten focused tests |
| Brick→standard navigation | Matching passage scrolls/pulses; transport starts at beginning | browser integration; Safari0:00 state |
| Brick usage lists | Linked titles only; no measure references or inline Rawl rendition links | browser DOM |
| Catalogue examples | Most popular variant by distinct standards, then passages and semantic order | atlas tests |
| Catalogue counts/order | Usage count beside each brick; descending within each type; arrangements count once | atlas tests; Safari |
| Shared brick grouping | Drawer and catalogue use the same types and item order | shared generated group metadata; DOM/Safari |
| Catalogue group index | All type-group links at top | atlas DOM; Safari |
| General phrase grouping |29 longer phrase promotions; Love for Sale16+16+16; six fine brick layouts retained | general-section-layout.json; thirteen layout tests; Safari |
| Form labels | A/B/C in square boxes in Rawl and Analysis | shared display styling; Safari |
| Superscript colors | Sounding-pitch semantics relative to active tonic; atomic9/11/13 and alterations | harmony-display tests; Caplin source; Safari |
| Slash chord colors | Gray slash, separately colored explicit bass, chord and RN views | harmony-display tests; Safari |
| Favicon | Transparent ii⁷ with upward exact Rawl2–4–6 gradient | SVG test; Safari |
| Brick reuse | Expanded corpus:37 singleton families reviewed;9 merged,28 removed;117 families remain | regenerated reuse/runtime audits |
| Unhelpful bricks |1,200 one-harmony spans and407 On/Off spans removed; harmony kept | one-chord-bricks.json; immutable source assertions |
| Variant detail |1,218 complete definitions, eight unresolved;100px measures and one continuous line; icon controls | variant MIDI round trips; notation/DOM |
| Previous notation/audio | Output-aware clock; upward note doubling; no cursor; transparent global RN hover; root-position/compound/slash realization | transport, geometry and realization tests |
| Previous form review | Six former ABCA cases; House10+10+8+10; Ipanema8+8+16+8; persisted AABA subgroups | form/timing audits and tests |
| Sources/access | Public Site retained; reference-book PDF excluded; actual source provenance/licenses preserved | package inspection and public release checks |

All requested changes are implemented. Melody coverage remains source-limited:
placeholder notes, improvised solos, uncertain tonic modes, pickups and unresolved
textual repeat navigation are not presented as verified heads. The original
roadmap remains selectable when another edition supplies the melody.

The notation component is isolated in packages/rawl-notation; moving it to another
repository remains optional and has not been done. Hardware listening and physical
mobile-device verification have not been performed.
