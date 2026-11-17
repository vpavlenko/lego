# Insights Roadmaps

A static digital reader for all 242 roadmap screenshots in Bob Keller's
`InsightsRoadmapsConsolidated.pdf` (revision 1, 6 October 2011).

Run `python3 -m http.server 5187 --directory dist` and open
`http://localhost:5187`. No build or runtime dependencies are required.
Run `node scripts/check.mjs` for data, transposition, Roman-numeral, and join checks.

## Reader behavior

- Each song's home tonic is transposed to C; major/minor quality and internal
  modulations remain intact. Home keys for ambiguous multi-key tunes are explicit
  in `scripts/build-data.py`; other home keys follow the source roadmap's dominant
  tonal region, rather than an often unset leadsheet key-signature field.
- Chord roots and slash basses transpose together, with diatonic spelling preserved.
- Roman numerals appear below chords. Song mode references C throughout; Brick
  mode references the local brick key. Minor chords use lowercase numerals.
- Every source join is represented by a Lucide up/down arrow and the shortest
  signed interval between its adjacent brick tonic roots. Zero uses up-arrow 0;
  tritones use up-arrow 6. A join's original name and tonic pair remain available
  on hover or click. These are not the interval to the next chord's root, and
  are not necessarily the interval implied by a named regular-cadence join.
- Hash routes identify individual analyses. Search matches song and brick names.
- Source view retains the exact original image; PDF links target its source page.
- JSON exports contain the selected analysis transposed to C.

## Colors

Rawl's exact 12-color `RAWL_COLORS` palette and foreground contrast are reused
from `~/repos/rawl/src/components/rawl/colors.ts`. Musical badges use the palette
background and its contrasting foreground, including distinguishing dots for
chromatic degrees 1 and 6. Interface controls, branding, focus, selection, and
source-clipping indicators are grayscale.

Chord roots and Roman numerals share the selected Song/Brick reference. Key-root
labels reference the song tonic C. Join badges use the signed shift modulo 12:
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
