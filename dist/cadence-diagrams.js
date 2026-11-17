import {RAWL_COLORS} from './rawl-colors.mjs';
const mod=value=>(value%12+12)%12;
const RN=['I','♭II','II','♭III','III','IV','♭V','V','♭VI','VI','♭VII','VII'];
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=(root,quality)=>{const numeral=quality==='dominant'?RN[root]:RN[root].toLowerCase();return numeral+(quality==='half-diminished'?'ø7':quality==='minor'?'':'7');};
/** The supplied diagram's two ii–V brackets and two directed resolutions.
 * Only normal root motion (+5 semitones) is solid; substitutions are dashed. */
export function cadenceDiagramHTML(roots,qualities=['minor7','dominant','minor7','dominant'],id='cadence'){
 if(roots.length!==4||qualities.length!==4||roots.some(root=>!Number.isInteger(root)))throw Error('Invalid cadence diagram');
 const degrees=roots.map(mod),x=[20,80,140,200,260],marker='cadence-arrow-'+String(id).replace(/[^a-zA-Z0-9_-]/g,'-'),labels=degrees.map((root,i)=>label(root,qualities[i]));
 const style=delta=>delta===5?'solid':'dashed',stroke=delta=>delta===5?'':' stroke-dasharray="3 3"';
 const pairs=[[0,1],[2,3]].map(([a,b])=>{const delta=mod(degrees[b]-degrees[a]);return `<path class="cadence-pair" data-delta="${delta}" data-style="${style(delta)}" d="M${x[a]} 46v7H${x[b]}v-7"${stroke(delta)}/>`;}).join('');
 const arcs=[[1,2],[3,4]].map(([a,b])=>{const delta=mod((degrees[b]??0)-degrees[a]);return `<path class="cadence-arc" data-delta="${delta}" data-style="${style(delta)}" d="M${x[a]} 24Q${(x[a]+x[b])/2} -2 ${x[b]} 24" marker-end="url(#${marker})"${stroke(delta)}/>`;}).join('');
 const nodes=[...degrees,0].map((root,i)=>`<text class="cadence-node" data-degree="${root}" x="${x[i]}" y="39" text-anchor="${i===4?'end':'middle'}" fill="${RAWL_COLORS[root].background}" style="fill:${RAWL_COLORS[root].background};stroke:none">${escape(labels[i]??'I')}</text>`).join('');
 return `<svg class="cadence-diagram" role="img" width="260" height="60" viewBox="0 0 260 60"><title>${escape(labels.join('–')+'→I')}</title><defs><marker id="${marker}" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0L6 3L0 6Z" fill="#888" stroke="none"/></marker></defs><g fill="none" stroke="#888" stroke-width="1.25" stroke-linejoin="round">${pairs}${arcs}</g>${nodes}</svg>`;
}
