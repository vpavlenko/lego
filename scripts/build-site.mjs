import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {realizeSong} from '../src/music/realization.mjs';
import {encodeMidi} from '../src/music/midi.mjs';
import {buildBrickIndex,brickExample} from '../src/music/bricks.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const {songs}=read('dist/data/roadmaps.json'),{qualities}=read('src/music/chord-vocabulary.json');
fs.mkdirSync(path.join(root,'dist/data/performances'),{recursive:true});fs.mkdirSync(path.join(root,'dist/midi'),{recursive:true});
let total=0,clipped=0;
for(const song of songs){
 const data=realizeSong(song,qualities),id=String(song.index).padStart(3,'0');total+=data.notes.length;clipped+=data.chords.filter(c=>c.clipped).length;
 fs.writeFileSync(path.join(root,`dist/data/performances/${id}.json`),JSON.stringify(data));fs.writeFileSync(path.join(root,`dist/midi/${id}.mid`),encodeMidi(data));
}
const bricks=buildBrickIndex(songs);fs.writeFileSync(path.join(root,'dist/data/bricks.json'),JSON.stringify(bricks));
fs.mkdirSync(path.join(root,'dist/data/brick-performances'),{recursive:true});
fs.mkdirSync(path.join(root,'dist/midi/bricks'),{recursive:true});
for(const brick of bricks.bricks){
 const {previewSong,source}=brickExample(brick,songs),data={...realizeSong(previewSong,qualities),previewSong,source};
 fs.writeFileSync(path.join(root,`dist/data/brick-performances/${brick.slug}.json`),JSON.stringify(data));
 fs.writeFileSync(path.join(root,`dist/midi/bricks/${brick.slug}.mid`),encodeMidi(data));
}
fs.copyFileSync(path.join(root,'packages/rawl-notation/src/style.css'),path.join(root,'dist/rawl-notation.css'));
fs.copyFileSync(path.join(root,'packages/rawl-notation/src/palette.mjs'),path.join(root,'dist/rawl-colors.mjs'));
fs.copyFileSync(path.join(root,'packages/rawl-notation/LICENSE'),path.join(root,'dist/RAWL-LICENSE.txt'));
await build({entryPoints:[path.join(root,'src/rawl-view.jsx')],outfile:path.join(root,'dist/rawl-view.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],jsx:'automatic',minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}});
await build({entryPoints:[path.join(root,'src/audio-player.mjs')],outfile:path.join(root,'dist/audio-player.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],minify:true});
await build({entryPoints:[path.join(root,'src/music/modulations.mjs')],outfile:path.join(root,'dist/modulations.js'),bundle:true,format:'esm',platform:'browser',target:['es2020'],minify:true});
console.log(JSON.stringify({songs:songs.length,bricks:bricks.bricks.length,notes:total,clipped,status:'built'}));
