import {brickNameHTML} from './brick-labels.js';
import {mergePDFMelody,shiftedChanges} from './pdf-melody.js';
import {groupAABA} from './aaba-groups.js';
import {findTitleMatch,highlightTitle,normalizeSearch} from './title-search.js';
import {transposeRoot,transposeChord,prettyRoot,chordParts,chordDisplay,roman,pitch,mod} from './harmony.mjs';
import {RAWL_COLORS,colorIndex} from './rawl-colors.mjs';
import {songModulations,modulationAt,recolorModulation,recolorBoundary} from './modulations.js';
import {mountRawlView,mountRawlMeasureHeader,bindHarmonyHover} from './rawl-view.js';
import {createPlayer,encodeMidi,bindTempoKeys,DEFAULT_TEMPO} from './audio-player.js';
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const [data,brickData,formData,rawlLinkData,modulationData,cadenceData,performanceStyleData]=await Promise.all(['./data/standards.json','./data/bricks.json','./data/forms.json','./data/rawl-links.json','./data/modulations.json','./data/cadences.json','./data/performance-styles.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error(r.status);return r.json();})));
const forms=formData.forms,familyOrder=['12-bar blues','Rhythm-like','AABA','ABAC','ABAB','AABC','ABAA','ABCA','AAAA','Other'];
const songs=data.songs,modulationMap=modulationData.changes,bricks=brickData.bricks,brickMap=new Map(bricks.flatMap(b=>[b.name,...b.aliases].map(name=>[name,b]))),brickBySlug=new Map(bricks.flatMap(b=>[b.slug,...b.aliasSlugs].map(slug=>[slug,b])));
const brickGroups=brickData.groups??[{type:'Bricks',slugs:bricks.map(b=>b.slug)}];
const hasPDF=song=>Number.isInteger(song?.page)&&!!song.image,standards=songs.filter(hasPDF),canonicalIndex=index=>songs[index].arrangementOf??index;
const melodyStandards=new Set(data.melodyStandards??[]);
const melodyCharts=new Set([...(data.melodyCharts??[]),...songs.filter(song=>song.melodyId).map(song=>song.index)]);
const preferredArrangement=index=>hasPDF(songs[index])?index:hasPDF(songs[canonicalIndex(index)])?canonicalIndex(index):standards[0].index;
const melodyClass=index=>melodyCharts.has(index)?'':' no-melody';
const destroyHarmony=bindHarmonyHover(document);
let current=0,currentBrick=null,routeKind='song',view=['analysis','source','rawl'].includes(localStorage.getItem('insights-view'))?localStorage.getItem('insights-view'):'rawl';
let aabaGrouping=localStorage.getItem('insights-aaba-grouping')??'b-key';
let melodyVisible=localStorage.getItem('insights-melody')!=='hidden';
let rawl=null,performance=null,currentBeat=null,selected=null,routeGeneration=0,detailTimer,lastPlaybackRow=-1;
const transport=$('#transport'),songRawl=$('#rawl-view');
let analysisHeaders=[];
let brickViews=[],activeVariant=null,recolorSelection=null,recolorMeasure=null,recolorPreview=null,recolorSaved=null;
const rawlElement=()=>routeKind==='brick'?activeVariant?.element??$('#brick-variants'):songRawl;
function destroyAnalysisHeaders(){analysisHeaders.forEach(header=>header.destroy());analysisHeaders=[];}
function destroyViews(){destroyAnalysisHeaders();if(brickViews.length)brickViews.forEach(v=>v.controller.destroy());else rawl?.destroy();brickViews=[];activeVariant=null;rawl=null;}
function restoreTransport(){$('#reader-tools').append(transport);}
const cache=new Map(),pad=n=>String(n).padStart(3,'0');
const playIcon=pause=>`<svg class="lucide lucide-${pause?'pause':'play'}" viewBox="0 0 24 24" aria-hidden="true">${pause?'<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>':'<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>'}</svg>`;
const token=(text,semitones)=>`<span class="degree-color" data-degree="${colorIndex(semitones)}">${esc(text)}</span>`;
const externalIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M21 14v7H3V3h7"/></svg>';
function rawlLinksHTML(index){const links=rawlLinkData.standards[canonicalIndex(index)]??[];if(!links.length)return '';const anchor=l=>`<a href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.title)}">${esc(l.title)} ${externalIcon}</a>`;return links.length===1?`<a class="rawl-rendition" href="${esc(links[0].url)}" target="_blank" rel="noopener" title="${esc(links[0].title)}">Rawl ${externalIcon}</a>`:`<details class="rawl-renditions"><summary>Rawl ${links.length}</summary><div>${links.map(anchor).join('')}</div></details>`;}
const clock=seconds=>Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0');
const player=createPlayer({defaultTempo:DEFAULT_TEMPO,onState:state=>{
 $('#header-play').innerHTML=playIcon(state==='playing'||state==='loading');$('#header-play').disabled=!performance||routeKind!=='song';
 $('#play').textContent=state==='playing'?'Pause':state==='loading'?'Loading':'Play';$('#play').setAttribute('aria-label',$('#play').textContent);$('#play').setAttribute('aria-busy',String(state==='loading'));$('#header-play').setAttribute('aria-label',$('#play').textContent);$('#header-play').title=$('#play').textContent;$('#header-play').setAttribute('aria-busy',String(state==='loading'));
 for(const item of brickViews){const running=item===activeVariant&&state==='playing',label=running?'Pause':item===activeVariant&&state==='loading'?'Loading':'Play';item.button.innerHTML=playIcon(running);item.button.setAttribute('aria-label',label);item.button.title=label;item.button.setAttribute('aria-busy',String(item===activeVariant&&state==='loading'));}
 $('#stop').disabled=!performance||(state==='idle'&&player.position===0);$('#playback-error').hidden=state!=='error';
},onPosition:beat=>{
 currentBeat=beat;rawl?.setPosition(beat);$('#playback-time').textContent=clock((beat??player.position)*60/player.tempo);
 for(const c of $('#score').querySelectorAll('[data-chord-start]'))c.classList.toggle('sounding',beat!==null&&beat>=Number(c.dataset.chordStart)&&beat<Number(c.dataset.chordEnd));
 if(player.state==='playing'&&performance&&beat!==null){const el=displayedRowAt(beat);if(el&&el!==lastPlaybackRow){lastPlaybackRow=el;const box=el.getBoundingClientRect();if(box.bottom>innerHeight||box.top<70)el.scrollIntoView({block:'nearest',behavior:'smooth'});}}
},onError:error=>{console.error(error);$('#playback-error').hidden=false;}});
function catalog(){
 const q=normalizeSearch($('#search').value).trim().replace(/\s+/g,' '),isBricks=routeKind!=='song';
 const titleMatches=new Map();
 const terms=q.split(' ');
 let list;
 if(isBricks){
  list=bricks.filter(item=>normalizeSearch([item.name,...item.aliases].join(' ')).includes(q));
 }else if(q){
  list=standards.filter(song=>{
   const match=findTitleMatch(song.title,q,terms);
   if(match){
    titleMatches.set(song,match);
    return false;
   }
   const brickNames=song.bricks.flatMap(name=>[name,brickMap.get(name)?.name??name]);
   return normalizeSearch([song.title,...brickNames].join(' ')).includes(q);
  });
 }else{
  list=standards;
 }
 const ranked=[...titleMatches.keys()].sort((a,b)=>titleMatches.get(a).rank-titleMatches.get(b).rank);
 $('#catalog-label').textContent=isBricks?'BRICKS':'SONGS';$('#songs').setAttribute('aria-label',isBricks?'Bricks':'Songs');$('#count').textContent=ranked.length+list.length;
 const link=item=>isBricks?`<a class="song-link${currentBrick?.slug===item.slug?' active':''}" href="#brick/${item.slug}"><span class="number">${item.standardCount??item.standards.length}</span><span>${brickNameHTML(item.name,item)}</span></a>`:`<a class="song-link${melodyClass(preferredArrangement(item.index))}${item.index===canonicalIndex(current)?' active':''}" data-standard="${item.index}" href="#${pad(preferredArrangement(item.index))}" ${item.index===canonicalIndex(current)?'aria-current="page"':''}><span>${highlightTitle(item.title,titleMatches.get(item),esc)}</span></a>`;
 const grouped=isBricks?brickGroups.map(group=>{const members=group.slugs.map(slug=>list.find(brick=>brick.slug===slug)).filter(Boolean);return members.length?`<section class="catalog-family brick-type"><h2>${brickNameHTML(group.type)} <span>${members.length}</span></h2>${members.map(link).join('')}</section>`:'';}).join(''):familyOrder.map(family=>{const members=list.filter(song=>forms[song.index].family===family);if(!members.length)return '';if(family!=='AABA')return `<section class="catalog-family"><h2>${esc(family)} <span>${members.length}</span></h2>${members.map(link).join('')}</section>`;const allowed=new Set(members.map(song=>song.index)),groups=groupAABA(standards,forms,brickMap,aabaGrouping).map(group=>({...group,songs:group.songs.filter(song=>allowed.has(song.index))})).filter(group=>group.songs.length);return `<section class="catalog-family aaba-family"><h2>AABA <span>${members.length}</span><select class="aaba-grouping" aria-label="AABA grouping"><option value="b-key" ${aabaGrouping==='b-key'?'selected':''}>B key</option><option value="a-brick" ${aabaGrouping==='a-brick'?'selected':''}>A brick</option></select></h2>${groups.map(group=>`<section class="catalog-subgroup"><h3 ${Number.isFinite(group.degree)?`style="color:${RAWL_COLORS[group.degree].background}"`:''}><span class="subgroup-name">${brickNameHTML(group.label,aabaGrouping==='a-brick'?brickMap.get(group.label):undefined)}</span><span class="subgroup-count">${group.songs.length}</span></h3>${group.songs.map(link).join('')}</section>`).join('')}</section>`;}).join('');
 const titleResults=ranked.length?`<div class="title-matches">${ranked.map(link).join('')}</div>`:'';
 $('#songs').innerHTML=(titleResults+grouped)||'<div class="empty">No matches</div>';
 $('#songs-nav').href='#'+pad(current);$('#songs-nav').setAttribute('aria-current',isBricks?'false':'page');$('#bricks-nav').setAttribute('aria-current',isBricks?'page':'false');
}
function at(c,scale,prefix=0){return `left:${(c.start+prefix)/(scale+prefix)*100}%;width:${Math.max(0,c.end-c.start)/(scale+prefix)*100}%`;}
function rowHTML(row,song,rowIndex){
 const scale=row.section?row.bars:song.columns,tonic=song.tonic[0],barBeats=song.meter[0]*4/song.meter[1],offset=performance?.song===song.index?performance.clockOffset??0:0,prefix=rowIndex===0?offset/barBeats:0;
 const grid=row.section?`grid-row:${row.layoutRow+1};grid-column:${row.layoutColumn+1} / span ${row.bars};`:'',pickup=offset?(rowIndex===0?`width:calc(100% + ${offset/(scale*barBeats)*100}%);--pickup-label-offset:${offset/(scale*barBeats+offset)*100}%;`:`width:100%;margin-left:${offset/(scale*barBeats)*100}%;`):'';
 let html=`<div class="score-row" data-row="${rowIndex}" data-start="${rowIndex===0?0:row.startBar*barBeats+offset}" data-end="${(row.startBar+row.bars)*barBeats+offset}" ${row.section?`data-section="${row.section}"`:''} style="${grid}${pickup}" aria-label="${row.startBar+1}–${row.startBar+row.bars}"><div class="analysis-measures" style="width:${(row.bars+prefix)/(scale+prefix)*100}%"></div>`;
 for(const b of row.bricks)if(b.name)html+=`<a data-brick="${brickMap.get(b.name).slug}" data-brick-start="${(row.startBar+b.start)*barBeats+offset}" data-brick-end="${(row.startBar+b.end)*barBeats+offset}" class="brick${selected===brickMap.get(b.name).name?' selected-brick':''}" style="${at(b,scale,prefix)}" title="${esc(b.name)}" href="#brick/${brickMap.get(b.name).slug}?song=${song.index}&beat=${(row.startBar+b.start)*barBeats}">${brickNameHTML(brickMap.get(b.name).name,brickMap.get(b.name))}</a>`;
 html+='<div class="analysis-harmony harmony-stripe"><div class="harmony-chords">';
 const cells=row.chords.map(c=>{const symbol=transposeChord(c.symbol,tonic),parts=chordParts(symbol),base=modulationAt(displayChanges(song.index),(row.startBar+c.start)*barBeats+offset).root,degree=mod(pitch(symbol)-pitch(base)),rn=roman(symbol,base);return {c,symbol,parts,display:chordDisplay(symbol,base),degree,rn};});
 for(const {c,symbol,parts,display,degree}of cells)html+=`<div class="chord harmony-cell${c.clipped?' uncertain':''}" data-degree="${degree}" data-chord-start="${(row.startBar+c.start)*barBeats+offset}" data-chord-end="${(row.startBar+c.end)*barBeats+offset}" style="${at(c,scale,prefix)};color:${RAWL_COLORS[degree].background}" title="${esc(symbol)}"><span class="root">${esc(display.root)}</span><sup>${display.figures.map(figure=>`<span class="chord-figure" ${figure.degree===null?'':`data-degree="${figure.degree}"`} style="color:${figure.degree===null?'#888':RAWL_COLORS[figure.degree].background}">${esc(figure.text)}</span>`).join('')}</sup>${display.bass?`<span class="chord-slash">/</span><span class="chord-bass" data-degree="${display.bass.degree}" style="color:${RAWL_COLORS[display.bass.degree].background}">${esc(display.bass.text)}</span>`:''}</div>`;
 html+='</div><div class="harmony-rns">';
 for(const {c,rn,display,degree}of cells)html+=`<div class="rn harmony-cell" data-degree="${degree}" style="${at(c,scale,prefix)};color:${RAWL_COLORS[degree].background}" title="${esc(rn)}">${display.bass?`${esc(rn.slice(0,rn.lastIndexOf('/')))}<span class="chord-slash">/</span><span class="chord-bass" data-degree="${display.bass.degree}" style="color:${RAWL_COLORS[display.bass.degree].background}">${esc(rn.slice(rn.lastIndexOf('/')+1))}</span>`:esc(rn)}</div>`;
 html+='</div></div>';
 return html+'</div>';
}
function sliceFormRows(song,form){return (form.layoutSections??form.sections).map(s=>({startBar:s.start,bars:s.bars,section:s.label,layoutRow:s.layoutRow,layoutColumn:s.layoutColumn,bricks:song.rows.flatMap(r=>r.bricks.map(b=>({...b,start:r.startBar+b.start,end:r.startBar+b.end}))).filter(b=>b.start<s.end&&b.end>s.start).map(b=>({...b,start:Math.max(b.start,s.start)-s.start,end:Math.min(b.end,s.end)-s.start})),chords:song.rows.flatMap(r=>r.chords.map(c=>({...c,start:r.startBar+c.start,end:r.startBar+c.end}))).filter(c=>c.start<s.end&&c.end>s.start).map(c=>({...c,start:Math.max(c.start,s.start)-s.start,end:Math.min(c.end,s.end)-s.start}))}));}
function score(){
 destroyAnalysisHeaders();
 const s=songs[current],form=forms[current],aligned=form.layoutAligned??form.aligned,el=$('#score'),rows=aligned?sliceFormRows(s,form):s.rows,barBeats=s.meter[0]*4/s.meter[1],offset=performance?.song===current?performance.clockOffset??0:0;
 el.classList.toggle('form-score',aligned);el.style.gridTemplateColumns=aligned?`repeat(${form.layoutColumns??form.columns},minmax(0,1fr))`:'';el.style.minWidth=aligned?Math.max(1,(form.layoutColumns??form.columns)/(form.layoutSections??form.sections)[0].bars)*300+'px':'';
 el.innerHTML=rows.map((r,i)=>rowHTML(r,s,i)).join('');
 analysisHeaders=[...el.querySelectorAll('.analysis-measures')].map((element,i)=>mountRawlMeasureHeader(element,{row:{start:i===0?0:rows[i].startBar*barBeats+offset,end:(rows[i].startBar+rows[i].bars)*barBeats+offset},height:42,tonic:0,changes:displayChanges(current),barBeats,beatBeats:4/s.meter[1],measureMap:offset?performance.measureMap:s.measureMap,phraseStarts:form.phraseStarts?.map(beat=>beat+offset),selectedMeasure:recolorMeasure,onMeasureSelect:performance?selectRecolor:undefined}));
}


function baseChanges(index=current){return shiftedChanges(modulationMap[index],performance?.song===index?performance.clockOffset??0:0);}
function displayChanges(index=current){return index===current?(recolorPreview??recolorSaved??baseChanges(index)):baseChanges(index);}
function redrawColors(){score();if(rawl)ensureRawl();}
function selectRecolor(beat){recolorMeasure=recolorMeasure===beat?null:beat;recolorSelection=recolorMeasure===null?null:recolorBoundary(recolorSaved??baseChanges(),beat,performance.barBeats,performance.measureMap);recolorPreview=null;redrawColors();}
function previewTonic(note){if(routeKind!=='song'||recolorSelection===null)return;recolorPreview=note?recolorModulation(recolorSaved??baseChanges(),recolorSelection,note.pitch):null;redrawColors();}
function chooseNote(note){if(routeKind==='song'&&recolorSelection!==null){recolorSaved=recolorModulation(recolorSaved??baseChanges(),recolorSelection,note.pitch);recolorSelection=null;recolorMeasure=null;recolorPreview=null;redrawColors();return;}void player.audition(note);}
function pulsePassage(beat){
 const slug=brickBySlug.get(new URLSearchParams(location.hash.split('?')[1]??'').get('brick'))?.slug;if(!slug||!Number.isFinite(beat))return;
 const generation=routeGeneration;let attempts=0;
 const flash=()=>{if(generation!==routeGeneration||routeKind!=='song')return;const parent=view==='analysis'?$('#score'):$('#rawl-view');let found=false;for(const label of parent.querySelectorAll('[data-brick]')){if(label.dataset.brick!==slug||beat<Number(label.dataset.brickStart)-1e-7||beat>=Number(label.dataset.brickEnd)-1e-7)continue;found=true;const row=label.closest('.rawln-row,.score-row');if(!row)continue;const el=document.createElement('div');el.className='brick-splash';el.style.left=label.style.left;el.style.width=label.style.width;row.append(el);el.addEventListener('animationend',()=>el.remove(),{once:true});setTimeout(()=>el.remove(),1800);}if(!found&&++attempts<60)requestAnimationFrame(flash);};requestAnimationFrame(flash);
}

function rawlOptions(){return {song:performance?.previewSong||songs[current],performance:{...performance,changes:routeKind==='song'?displayChanges():performance.changes,notes:melodyVisible?performance.notes:performance.notes.filter(n=>n.voice!==1)},brickMap,form:routeKind==='song'?forms[current]:null,selected,mutedVoices:player.mutedVoices,onSeek:beat=>player.seek(beat),onNote:chooseNote,onNoteHover:routeKind==='song'?previewTonic:undefined,onMeasureSelect:routeKind==='song'?selectRecolor:undefined,selectedMeasure:recolorMeasure};}
function ensureRawl(){if(!performance)return;if(rawl)rawl.update(rawlOptions());else{rawl=mountRawlView(rawlElement(),rawlOptions());rawl.setPosition(currentBeat);}}
function setView(mode){
 if(mode!=='rawl'&&recolorSelection!==null){recolorSelection=null;recolorMeasure=null;recolorPreview=null;redrawColors();}view=mode;localStorage.setItem('insights-view',mode);$('#analysis').hidden=mode!=='analysis';$('#rawl-view').hidden=mode!=='rawl';$('#source-view').hidden=mode!=='source';$('#transport').hidden=mode==='source';
 $('#digital').setAttribute('aria-pressed',mode==='analysis');$('#notation-view').setAttribute('aria-pressed',mode==='rawl');$('#original').setAttribute('aria-pressed',mode==='source');
 if(mode==='analysis')score();if(mode==='rawl')ensureRawl();if(mode==='source'&&(player.state==='playing'||player.state==='loading'))player.pause();
}
function melodyControls(){const available=routeKind==='song'&&performance?.notes.some(note=>note.voice===1);$('#melody-voice').hidden=!available;$('#melody-voice').setAttribute('aria-pressed',String(melodyVisible));player.setMuted(1,!melodyVisible);$('#performance-feel').hidden=!available;$('#performance-feel').textContent=performance?.playbackStyle?.feel==='straight'?'Straight':'Swing 67%';$('#melody-source').hidden=!available||!performance?.melody?.source;$('#melody-source').href=performance?.melody?.source??'';}
function fetchPerformance(index){if(!cache.has(index))cache.set(index,Promise.all([`./data/performances/${pad(index)}.json`,...(data.pdfMelodies?.[index]?[data.pdfMelodies[index].url]:[])].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error(r.status);return r.json();}))).then(([original,overlay])=>mergePDFMelody(original,overlay)).catch(e=>{cache.delete(index);throw e;}));return cache.get(index);}
function closeMenu(){document.body.classList.remove('menu-open');$('#menu').setAttribute('aria-expanded','false');$('#shade').hidden=true;}
function displayedRowAt(beat){const parent=routeKind==='brick'||view==='rawl'?rawlElement():$('#score');return [...parent.querySelectorAll('[data-start][data-end]')].find(el=>beat>=Number(el.dataset.start)&&beat<Number(el.dataset.end));}
function scrollToBeat(beat){requestAnimationFrame(()=>displayedRowAt(beat)?.scrollIntoView({block:'center',behavior:'smooth'}));}

async function openSong(index,params,initial=false){
 restoreTransport();
 const old=current,wasSong=routeKind==='song';if(!wasSong||old!==index){recolorSelection=null;recolorMeasure=null;recolorPreview=null;recolorSaved=null;}current=Math.max(0,Math.min(songs.length-1,index));routeKind='song';if(params.has('brick'))view='rawl';currentBrick=null;selected=brickBySlug.get(params.get('brick'))?.name??null;
 document.body.classList.remove('brick-route');document.body.classList.add('song-route');$('#midi-download').hidden=false;$('#play').hidden=false;$('#song-heading').hidden=false;
 const s=songs[current],parent=canonicalIndex(current),arrangements=songs.filter(song=>hasPDF(song)&&(song.index===parent||song.arrangementOf===parent));$('#arrangement').hidden=arrangements.length<2;$('#arrangement').innerHTML=arrangements.map(song=>`<option value="${song.index}">${song.image?'Roadmap':esc((song.source?.collection??'RealBook')+(song.source?.version?' '+song.source.version:''))}</option>`).join('');$('#arrangement').value=String(current);$('#song-view').hidden=false;$('#brick-view').hidden=true;$('#pdf-link').hidden=false;
 $('#rawl-links').innerHTML=rawlLinksHTML(current);$('#rawl-links').hidden=false;$('#title').textContent=s.title;document.title=s.title+' · Insights Roadmaps';
 $('#composer').textContent=s.composer||'';$('#measure-count').textContent=(s.sourceFullMeasureCount??(s.sourceMeasureCount?s.sourceMeasureCount-(s.pickupBeats>0?1:0):s.bars))+' bars';$('#meter').textContent=s.meter.join('/');$('#tonic').innerHTML=token('C',0)+' <span>'+esc(s.tonic[1].toLowerCase())+'</span>';
 $('#source-key').innerHTML=token(prettyRoot(s.tonic[0]),pitch(s.tonic[0]))+' '+token('→',-pitch(s.tonic[0]))+' '+token('C',0);
 $('#source-image').hidden=!s.image;$('#source-encoded').hidden=!!s.image;if(s.image){$('#source-image').src='./source/'+s.image;$('#source-image').alt=s.title;}else{$('#source-encoded').textContent=typeof s.encodedChanges==='string'?s.encodedChanges:s.rows.map(row=>row.chords.map(c=>c.symbol).join(' ')).join(' |\n');}$('#source-page').textContent=s.page?'PDF · '+s.page:(s.source?.format??'Leadsheet');$('#source-download').textContent=s.image?'PNG':'Source';$('#source-download').href=s.image?'./source/'+s.image:(s.source?.rawUrl??s.source?.url??s.leadsheet);$('#source-credit').textContent=s.image?'Impro-Visor 5.03':(s.source?.title??'Source');$('#source-credit').href=s.image?'./source/InsightsRoadmapsConsolidated.pdf':(s.source?.url??s.leadsheet);
 $('#pdf-link').hidden=!s.page;$('#pdf-link').href='./source/InsightsRoadmapsConsolidated.pdf#page='+s.page;$('#midi-download').href=data.pdfMelodies?.[current]?.midi??'./midi/'+pad(current)+'.mid';$('#midi-download').download=s.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.mid';
 score();catalog();closeMenu();$('#score-scroll').scrollLeft=0;
 const seek=params.has('beat')?Number(params.get('beat')):null;
 if(wasSong&&old===current&&performance){melodyControls();ensureRawl();setView(view);if(Number.isFinite(seek)){player.stop();scrollToBeat(seek+(performance.clockOffset??0));pulsePassage(seek+(performance.clockOffset??0));}return;}
 const gen=++routeGeneration;player.stop();destroyViews();performance=null;currentBeat=null;lastPlaybackRow=-1;$('#header-play').disabled=true;$('#play').disabled=true;$('#stop').disabled=true;$('#clipped-status').hidden=true;$('#playback-error').hidden=true;
 $('#rawl-view').textContent='Loading';setView(view);if(!initial)window.scrollTo({top:0,behavior:'instant'});
 try{
  const result=await fetchPerformance(current);if(gen!==routeGeneration||routeKind!=='song')return;performance={...result,playbackStyle:performanceStyleData.styles[current]};player.load(performance);melodyControls();score();$('#tempo').value=player.tempo;$('#header-play').disabled=false;$('#play').disabled=false;
  for(const id of ['#piano-voice'])$(id).setAttribute('aria-pressed','true');
  const clipped=result.chords.filter(c=>c.clipped).length;$('#clipped-count').textContent=clipped;$('#clipped-status').hidden=!clipped;$('#rawl-view').textContent='';
  setView(view);if(Number.isFinite(seek)){player.stop();scrollToBeat(seek+(performance.clockOffset??0));pulsePassage(seek+(performance.clockOffset??0));}
 }catch(error){if(gen!==routeGeneration)return;console.error(error);$('#rawl-view').innerHTML='<span>Unavailable</span> <button id="retry-performance">Retry</button>';$('#retry-performance').onclick=()=>openSong(current,params,true);}
}
function standardMatches(matches,b){return matches.map(match=>`<div class="brick-match" data-song="${match.song}"><a class="standard-title${melodyClass(match.song)}" href="#${pad(match.song)}?brick=${b.slug}&beat=${match.passages[0].start}">${esc(match.title)}</a></div>`).join(', ');}
function activateVariant(item){if(activeVariant===item)return;player.stop();activeVariant=item;rawl=item.controller;performance=item.variant.performance;currentBeat=null;lastPlaybackRow=-1;player.load(performance);$('#tempo').value=player.tempo;$('#play').disabled=false;$('#midi-download').href=item.variant.midi;$('#midi-download').download=currentBrick.slug+'--'+item.variant.id+'.mid';for(const other of brickViews)other.element.closest('.brick-variant').classList.toggle('active-variant',other===item);$('#piano-voice').setAttribute('aria-pressed','true');}
async function openBrick(slug,params=new URLSearchParams()){
 restoreTransport();const gen=++routeGeneration;player.stop();destroyViews();performance=null;routeKind='brick';currentBrick=brickBySlug.get(slug)||null;
 if(!currentBrick){location.replace('./bricks.html');return;}
 if(currentBrick&&slug!==currentBrick.slug)history.replaceState(null,'','#brick/'+currentBrick.slug+(params.size?'?'+params:''));
 document.body.classList.add('brick-route');document.body.classList.remove('song-route');$('#midi-download').hidden=true;$('#play').hidden=true;$('#song-heading').hidden=true;$('#rawl-links').hidden=true;
 $('#melody-voice').hidden=true;$('#performance-feel').hidden=true;$('#song-view').hidden=true;$('#brick-view').hidden=false;$('#pdf-link').hidden=true;closeMenu();$('#search').value='';
 const b=currentBrick;document.title=b.name+' · Insights Roadmaps';$('#brick-view').innerHTML=`<a class="back-link" href="./bricks.html">Bricks</a><div class="brick-heading"><h1>${brickNameHTML(b.name,b)}</h1><div class="brick-definition" data-variant="${cadenceData.summaries[b.slug]?.variantId??''}">${(cadenceData.summaries[b.slug]?.tokens??[]).map(t=>`<span data-degree="${t.degree}" style="color:${RAWL_COLORS[t.degree].background}">${esc(t.text)}</span>`).join('<span class="definition-separator"> </span>')}</div></div>${b.corkNames?.length?`<div class="brick-cork"><span>Cork names</span> ${b.corkNames.map(name=>brickNameHTML(name,b)).join(', ')}</div>`:''}<div class="brick-counts"><span>${b.standardCount??b.standards.length} <span>standards</span></span><span>${b.passages} <span>passages</span></span></div><div id="brick-preview"><div id="brick-transport"></div><div id="brick-variants">Loading</div></div>`;
 catalog();window.scrollTo({top:0,behavior:'instant'});
 $('#brick-transport').replaceWith(transport);transport.hidden=false;$('#play').disabled=true;$('#stop').disabled=true;$('#clipped-status').hidden=true;$('#playback-error').hidden=true;
 try{
  const definitions=await fetch(`./data/brick-variants/${b.slug}.json`).then(r=>{if(!r.ok)throw Error(r.status);return r.json();});if(gen!==routeGeneration||routeKind!=='brick')return;
  $('#brick-variants').innerHTML=definitions.variants.map(v=>`<section class="brick-variant" id="${v.id}" style="width:${Math.max(300,v.performance.beats/v.performance.barBeats*100+26)}px"><div class="variant-score"><button class="variant-play" aria-label="Play" title="Play">${playIcon(false)}</button><div class="variant-rawl" aria-label="Rawl notation"></div></div><div class="brick-matches">${standardMatches(v.standards,b)}</div></section>`).join('')+(definitions.unresolvedStandards.length?`<section class="unresolved-variants"><h2>Unresolved</h2><div class="brick-matches">${standardMatches(definitions.unresolvedStandards,b)}</div></section>`:'');
  for(const variant of definitions.variants){const card=document.getElementById(variant.id),item={variant,element:card.querySelector('.variant-rawl'),button:card.querySelector('.variant-play'),controller:null};item.controller=mountRawlView(item.element,{song:variant.previewSong,performance:variant.performance,brickMap,measureWidth:100,continuous:true,compact:true,onSeek:beat=>{activateVariant(item);player.seek(beat);},onNote:note=>player.audition(note),mutedVoices:[]});item.button.onclick=()=>{activateVariant(item);player.toggle();};brickViews.push(item);}
  const song=Number(params.get('song')),beat=Number(params.get('beat'));const wanted=params.has('song')?brickViews.find(item=>item.variant.standards.some(m=>m.song===song&&m.passages.some(p=>beat>=p.start&&beat<p.end))):brickViews.find(item=>item.variant.id===params.get('variant'))??null;
  if(brickViews.length)activateVariant(wanted??brickViews[0]);if(wanted)requestAnimationFrame(()=>wanted.element.closest('.brick-variant').scrollIntoView({block:'start'}));
 }catch(error){if(gen!==routeGeneration)return;console.error(error);$('#brick-variants').textContent='Unavailable';}
}
export function route(initial=false,navigate=url=>location.replace(url)){const [path,query='']=location.hash.slice(1).split('?');if(path==='bricks')return navigate('./bricks.html');if(path.startsWith('brick/'))return openBrick(path.slice(6),new URLSearchParams(query));const requested=path===''?0:Number(path),index=Number.isInteger(requested)&&requested>=0&&requested<songs.length?requested:0,visible=preferredArrangement(index);if(index!==visible)history.replaceState(null,'','#'+pad(visible));void openSong(visible,new URLSearchParams(index===visible?query:''),initial);}
$('#arrangement').onchange=e=>location.hash=pad(Number(e.target.value));
$('#songs').addEventListener('change',event=>{if(event.target.matches('.aaba-grouping')){aabaGrouping=event.target.value;localStorage.setItem('insights-aaba-grouping',aabaGrouping);catalog();}});
$('#search').addEventListener('input',()=>{catalog();$('#songs').scrollTop=0;});

$('#digital').onclick=()=>setView('analysis');$('#notation-view').onclick=()=>setView('rawl');$('#original').onclick=()=>setView('source');
$('#melody-voice').onclick=()=>{melodyVisible=!melodyVisible;localStorage.setItem('insights-melody',melodyVisible?'visible':'hidden');melodyControls();if(view==='rawl')ensureRawl();};
$('#header-play').onclick=()=>{if(view==='source')setView('rawl');void player.toggle();};$('#play').onclick=()=>player.toggle();$('#stop').onclick=()=>player.stop();$('#tempo').onchange=e=>{player.setTempo(e.target.value);e.target.value=player.tempo;};
for(const [id,voice]of [['#piano-voice',0]])$(id).onclick=()=>{const muted=$(id).getAttribute('aria-pressed')==='true';player.setMuted(voice,muted);$(id).setAttribute('aria-pressed',String(!muted));if(rawl)rawl.update(rawlOptions());};
$('#midi-download').onclick=e=>{if(!performance||player.tempo===performance.tempo)return;e.preventDefault();const url=URL.createObjectURL(new Blob([encodeMidi({...performance,tempo:player.tempo})],{type:'audio/midi'})),a=document.createElement('a');a.href=url;a.download=$('#midi-download').download;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#menu').onclick=()=>{const on=document.body.classList.toggle('menu-open');$('#menu').setAttribute('aria-expanded',on);$('#shade').hidden=!on;};$('#shade').onclick=closeMenu;

$('#data-download').onclick=()=>{const s=structuredClone(songs[current]),tonic=s.tonic[0];for(const row of s.rows){for(const c of row.chords)c.symbol=transposeChord(c.symbol,tonic);for(const k of row.keys)k.root=transposeRoot(k.root,tonic);for(const j of row.joins){j.from=transposeRoot(j.from,tonic);j.to=transposeRoot(j.to,tonic);}}s.originalTonic=s.tonic;s.tonic=['C',s.tonic[1]];const url=URL.createObjectURL(new Blob([JSON.stringify(s,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=s.title.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('hashchange',()=>route());window.addEventListener('beforeunload',()=>{player.destroy();destroyViews();destroyHarmony();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'){if(recolorSelection!==null){recolorSelection=null;recolorMeasure=null;recolorPreview=null;redrawColors();}closeMenu();$('.join-detail')?.remove();}if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();if(innerWidth<=760&&!document.body.classList.contains('menu-open'))$('#menu').click();$('#search').focus();}if(e.code==='Space'&&routeKind!=='bricks'&&performance&&!['INPUT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName)){e.preventDefault();void player.toggle();}});
const unbindTempo=bindTempoKeys({adjustTempo:delta=>{if(!performance)return false;player.setTempo(player.tempo+delta*DEFAULT_TEMPO);$('#tempo').value=player.tempo;}});
window.addEventListener('beforeunload',unbindTempo,{once:true});
route(true);
