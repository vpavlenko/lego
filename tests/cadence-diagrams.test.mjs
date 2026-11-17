import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {cadenceDiagramHTML} from '../dist/cadence-diagrams.js';
import {RAWL_COLORS} from '../dist/rawl-colors.mjs';
const parse=html=>new JSDOM('<!doctype html>'+html).window.document;
test('normal ii–V cells use two lower brackets and two curved solid resolution arrows',()=>{
 const doc=parse(cadenceDiagramHTML([4,9,2,7],undefined,'normal')),svg=doc.querySelector('svg');
 assert.equal(svg.querySelectorAll('.cadence-pair').length,2);assert.equal(svg.querySelectorAll('.cadence-arc').length,2);assert.equal(svg.querySelectorAll('.cadence-node').length,5);
 for(const path of svg.querySelectorAll('.cadence-pair,.cadence-arc')){assert.equal(path.dataset.delta,'5');assert.equal(path.dataset.style,'solid');assert.equal(path.getAttribute('stroke-dasharray'),null);}
 for(const path of svg.querySelectorAll('.cadence-pair'))assert.match(path.getAttribute('d'),/v7H\d+v-7$/);
 for(const path of svg.querySelectorAll('.cadence-arc')){assert.match(path.getAttribute('d'),/Q/);assert.equal(path.getAttribute('marker-end'),'url(#cadence-arrow-normal)');}
 assert.deepEqual([...svg.querySelectorAll('.cadence-node')].map(n=>n.textContent),['iii7','VI7','ii7','V7','I']);assert.equal(svg.querySelector('g').getAttribute('stroke'),'#888');
 for(const n of svg.querySelectorAll('.cadence-node'))assert.equal(n.getAttribute('fill'),RAWL_COLORS[Number(n.dataset.degree)].background);
});
test('tritone pair brackets and nonnormal arcs retain the original dashed distinction',()=>{
 const doc=parse(cadenceDiagramHTML([4,3,2,1],undefined,'tritone')),pairs=[...doc.querySelectorAll('.cadence-pair')],arcs=[...doc.querySelectorAll('.cadence-arc')];
 assert.deepEqual(pairs.map(p=>[p.dataset.delta,p.dataset.style]),[['11','dashed'],['11','dashed']]);assert.deepEqual(arcs.map(p=>[p.dataset.delta,p.dataset.style]),[['11','dashed'],['11','dashed']]);for(const p of [...pairs,...arcs])assert.equal(p.getAttribute('stroke-dasharray'),'3 3');
 const deceptive=parse(cadenceDiagramHTML([3,8,2,7],undefined,'link'));assert.deepEqual([...deceptive.querySelectorAll('.cadence-arc')].map(p=>[p.dataset.delta,p.dataset.style]),[['6','dashed'],['5','solid']]);
});
test('generalized qualities and SVG marker identities remain explicit without a linear heading',()=>{
 const doc=parse(cadenceDiagramHTML([4,9,2,7],['minor','dominant','half-diminished','dominant'],'generalized-0')+cadenceDiagramHTML([4,9,2,7],undefined,'generalized-1'));
 assert.deepEqual([...doc.querySelector('svg').querySelectorAll('text')].map(n=>n.textContent),['iii','VI7','iiø7','V7','I']);assert.equal(new Set([...doc.querySelectorAll('marker')].map(m=>m.id)).size,2);
 assert.throws(()=>cadenceDiagramHTML([0,1,2]),/Invalid/);
});

test('computed RN colors survive global icon SVG styles without a white stroke',()=>{
 const doc=parse(`<style>${fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8')}${fs.readFileSync(new URL('../dist/atlas.css',import.meta.url),'utf8')}</style>${cadenceDiagramHTML([4,9,2,7])}`),w=doc.defaultView;
 assert.equal(w.getComputedStyle(doc.querySelector('svg')).fill,'none','Production icon reset is exercised');
 for(const node of doc.querySelectorAll('.cadence-node')){const style=w.getComputedStyle(node);assert.equal(style.fill,RAWL_COLORS[Number(node.dataset.degree)].background);assert.equal(style.stroke,'none');}
 assert.equal(doc.querySelector('marker path').getAttribute('stroke'),'none');
});

test('diagram and right-aligned names share a bounded width ending at the terminal I anchor',()=>{
 const html=`<div class="cadence-matrix"><div class="cadence-pattern"><h3 class="cadence-pattern-rn">${cadenceDiagramHTML([4,9,2,7])}</h3><ul class="cadence-pattern-bricks"><li><a>Cadence</a></li></ul></div></div>`;
 const doc=parse(`<style>${fs.readFileSync(new URL('../dist/style.css',import.meta.url),'utf8')}${fs.readFileSync(new URL('../dist/atlas.css',import.meta.url),'utf8')}</style>${html}`),w=doc.defaultView,card=doc.querySelector('.cadence-pattern'),svg=doc.querySelector('svg'),list=doc.querySelector('ul'),terminal=svg.querySelector('text:last-child');
 const cardStyle=w.getComputedStyle(card),svgStyle=w.getComputedStyle(svg),listStyle=w.getComputedStyle(list),gridStyle=w.getComputedStyle(doc.querySelector('.cadence-matrix')),box=svg.getAttribute('viewBox').split(' ').map(Number);
 assert.equal(cardStyle.width,'100%');assert.equal(cardStyle.maxWidth,'260px');assert.equal(cardStyle.justifySelf,'start');assert.equal(gridStyle.gridTemplateColumns,'repeat(auto-fit,minmax(0,260px))');
 assert.equal(svgStyle.width,'100%');assert.equal(svgStyle.height,'auto');assert.equal(Number(svg.getAttribute('width')),box[2]);assert.equal(Number(svg.getAttribute('height')),box[3]);assert.equal(terminal.textContent,'I');assert.equal(terminal.getAttribute('text-anchor'),'end');assert.equal(Number(terminal.getAttribute('x')),box[0]+box[2]);
 assert.equal(listStyle.textAlign,'right');assert.equal(listStyle.paddingRight,'0px');assert.equal(listStyle.marginRight,'0px');assert.equal(listStyle.borderRightWidth,'');
 // SVG intrinsic scaling and the text end anchor define the same right edge
 // as the unpadded list, both below and above the maximum grid/card width.
 for(const available of [180,260,760]){const width=Math.min(available,parseFloat(cardStyle.maxWidth));assert.equal((Number(terminal.getAttribute('x'))-box[0])*width/box[2],width);}
});
