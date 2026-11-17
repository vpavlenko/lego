import test from 'node:test';
import assert from 'node:assert/strict';
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
