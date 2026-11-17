import {transposeRoot,transposeChord,prettyRoot,chordParts,roman,pitch,mod} from './harmony.mjs';
import {RAWL_COLORS,colorIndex} from './rawl-colors.mjs';
import {songModulations,modulationAt,modulationDelta,TONIC_NAMES} from './modulations.js';
import {mountRawlView,bindHarmonyHover} from './rawl-view.js';
import {createPlayer,encodeMidi} from './audio-player.js';
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const [data,brickData,formData,rawlLinkData]=await Promise.all(['./data/roadmaps.json','./data/bricks.json','./data/forms.json','./data/rawl-links.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error(r.status);return r.json();})));
const forms=formData.forms,familyOrder=['12-bar blues','Rhythm-like','AABA','ABAC','ABAB','AABC','ABAA','ABCA','AAAA','Other'];
const songs=data.songs,modulationMap=songs.map(songModulations),bricks=brickData.bricks,brickMap=new Map(bricks.flatMap(b=>[b.name,...b.aliases].map(name=>[name,b]))),brickBySlug=new Map(bricks.flatMap(b=>[b.slug,...b.aliasSlugs].map(slug=>[slug,b])));
const navigationOrder=[...songs].sort((a,b)=>familyOrder.indexOf(forms[a.index].family)-familyOrder.indexOf(forms[b.index].family)||a.title.localeCompare(b.title)).map(s=>s.index);
const destroyHarmony=bindHarmonyHover(document);
let current=0,currentBrick=null,routeKind='song',view=['analysis','source','rawl'].includes(localStorage.getItem('insights-view'))?localStorage.getItem('insights-view'):'rawl';
let rawl=null,performance=null,currentBeat=null,selected=null,routeGeneration=0,detailTimer,lastPlaybackRow=-1;
const transport=$('#transport'),songRawl=$('#rawl-view');
let brickViews=[],activeVariant=null;
const rawlElement=()=>routeKind==='brick'?activeVariant?.element??$('#brick-variants'):songRawl;
function destroyViews(){if(brickViews.length)brickViews.forEach(v=>v.controller.destroy());else rawl?.destroy();brickViews=[];activeVariant=null;rawl=null;}
function restoreTransport(){$('#reader-tools').append(transport);}
const cache=new Map(),pad=n=>String(n).padStart(3,'0');
const arrow=delta=>`<svg class="lucide lucide-arrow-${delta<0?'down':'up'}" viewBox="0 0 24 24" aria-hidden="true">${delta<0?'<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>':'<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>'}</svg>`;
const token=(text,semitones)=>`<span class="degree-color" data-degree="${colorIndex(semitones)}">${esc(text)}</span>`;
const externalIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M21 14v7H3V3h7"/></svg>';
function rawlLinksHTML(index){const links=rawlLinkData.standards[index]??[];if(!links.length)return '';const anchor=l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.title)}">${esc(l.title)} ${externalIcon}</a>`;return links.length===1?`<a class="rawl-rendition" href="${esc(links[0].url)}" target="_blank" rel="noopener" title="${esc(links[0].title)}">Rawl ${externalIcon}</a>`:`<details class="rawl-renditions"><summary>Rawl ${links.length}</summary><div>${links.map(anchor).join('')}</div></details>`;}
const clock=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
const player=createPlayer({onState:state=>{
 $('#play').textContent=state==='playing'?'Pause':state==='loading'?'Loading':'Play';$('#play').setAttribute('aria-label',$('#play').textContent);$('#play').setAttribute('aria-busy',String(state==='loading'));
 for(const item of brickViews)item.button.textContent=item===activeVariant&&state==='playing'?'Pause':'Play';
 $('#stop').disabled=!performance||(state==='idle'&&player.position===0);$('#playback-error').hidden=state!=='error';
},onPosition:beat=>{
 currentBeat=beat;rawl?.setPosition(beat);$('#playback-time').textContent=clock((beat??player.position)*60/player.tempo);
 for(const c of $('#score').querySelectorAll('[data-chord-start]'))c.classList.toggle('sounding',beat!==null&&beat>=Number(c.dataset.chordStart)&&beat<Number(c.dataset.chordEnd));
 if(player.state==='playing'&&performance&&beat!==null){const el=displayedRowAt(beat);if(el&&el!==lastPlaybackRow){lastPlaybackRow=el;const box=el.getBoundingClientRect();if(box.bottom>innerHeight||box.top<70)el.scrollIntoView({block:'nearest',behavior:'smooth'});}}
},onError:error=>{console.error(error);$('#playback-error').hidden=false;}});
function catalog(){
 const q=$('#search').value.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,''),isBricks=routeKind!=='song';
 const list=(isBricks?bricks:songs).filter(item=>(isBricks?[item.name,...item.aliases].join(' '):item.title+' '+item.bricks.flatMap(name=>[name,brickMap.get(name)?.name??name]).join(' ')).toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').includes(q));
 $('#catalog-label').textContent=isBricks?'BRICKS':'SONGS';$('#songs').setAttribute('aria-label',isBricks?'Bricks':'Songs');$('#count').textContent=list.length;
 const link=item=>isBricks?`<a class="song-link${currentBrick?.slug===item.slug?' active':''}" href="#brick/${item.slug}"><span class="number">${item.standards.length}</span><span>${esc(item.name)}</span></a>`:`<a class="song-link${item.index===current?' active':''}" href="#${pad(item.index)}" ${item.index===current?'aria-current="page"':''}><span class="number">${pad(item.index+1)}</span><span>${esc(item.title)}</span></a>`;
 $('#songs').innerHTML=(isBricks?list.map(link).join(''):familyOrder.map(family=>{const members=list.filter(s=>forms[s.index].family===family);return members.length?`<section class="catalog-family"><h2>${esc(family)} <span>${members.length}</span></h2>${members.map(link).join('')}</section>`:'';}).join(''))||'<div class="empty">No matches</div>';
 $('#songs-nav').href='#'+pad(current);$('#songs-nav').setAttribute('aria-current',isBricks?'false':'page');$('#bricks-nav').setAttribute('aria-current',isBricks?'page':'false');
}
function at(c,scale){return `left:${c.start/scale*100}%;width:${Math.max(0,c.end-c.start)/scale*100}%`;}
function rowHTML(row,song,rowIndex){
 const scale=row.section?row.bars:song.columns,tonic=song.tonic[0],barBeats=song.meter[0]*4/song.meter[1];let html=`<div class="score-row" data-row="${rowIndex}" data-start="${row.startBar*barBeats}" data-end="${(row.startBar+row.bars)*barBeats}" ${row.section?`data-section="${row.section}" style="grid-row:${row.layoutRow+1};grid-column:${row.layoutColumn+1} / span ${row.bars}"`: ''} aria-label="${row.startBar+1}–${row.startBar+row.bars}"><div class="bar-ticks">`;
 for(let n=0;n<=row.bars;n++)html+=`<div class="bar-tick${n===row.bars?' end':''}${modulationMap[song.index].some((e,i)=>i>0&&e.beat===(row.startBar+n)*barBeats&&e.tonic!==modulationMap[song.index][i-1].tonic)?' modulation-bar':''}" style="left:${n/scale*100}%">${n<row.bars?`<span>${row.startBar+n+1}</span>`:''}</div>`;
 html+='</div>';

 for(const b of row.bricks)if(b.name)html+=`<a class="brick${selected===brickMap.get(b.name).name?' selected-brick':''}" style="${at(b,scale)}" title="${esc(b.name)}" href="#brick/${brickMap.get(b.name).slug}?song=${song.index}&beat=${(row.startBar+b.start)*barBeats}">${esc(brickMap.get(b.name).name)}</a>`;
 html+='<div class="analysis-harmony harmony-stripe"><div class="harmony-chords">';
 const cells=row.chords.map(c=>{const symbol=transposeChord(c.symbol,tonic),parts=chordParts(symbol),base=modulationAt(modulationMap[song.index],(row.startBar+c.start)*barBeats).root,degree=mod(pitch(symbol)-pitch(base)),rn=roman(symbol,base);return {c,symbol,parts,degree,rn};});
 for(const {c,symbol,parts,degree}of cells)html+=`<div class="chord harmony-cell${c.clipped?' uncertain':''}" data-degree="${degree}" data-chord-start="${(row.startBar+c.start)*barBeats}" data-chord-end="${(row.startBar+c.end)*barBeats}" style="${at(c,scale)};color:${RAWL_COLORS[degree].background}" title="${esc(symbol)}"><span class="root">${esc(parts.root)}</span><sup>${esc(parts.quality)}</sup></div>`;
 html+='</div><div class="harmony-rns">';
 for(const {c,rn,degree}of cells)html+=`<div class="rn harmony-cell" data-degree="${degree}" style="${at(c,scale)};color:${RAWL_COLORS[degree].background}" title="${esc(rn)}">${esc(rn)}</div>`;
 html+='</div></div>';
 const events=modulationMap[song.index];
 for(let i=0;i<events.length;i++){
  const event=events[i],bar=event.beat/barBeats;if(bar<row.startBar||bar>=row.startBar+row.bars)continue;
  const delta=i?modulationDelta(events[i-1].tonic,event.tonic):null;if(delta===0)continue;
  html+=`<div class="rawln-modulation" data-beat="${event.beat}" data-tonic="${event.tonic}" ${event.join?`data-join="${esc(event.name)}"`:''} style="left:${(bar-row.startBar)/scale*100}%" title="${esc(event.name||TONIC_NAMES[event.tonic])}">${delta===null?'':`<div class="rawln-modulation-flag degree-color" data-degree="${colorIndex(delta)}"></div>`}<span class="rawln-modulation-label" style="left:${i?30:18}px">${delta===null?'':arrow(delta)+Math.abs(delta)+' '}${TONIC_NAMES[event.tonic]}</span></div>`;
 }

 return html+'</div>';
}
function sliceFormRows(song,form){return form.sections.map(s=>({startBar:s.start,bars:s.bars,section:s.label,layoutRow:s.layoutRow,layoutColumn:s.layoutColumn,bricks:song.rows.flatMap(r=>r.bricks.map(b=>({...b,start:r.startBar+b.start,end:r.startBar+b.end}))).filter(b=>b.start<s.end&&b.end>s.start).map(b=>({...b,start:Math.max(b.start,s.start)-s.start,end:Math.min(b.end,s.end)-s.start})),chords:song.rows.flatMap(r=>r.chords.map(c=>({...c,start:r.startBar+c.start,end:r.startBar+c.end}))).filter(c=>c.start<s.end&&c.end>s.start).map(c=>({...c,start:Math.max(c.start,s.start)-s.start,end:Math.min(c.end,s.end)-s.start}))}));}
function score(){const s=songs[current],form=forms[current],el=$('#score');el.classList.toggle('form-score',form.aligned);el.style.gridTemplateColumns=form.aligned?`repeat(${form.columns},minmax(0,1fr))`:'';el.style.minWidth=form.aligned?Math.max(1,form.columns/form.sections[0].bars)*300+'px':'';el.innerHTML=(form.aligned?sliceFormRows(s,form):s.rows).map((r,i)=>rowHTML(r,s,i)).join('');}

function rawlOptions(){return {song:performance?.previewSong||songs[current],performance,brickMap,form:routeKind==='song'?forms[current]:null,selected,mutedVoices:player.mutedVoices,onSeek:beat=>player.seek(beat),onNote:note=>player.audition(note)};}
function ensureRawl(){if(!performance)return;if(rawl)rawl.update(rawlOptions());else{rawl=mountRawlView(rawlElement(),rawlOptions());rawl.setPosition(currentBeat);}}
function setView(mode){
 view=mode;localStorage.setItem('insights-view',mode);$('#analysis').hidden=mode!=='analysis';$('#rawl-view').hidden=mode!=='rawl';$('#source-view').hidden=mode!=='source';$('#transport').hidden=mode==='source';
 $('#digital').setAttribute('aria-pressed',mode==='analysis');$('#notation-view').setAttribute('aria-pressed',mode==='rawl');$('#original').setAttribute('aria-pressed',mode==='source');
 if(mode==='rawl')ensureRawl();if(mode==='source'&&(player.state==='playing'||player.state==='loading'))player.pause();
}
function fetchPerformance(index){if(!cache.has(index))cache.set(index,fetch(`./data/performances/${pad(index)}.json`).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}).catch(e=>{cache.delete(index);throw e;}));return cache.get(index);}
function closeMenu(){document.body.classList.remove('menu-open');$('#menu').setAttribute('aria-expanded','false');$('#shade').hidden=true;}
function displayedRowAt(beat){const parent=routeKind==='brick'||view==='rawl'?rawlElement():$('#score');return [...parent.querySelectorAll('[data-start][data-end]')].find(el=>beat>=Number(el.dataset.start)&&beat<Number(el.dataset.end));}
function scrollToBeat(beat){requestAnimationFrame(()=>displayedRowAt(beat)?.scrollIntoView({block:'center',behavior:'smooth'}));}

async function openSong(index,params,initial=false){
 restoreTransport();
 const old=current,wasSong=routeKind==='song';current=Math.max(0,Math.min(songs.length-1,index));routeKind='song';currentBrick=null;selected=brickBySlug.get(params.get('brick'))?.name??null;
 document.body.classList.add('song-route');$('#song-heading').hidden=false;
 const s=songs[current];$('#song-view').hidden=false;$('#brick-view').hidden=true;$('#pdf-link').hidden=false;
 $('#rawl-links').innerHTML=rawlLinksHTML(current);$('#rawl-links').hidden=false;$('#title').textContent=s.title;document.title=s.title+' · Insights Roadmaps';$('#position').textContent=`${pad(current+1)} / ${songs.length}`;
 $('#composer').textContent=s.composer||'';$('#measure-count').textContent=s.bars+' bars';$('#meter').textContent=s.meter.join('/');$('#tonic').innerHTML=token('C',0)+' <span>'+esc(s.tonic[1].toLowerCase())+'</span>';
 $('#source-key').innerHTML=token(prettyRoot(s.tonic[0]),pitch(s.tonic[0]))+' '+token('→',-pitch(s.tonic[0]))+' '+token('C',0);
 $('#source-image').src='./source/'+s.image;$('#source-image').alt=s.title;$('#source-page').textContent='PDF · '+s.page;$('#source-download').href='./source/'+s.image;
 $('#pdf-link').href='./source/InsightsRoadmapsConsolidated.pdf#page='+s.page;$('#midi-download').href='./midi/'+pad(current)+'.mid';$('#midi-download').download=s.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.mid';
 $('#previous').disabled=navigationOrder.indexOf(current)===0;$('#next').disabled=navigationOrder.indexOf(current)===navigationOrder.length-1;score();catalog();closeMenu();$('#score-scroll').scrollLeft=0;
 const seek=params.has('beat')?Number(params.get('beat')):null;
 if(wasSong&&old===current&&performance){ensureRawl();setView(view);if(Number.isFinite(seek)){player.seek(seek);scrollToBeat(seek);}return;}
 const gen=++routeGeneration;player.stop();destroyViews();performance=null;currentBeat=null;lastPlaybackRow=-1;$('#play').disabled=true;$('#stop').disabled=true;$('#clipped-status').hidden=true;$('#playback-error').hidden=true;
 $('#rawl-view').textContent='Loading';setView(view);if(!initial)window.scrollTo({top:0,behavior:'instant'});
 try{
  const result=await fetchPerformance(current);if(gen!==routeGeneration||routeKind!=='song')return;performance=result;player.load(result);$('#tempo').value=result.tempo;$('#play').disabled=false;
  for(const id of ['#piano-voice'])$(id).setAttribute('aria-pressed','true');
  const clipped=result.chords.filter(c=>c.clipped).length;$('#clipped-count').textContent=clipped;$('#clipped-status').hidden=!clipped;$('#rawl-view').textContent='';
  setView(view);if(Number.isFinite(seek)){player.seek(seek);scrollToBeat(seek);}
 }catch(error){if(gen!==routeGeneration)return;console.error(error);$('#rawl-view').innerHTML='<span>Unavailable</span> <button id="retry-performance">Retry</button>';$('#retry-performance').onclick=()=>openSong(current,params,true);}
}
function brickLink(b){return '#brick/'+b.slug;}
function standardMatches(matches,b){return matches.map(match=>`<article class="brick-match" data-song="${match.song}"><div class="standard-heading"><a class="standard-title" href="#${pad(match.song)}?brick=${b.slug}&beat=${match.passages[0].start}"><span class="match-number">${pad(match.song+1)}</span>${esc(match.title)}</a>${rawlLinksHTML(match.song)}</div><div class="passages">${match.passages.map(p=>`<a href="#${pad(match.song)}?brick=${b.slug}&beat=${p.start}" title="${Math.floor(p.startBar)+1}–${Math.ceil(p.endBar)}">${Math.floor(p.startBar)+1}–${Math.ceil(p.endBar)}${p.status==='complete'?'':p.status==='partial'?' · Partial':p.status?' · Clipped':''}</a>`).join('')}</div></article>`).join('');}
function activateVariant(item){if(activeVariant===item)return;player.stop();activeVariant=item;rawl=item.controller;performance=item.variant.performance;currentBeat=null;lastPlaybackRow=-1;player.load(performance);$('#tempo').value=performance.tempo;$('#play').disabled=false;$('#midi-download').href=item.variant.midi;$('#midi-download').download=currentBrick.slug+'--'+item.variant.id+'.mid';for(const other of brickViews)other.element.closest('.brick-variant').classList.toggle('active-variant',other===item);$('#piano-voice').setAttribute('aria-pressed','true');}
async function openBricks(slug=null,params=new URLSearchParams()){
 restoreTransport();const gen=++routeGeneration;player.stop();destroyViews();performance=null;routeKind=slug?'brick':'bricks';currentBrick=brickBySlug.get(slug)||null;
 if(currentBrick&&slug!==currentBrick.slug)history.replaceState(null,'','#brick/'+currentBrick.slug+(params.size?'?'+params:''));
 document.body.classList.remove('song-route');$('#song-heading').hidden=true;$('#rawl-links').hidden=true;
 $('#song-view').hidden=true;$('#brick-view').hidden=false;$('#pdf-link').hidden=true;closeMenu();$('#search').value='';
 if(!currentBrick){document.title='Bricks · Insights Roadmaps';$('#brick-view').innerHTML=`<div class="song-eyebrow">${bricks.length} / ${songs.length}</div><h1>Bricks</h1><a class="back-link" href="./atlas.html">Atlas</a><div class="brick-catalog">${bricks.map(b=>`<a class="brick-catalog-row" href="${brickLink(b)}"><span>${esc(b.name)}</span><span>${b.standards.length}</span></a>`).join('')}</div>`;}
 else{const b=currentBrick;document.title=b.name+' · Insights Roadmaps';$('#brick-view').innerHTML=`<a class="back-link" href="#bricks">Bricks</a><h1>${esc(b.name)}</h1><div class="brick-counts"><span>${b.standards.length} <span>standards</span></span><span>${b.passages} <span>passages</span></span></div><div id="brick-preview"><div id="brick-transport"></div><div id="brick-variants">Loading</div></div>`;}
 catalog();window.scrollTo({top:0,behavior:'instant'});if(!currentBrick)return;
 $('#brick-transport').replaceWith(transport);transport.hidden=false;$('#play').disabled=true;$('#stop').disabled=true;$('#clipped-status').hidden=true;$('#playback-error').hidden=true;
 const b=currentBrick;
 try{
  const definitions=await fetch(`./data/brick-variants/${b.slug}.json`).then(r=>{if(!r.ok)throw Error(r.status);return r.json();});if(gen!==routeGeneration||routeKind!=='brick')return;
  $('#brick-variants').innerHTML=definitions.variants.map(v=>`<section class="brick-variant" id="${v.id}"><div class="variant-heading"><h2>Variant ${v.number}</h2><button class="variant-play">Play</button><a href="${v.midi}" download>MIDI</a><a class="variant-source" href="#${pad(v.source.song)}?brick=${b.slug}&beat=${v.source.start}">${esc(v.source.title)} · ${Math.floor(v.source.startBar)+1}–${Math.ceil(v.source.endBar)}</a></div><div class="variant-rawl" aria-label="Rawl notation"></div><div class="brick-matches">${standardMatches(v.standards,b)}</div></section>`).join('')+(definitions.unresolvedStandards.length?`<section class="unresolved-variants"><h2>Unresolved</h2><div class="brick-matches">${standardMatches(definitions.unresolvedStandards,b)}</div></section>`:'');
  for(const variant of definitions.variants){const card=document.getElementById(variant.id),item={variant,element:card.querySelector('.variant-rawl'),button:card.querySelector('.variant-play'),controller:null};item.controller=mountRawlView(item.element,{song:variant.previewSong,performance:variant.performance,brickMap,onSeek:beat=>{activateVariant(item);player.seek(beat);},onNote:note=>player.audition(note),mutedVoices:[]});item.button.onclick=()=>{activateVariant(item);player.toggle();};brickViews.push(item);}
  const song=Number(params.get('song')),beat=Number(params.get('beat'));const wanted=params.has('song')?brickViews.find(item=>item.variant.standards.some(m=>m.song===song&&m.passages.some(p=>beat>=p.start&&beat<p.end))):null;
  if(brickViews.length)activateVariant(wanted??brickViews[0]);if(wanted)requestAnimationFrame(()=>wanted.element.closest('.brick-variant').scrollIntoView({block:'start'}));
 }catch(error){if(gen!==routeGeneration)return;console.error(error);$('#brick-variants').textContent='Unavailable';}
}
function route(initial=false){const [path,query='']=location.hash.slice(1).split('?');if(path==='bricks')return openBricks();if(path.startsWith('brick/'))return openBricks(path.slice(6),new URLSearchParams(query));const index=Number(path);void openSong(Number.isInteger(index)&&index>=0&&index<songs.length?index:0,new URLSearchParams(query),initial);}
$('#search').addEventListener('input',catalog);$('#previous').onclick=()=>location.hash=pad(navigationOrder[navigationOrder.indexOf(current)-1]);$('#next').onclick=()=>location.hash=pad(navigationOrder[navigationOrder.indexOf(current)+1]);

$('#digital').onclick=()=>setView('analysis');$('#notation-view').onclick=()=>setView('rawl');$('#original').onclick=()=>setView('source');
$('#play').onclick=()=>player.toggle();$('#stop').onclick=()=>player.stop();$('#tempo').onchange=e=>{player.setTempo(e.target.value);e.target.value=player.tempo;};
for(const [id,voice]of [['#piano-voice',0]])$(id).onclick=()=>{const muted=$(id).getAttribute('aria-pressed')==='true';player.setMuted(voice,muted);$(id).setAttribute('aria-pressed',String(!muted));if(rawl)rawl.update(rawlOptions());};
$('#midi-download').onclick=e=>{if(!performance||player.tempo===performance.tempo)return;e.preventDefault();const url=URL.createObjectURL(new Blob([encodeMidi({...performance,tempo:player.tempo})],{type:'audio/midi'})),a=document.createElement('a');a.href=url;a.download=$('#midi-download').download;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#menu').onclick=()=>{const on=document.body.classList.toggle('menu-open');$('#menu').setAttribute('aria-expanded',on);$('#shade').hidden=!on;};$('#shade').onclick=closeMenu;

$('#data-download').onclick=()=>{const s=structuredClone(songs[current]),tonic=s.tonic[0];for(const row of s.rows){for(const c of row.chords)c.symbol=transposeChord(c.symbol,tonic);for(const k of row.keys)k.root=transposeRoot(k.root,tonic);for(const j of row.joins){j.from=transposeRoot(j.from,tonic);j.to=transposeRoot(j.to,tonic);}}s.originalTonic=s.tonic;s.tonic=['C',s.tonic[1]];const url=URL.createObjectURL(new Blob([JSON.stringify(s,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=s.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('hashchange',()=>route());window.addEventListener('beforeunload',()=>{player.destroy();destroyViews();destroyHarmony();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();$('.join-detail')?.remove();}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();if(innerWidth<=760&&!document.body.classList.contains('menu-open'))$('#menu').click();$('#search').focus();}if(e.code==='Space'&&routeKind!=='bricks'&&performance&&!['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();void player.toggle();}});
route(true);
