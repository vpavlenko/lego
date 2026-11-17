import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import * as geometry from 'librawl/geometry';
import * as compatibilityGeometry from '../packages/rawl-notation/src/geometry.mjs';
import * as palette from 'librawl/palette';
import {NoteLayer,createSectionPlaybackClock,nativeColorStyles} from 'librawl/native';
import * as compatibilityPalette from '../packages/rawl-notation/src/palette.mjs';
const require=createRequire(import.meta.url),root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p)),libraryDist=path.dirname(require.resolve('librawl/style.css'));
test('Lego pins the exact packed public library and one matching React runtime',()=>{
 const pkg=json('package.json'),lock=json('package-lock.json'),installed=require('react/package.json'),dom=require('react-dom/package.json');
 assert.equal(pkg.dependencies.librawl,'file:vendor/librawl-0.3.3.tgz');assert.equal(installed.version,'19.3.1');assert.equal(dom.version,installed.version);assert.equal(pkg.dependencies.react,installed.version);assert.equal(pkg.dependencies['react-dom'],installed.version);
 const integrity='sha512-'+createHash('sha512').update(read('vendor/librawl-0.3.3.tgz')).digest('base64');assert.equal(lock.packages['node_modules/librawl'].integrity,integrity);assert.equal(lock.packages['node_modules/librawl'].version,'0.3.3');
 const audit=json('evidence/librawl-consumer-audit.json');assert.equal(audit.library.archiveIntegrity,integrity);assert.equal(audit.library.archiveSha256,createHash('sha256').update(read('vendor/librawl-0.3.3.tgz')).digest('hex'));assert.equal(audit.preservation.baselines.length,360);
});
test('compatibility paths expose the public implementations without geometry or palette forks',()=>{
 assert.deepEqual(Object.keys(compatibilityGeometry),Object.keys(geometry));for(const key of Object.keys(geometry))assert.equal(compatibilityGeometry[key],geometry[key]);assert.equal(compatibilityPalette.RAWL_COLORS,palette.RAWL_COLORS);assert.equal(compatibilityPalette.colorIndex,palette.colorIndex);
 const component=read('packages/rawl-notation/src/RawlNotation.jsx').toString(),host=read('src/rawl-view.jsx').toString(),audio=read('src/audio-player.mjs').toString();assert.match(component,/export \{RawlNotation,RawlMeasureHeader\} from 'librawl'/);assert.doesNotMatch(component,/function|forwardRef|useLayoutEffect/);assert.match(host,/from 'librawl'/);assert.doesNotMatch(host,/packages\/rawl-notation/);assert.match(audio,/createTransport\(\{\.\.\.callbacks,makePlan:playbackPlan\}\)/);assert.doesNotMatch(audio,/requestAnimationFrame|createGain|createClock/);
 const implementation=fs.readFileSync(path.join(libraryDist,'index.js'),'utf8');assert.match(implementation,/import \{ NoteLayer, NotePlaybackContext, PlaybackSectionContext, createSectionPlaybackClock \} from "librawl\/native"/);assert.doesNotMatch(implementation,/function getNoteRectangles/);assert.equal(typeof NoteLayer,'function');assert.equal(typeof createSectionPlaybackClock,'function');
});
test('generated legacy CSS, palette and Sax audio profile exactly match installed library artifacts',()=>{
 const css=fs.readFileSync(require.resolve('librawl/legacy-style.css'));assert.deepEqual(read('packages/rawl-notation/src/style.css'),css);assert.deepEqual(read('dist/rawl-notation.css'),css);assert.ok(css.toString().includes(nativeColorStyles()));assert.ok(css.toString().includes(fs.readFileSync(require.resolve('librawl/voice-shapes.css'),'utf8')));
 assert.deepEqual(read('dist/rawl-colors.mjs'),fs.readFileSync(path.join(libraryDist,'palette.js')));
 assert.deepEqual(read('dist/soundfont-playback.js'),fs.readFileSync(require.resolve('librawl/browser/soundfont-playback-sax.js')));
 assert.deepEqual(read('dist/RAWL-LICENSE.txt'),fs.readFileSync(path.join(libraryDist,'../LICENSE')));
 assert.deepEqual(read('dist/LIBRAWL-NOTICE.md'),fs.readFileSync(path.join(libraryDist,'../NOTICE.md')));
 assert.deepEqual(read('dist/librawl-provenance.json'),fs.readFileSync(path.join(libraryDist,'provenance.json')));
});
