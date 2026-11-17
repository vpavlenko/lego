# Rawl compatibility paths

Notation, geometry, palette, types and MIDI transport are supplied by the pinned
`librawl` package in `vendor/librawl-0.1.0.tgz`. The React entry points in this
directory only re-export its public API, preserving existing consumer paths.

`src/style.css` is a generated, byte-identical mirror of
`librawl/legacy-style.css`. `npm run build` refreshes this mirror and copies the
library's legacy stylesheet, palette and Sax browser audio profile to the site.
Edit the library and update the pinned package to change shared behavior.

Lego owns its chord realization, source arrangements, musical analysis, MIDI
export, host controls and mounting. `src/audio-player.mjs` supplies its existing
playback plan and callbacks to `librawl/audio`'s `createTransport`.
