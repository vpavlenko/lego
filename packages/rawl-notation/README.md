# @insights/rawl-notation

A small, reusable React renderer for MIDI-note data, using Rawl's palette,
voice shapes, and tonal guides, and Caplin's shared pitch geometry.

This package has no song corpus, router, audio engine, storage, or application
controls. A host supplies note events, row boundaries, key changes, optional
annotation renderers, and seek/audition callbacks. It can be moved to another
repository without changing its source imports. It is not independently
published to a package registry.

```jsx
import {RawlNotation} from '@insights/rawl-notation';
import '@insights/rawl-notation/style.css';

<RawlNotation
  notes={[{id:'c',pitch:60,start:0,duration:4,voice:0}]}
  beats={16}
  rows={[{start:0,end:16}]}
  tonic={0}
  barBeats={4}
  onSeek={setPlaybackBeat}
  onNote={auditionNote}
/>
```

All times are quarter-note beats. Pitch is a MIDI note number. Notes held across
row boundaries are drawn in both rows and determine each row's pitch range.
Notes are five pixels high on a three-pixel semitone axis; resizing changes the
horizontal time scale. A ref exposes `setPosition(beat)` for an audio-clock-driven
playhead and active-note height changes without React rendering every frame.
Active or hovered notes double upward, preserving their bottom edge. Playback
adds no outline, brightness, or stacking change. A held note only grows in the
current playback row; muted voices collapse to 0.5 px, as in Rawl.

Geometry derives from `caplin/packages/music/rawl-layout.js` and tonal guides
from its `tonal-grid.js`, themselves based on https://github.com/vpavlenko/rawl.
Rawl conventions are GPL-3.0; see LICENSE. No Caplin book content is included.

`changes` also draws Rawl modulation flags at exact onsets: an 80 × 12 px fading
rectangle with the signed interval and new tonic beside the measure number.
Equal-tonic events remain visible, so hosts can retain zero-shift joins. Notes
use Rawl’s midpoint rule; tonal guides change at the onset.
