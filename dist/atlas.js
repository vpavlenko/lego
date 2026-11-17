import {mountRawlView,bindHarmonyHover} from './rawl-view.js';
import {createPlayer} from './audio-player.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=pause=>`<svg viewBox="0 0 24 24" aria-hidden="true">${pause?'<path d="M10 4H6v16h4zM18 4h-4v16h4z"/>':'<path d="m8 5 11 7-11 7V5Z"/>'}</svg>`;
export async function mountAtlas(root){
 const destroyHarmony=bindHarmonyHover(document);
 const response=await fetch('./data/atlas.json');if(!response.ok)throw Error(response.status);const data=await response.json(),items=data.groups.flatMap(g=>g.bricks),cards=new Map();let active=null;
 root.innerHTML=`<h1>Bricks<span class="atlas-total">${items.length}</span></h1><nav class="atlas-index" aria-label="Groups">${data.groups.map((group,i)=>`<a href="#type-${i}">${esc(group.type)}</a>`).join('')}</nav><div class="atlas-groups">${data.groups.map((g,i)=>`<section class="atlas-group" style="width:${Math.max(330,...g.bricks.map(b=>b.performance.beats/b.performance.barBeats*100))}px" data-type="${esc(g.type)}" aria-labelledby="type-${i}"><h2 id="type-${i}">${esc(g.type)} <span>${g.bricks.length}</span></h2>${g.bricks.map(b=>`<article class="atlas-card" id="${b.slug}" data-brick="${b.slug}"><div class="atlas-card-head"><button class="atlas-play" aria-label="Play" title="Play">${icon(false)}</button><h3><a href="./index.html#brick/${b.slug}">${esc(b.name)}</a></h3><a class="atlas-card-count" href="./index.html#brick/${b.slug}" title="Standards">${b.standards}</a></div><div class="atlas-preview" aria-label="Rawl notation"></div><span class="atlas-error" hidden>Playback error</span></article>`).join('')}</section>`).join('')}</div>`;
 const player=createPlayer({onState:state=>{
  if(!active)return;const running=state==='playing',label=running?'Pause':state==='loading'?'Loading':'Play';active.button.innerHTML=icon(running);active.button.setAttribute('aria-label',label);active.button.title=label;active.button.setAttribute('aria-busy',String(state==='loading'));active.error.hidden=state!=='error';
 },onPosition:beat=>active?.view.setPosition(beat),onError:error=>{console.error(error);if(active)active.error.hidden=false;}});
 function activate(card){if(active===card)return;player.stop();active=card;player.load(card.item.performance);}
 for(const item of items){
  const element=root.querySelector(`[data-brick="${item.slug}"]`),button=element.querySelector('.atlas-play'),card={item,element,button,error:element.querySelector('.atlas-error')};cards.set(item.slug,card);
  card.view=mountRawlView(element.querySelector('.atlas-preview'),{song:item.performance.previewSong,performance:item.performance,brickMap:new Map([[item.name,item]]),compact:true,continuous:true,measureWidth:100,mutedVoices:[],onSeek:beat=>{activate(card);player.seek(beat);},onNote:note=>player.audition(note)});
  button.onclick=()=>{activate(card);void player.toggle();};
 }
 const destroy=()=>{player.destroy();destroyHarmony();for(const card of cards.values())card.view.destroy();};window.addEventListener('beforeunload',destroy,{once:true});
 if(location.hash)requestAnimationFrame(()=>document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({block:'start'}));
 return {cards,player,destroy};
}
export const ready=mountAtlas(document.querySelector('#atlas')).catch(error=>{console.error(error);document.querySelector('.atlas-loading').textContent='Unavailable';});
