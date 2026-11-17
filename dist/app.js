import {transposeRoot,transposeChord,prettyRoot,chordParts,roman,pitch,mod} from './harmony.mjs';
import {colorIndex} from './rawl-colors.mjs';
const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const data=await fetch('./data/roadmaps.json').then(r=>{if(!r.ok)throw Error(r.status);return r.json();});
const songs=data.songs;
let current=0,rnMode=localStorage.getItem('insights-rn')==='brick'?'brick':'song',source=false,detailTimer;
const arrow=delta=>`<svg class="lucide lucide-arrow-${delta<0?'down':'up'}" viewBox="0 0 24 24" aria-hidden="true">${delta<0?'<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>':'<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'}</svg>`;
function degreeToken(text,semitones){
 return `<span class="degree-color" data-degree="${colorIndex(semitones)}">${esc(text)}</span>`;
}
function catalog(){
 const q=$('#search').value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'');
 const result=songs.filter(s=>(s.title+' '+s.bricks.join(' ')).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').includes(q));
 $('#count').textContent=result.length;
 $('#songs').innerHTML=result.map(s=>`<a class="song-link${s.index===current?' active':''}" href="#${String(s.index).padStart(3,'0')}" ${s.index===current?'aria-current="page"':''}><span class="number">${String(s.index+1).padStart(3,'0')}</span><span>${esc(s.title)}</span></a>`).join('')||'<div class="empty">No matches</div>';
}
function at(c,scale){return `left:${c.start/scale*100}%;width:${Math.max(0,c.end-c.start)/scale*100}%`;}
function rowHTML(row,song,rowIndex){
 const scale=song.columns,tonic=song.tonic[0];let html='';
 html+=`<div class="score-row" data-row="${rowIndex}" aria-label="${row.startBar+1}–${row.startBar+row.bars}"><div class="bar-ticks">`;
 for(let n=0;n<=row.bars;n++)html+=`<div class="bar-tick${n===row.bars?' end':''}" style="left:${n/scale*100}%">${n<row.bars?`<span>${row.startBar+n+1}</span>`:''}</div>`;
 html+='</div>';
 const end=row.bars/scale*100;html+=`<div class="row-baseline" style="width:${end}%"></div>`;
 for(const key of row.keys){const root=transposeRoot(key.root,tonic);const text=prettyRoot(root)+' '+key.mode.toLowerCase();html+=`<div class="key-label ${key.mode.toLowerCase()}" style="${at(key,scale)}" title="${esc(text)}">${degreeToken(prettyRoot(root),pitch(root))} <span>${esc(key.mode.toLowerCase())}</span></div>`;}
 for(const b of row.bricks)if(b.name)html+=`<div class="brick" style="${at(b,scale)}" title="${esc(b.name)}">${esc(b.name)}</div>`;
 for(const c of row.chords){
  const symbol=transposeChord(c.symbol,tonic),parts=chordParts(symbol),key=row.keys.find(k=>c.start>=k.start-.01&&c.start<k.end-.01)||row.keys[0];
  const base=rnMode==='brick'&&key?transposeRoot(key.root,tonic):'C';
  const rn=roman(symbol,base),degree=mod(pitch(symbol)-pitch(base));
  html+=`<div class="chord${c.clipped?' uncertain':''}" style="${at(c,scale)}" title="${esc(symbol)}"><span class="root">${degreeToken(parts.root,degree)}</span><sup>${esc(parts.quality)}</sup></div><div class="rn" style="${at(c,scale)}" title="${esc(rn)}">${degreeToken(rn,degree)}</div>`;
 }
 for(const j of row.joins){const delta=j.delta;const from=transposeRoot(j.from,tonic),to=transposeRoot(j.to,tonic),label=`${j.name} · ${prettyRoot(from)} → ${prettyRoot(to)}`;html+=`<button class="join degree-color" data-degree="${colorIndex(delta)}" data-join="${esc(label)}" data-delta="${delta}" style="left:clamp(14px, ${j.at/scale*100}%, calc(100% - 14px))" title="${esc(label)}" aria-label="${esc(prettyRoot(from)+' → '+prettyRoot(to))}">${arrow(delta)}<span>${Math.abs(delta)}</span></button>`;}
 return html+'</div>';
}
function score(){const s=songs[current];$('#score').innerHTML=s.rows.map((r,i)=>rowHTML(r,s,i)).join('');$('#rn-song').setAttribute('aria-pressed',rnMode==='song');$('#rn-brick').setAttribute('aria-pressed',rnMode==='brick');}
function openSong(index,initial=false){
 current=Math.max(0,Math.min(songs.length-1,index));const s=songs[current];
 $('#title').textContent=s.title;document.title=s.title+' · Insights Roadmaps';
 $('#position').textContent=`${String(current+1).padStart(3,'0')} / ${songs.length}`;
 $('#composer').textContent=s.composer||'';$('#measure-count').textContent=s.bars+' bars';$('#meter').textContent=s.meter.join('/');
 $('#tonic').innerHTML=degreeToken('C',0)+' <span>'+esc(s.tonic[1]==='Minor'?'minor':s.tonic[1]==='Dominant'?'dominant':'major')+'</span>';
 $('#source-key').innerHTML=degreeToken(prettyRoot(s.tonic[0]),pitch(s.tonic[0]))+' '+degreeToken('→',-pitch(s.tonic[0]))+' '+degreeToken('C',0);
 $('#source-image').src='./source/'+s.image;$('#source-image').alt=s.title;
 $('#source-page').textContent='PDF · '+s.page;$('#source-download').href='./source/'+s.image;
 $('#pdf-link').href='./source/InsightsRoadmapsConsolidated.pdf#page='+s.page;
 $('#previous').disabled=current===0;$('#next').disabled=current===songs.length-1;
 score();catalog();closeMenu();$('#score-scroll').scrollLeft=0;
 if(!initial)window.scrollTo({top:0,behavior:'instant'});
}
function closeMenu(){document.body.classList.remove('menu-open');$('#menu').setAttribute('aria-expanded','false');$('#shade').hidden=true;}
function route(initial=false){const num=Number(location.hash.slice(1));openSong(Number.isInteger(num)&&num>=0&&num<songs.length?num:0,initial);}
$('#search').addEventListener('input',catalog);
$('#previous').onclick=()=>location.hash=String(current-1).padStart(3,'0');$('#next').onclick=()=>location.hash=String(current+1).padStart(3,'0');
for(const [id,mode] of [['#rn-song','song'],['#rn-brick','brick']])$(id).onclick=()=>{rnMode=mode;localStorage.setItem('insights-rn',mode);score();};
function setView(isSource){source=isSource;$('#analysis').hidden=source;$('#source-view').hidden=!source;$('#digital').setAttribute('aria-pressed',!source);$('#original').setAttribute('aria-pressed',source);}
$('#digital').onclick=()=>setView(false);$('#original').onclick=()=>setView(true);
$('#menu').onclick=()=>{const on=document.body.classList.toggle('menu-open');$('#menu').setAttribute('aria-expanded',on);$('#shade').hidden=!on;};$('#shade').onclick=closeMenu;
$('#score').onclick=e=>{const join=e.target.closest('[data-join]');if(!join)return;$('.join-detail')?.remove();clearTimeout(detailTimer);const el=document.createElement('div');el.className='join-detail';const delta=Number(join.dataset.delta);el.innerHTML=`<span>${esc(join.dataset.join)}</span><span class="delta degree-color" data-degree="${colorIndex(delta)}">${delta<0?'↓':'↑'}${Math.abs(delta)}</span>`;document.body.append(el);detailTimer=setTimeout(()=>el.remove(),4500);};
$('#data-download').onclick=()=>{const s=structuredClone(songs[current]),tonic=s.tonic[0];for(const row of s.rows){for(const c of row.chords)c.symbol=transposeChord(c.symbol,tonic);for(const k of row.keys)k.root=transposeRoot(k.root,tonic);for(const j of row.joins){j.from=transposeRoot(j.from,tonic);j.to=transposeRoot(j.to,tonic);}}s.originalTonic=s.tonic;s.tonic=['C',s.tonic[1]];const url=URL.createObjectURL(new Blob([JSON.stringify(s,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=s.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('hashchange',()=>route());
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();$('.join-detail')?.remove();}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();if(innerWidth<=760&&!document.body.classList.contains('menu-open'))$('#menu').click();$('#search').focus();}});
route(true);requestAnimationFrame(()=>$('#songs .active')?.scrollIntoView({block:'nearest'}));
