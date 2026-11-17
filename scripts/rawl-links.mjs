import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parseMidi}=require('midi-file');
const root=fileURLToPath(new URL('../',import.meta.url));
export const publicIndexUrl='https://firestore.googleapis.com/v1/projects/rawlrocks/databases/(default)/documents/indexes/midis';
// Composition identities reviewed against title/composer/performer provenance in
// Rawl's public corpus metadata. These are actual MIDI ids, never guessed slugs.
export const candidates={
 2:['KmoOGpWkiacxni7dj2WK'],
 5:['cVMcif6CaCc6Z91IfwiG'],
 7:['WcG56D0iH9bUJQ1H1UbD','HnN60kofRD3iMvTbrxw0','LBam0ZtMxjmyxJq2a5y7','LBF0xVL1XpUPse4LoR25','K3nvf7Pmeavl0BLMOJXK','4uJ58oAa9dImOHHbYFZB'],
 12:['Nq3uPbDmwp7Y5GwNRwdB','cE69PKrV2TfcuFAPGFNa','XeQ7EUuY1OcNrCreUsZZ','ZANWVSmEfNwvB6YTsFA1','2B9kmWxOZh4Hd1rhfC3d','B3p8ou73rkJiBRzQPyDG','Rm7as11JMR9xGKR2rSrL','7H8ZnQMAEP7IplTWIaFN','PAbEekpv2nPiRm33X8mC','cUJBm6oCjkkRB627WH61'],
 18:['xxRhTpkFowG9LgtogoLn'],
 21:['byYzuU4imsxot47i8g4i','gYSXoPsKdLGoPm66lauD','6lM1RJ7AMuBl0chlfSmE'],
 31:['4SKZetrAEHxvbgVzBNCw'],
 34:['QWdNjEVu51A1BTh22DPR'],
 39:['GN3d6jRCekfKJa4xyKxN'],
 40:['edXTy6zuC1FB2p6Lyyqe'],
 44:['V3U9KI59k6YDLeW0dxI3'],
 48:['QwUd0v8H5yC7PiTjnq9M','S9nhNg0vJyTFBNBmS7t8','aUIl0xieCFGhzqdvY54f','HkgY2jb5JvH0Hm3oi9Px','jUGHnL3U8RsbxbcdlGqc'],
 53:['tEM7WS4uscna0bkSdMes','0BG6YsDJYisnlwcxn4TU','mNh8RgHhbli22YSDGcMm'],
 67:['2Nqwg8ktlH8Ehp2o04C8'],
 100:['1OUFleFWRi0jzHR8IRNW','zHJMAFXDrfxjPGlYjbBk'],
 116:['bPDTIhOTSOa7kADWU5a3','pevUcsNfOLQr2zZHIOR6'],
 117:['mNH78RVrlbdfoj8AhgFx'],
 120:['WkfY6F3Lz1iRX0n6cqPy'],
 135:['jdlwSooI8DTYb71i10Df'],
 138:['Uyj3V9qLkJHTQwhN2Q9P'],
 142:['VyGzdAbXIyucYwySGHfL','6cj1mdht8gObD6pLZ4U7'],
 145:['37QFNwSnbHt7OFnOAzb2','HEDXpdOqOgMW3TmgxBhu','XywITYyqWJFW0BAVyx9Y'],
 153:['5fsGJEv6ZVQIAvDwRn9i'],
 160:['Gpk1qkYeN3yiwmbefyBe'],
 171:['U8vZa9lL7ODvQThj6YH7','K4j4C5vsItN1CVWOOvW3'],
 175:['z6Do5SGKPjpERz3o16vt','zUVkWOjdlaqzSHkyUmMn'],
 178:['1lILVfRXtXjrmZRNPxHP','euks9Ff7KH0FvuopylrE','5Ob2jpftg4TQmo6XVGdj'],
 188:['C9E5ZyPKXtbrxq529Bvj'],
 189:['RBhNjEcXMfIT5ix9D76W','FFRFcz54tysvUmkfEruq','vw6aOOSWTdtKNudFsp22'],
 191:['7hSBehdiSARcUFyEKRFw'],
 198:['ZsCikvf5q2uS7TLj1yvJ','DngoWCtYUKWmQ4aotWor','Gz32YTzOeuypXW6XOQvF','ePf5whECbCRijf1iozpq'],
 199:['rofZiuBTxrOr87w7x5CJ'],
 222:['Vi4AC9KM5w0WB6ArZWEm'],
 232:['xQUBWh7iJujnuQJTFrgE']
};
const evidence={
 2:'Actual Rawl title names Fats Waller and Harry Brooks.',5:'Rawl jazz_standards corpus identifies the New York Jazz Lounge rendition; John Legend homonym excluded.',7:'Exact Jerome Kern composition title; lead-sheet titles name Kern and Hammerstein; all six records occur in Rawl jazz_standards.',12:'Joseph Kosma title/Les feuilles mortes alias and jazz/piano arrangements; Melody Bober composition excluded.',18:'Exact Harold Arlen standard title; Rawl ringmasters barbershop rendition.',21:'Kenny Dorham composition explicitly named in Bushgrafts record, with Michel Camilo arrangement and jazz lead-sheet variant.',31:'Exact Gershwin standard in Chet Baker rendition title.',34:'Exact Irving Berlin standard title.',39:'Rawl charlie_parker corpus identifies Confirmation.',40:'Rawl antonio_carlos_jobim and josef_huber_midis corpora identify Corcovado.',44:'Danny Boy/Londonderry Air alias and Bill Evans arrangement.',48:'Rawl antonio_carlos_jobim corpus and explicitly credited Jobim / Chick Corea arrangements.',53:'Exact Donna Lee composition in Parker lead sheets and Jaco Pastorius rendition; artist/composer credit variation does not imply a different tune.',67:'Exact Bart Howard composition title.',100:'Actual I Got Rhythm title variants in Rawl gershwin_songbook corpus.',116:'Oh Lady Be Good title alias and explicit George Gershwin credits.',117:'Lady Bird spacing alias in Rawl jazz_standards corpus.',120:'Actual rendition title explicitly credits Jule Styne.',135:'Rawl josef_huber_midis jazz arrangement of Meditation; Eugen Doga homonym excluded.',138:'Rawl corpus comment explicitly identifies Erroll Garner for Misty_piano_solo.',142:'Breakfast at Tiffanys subtitle or explicit Henry Mancini credit.',145:'Exact Rodgers standard title in Rawl jazz_standards and Doug McKenzie jazz rendition.',153:'Actual title explicitly identifies Dizzy Gillespie / Sarah Vaughan standard.',160:'Rawl charlie_parker corpus identifies Ornithology.',171:'Rawl joe_henderson corpus identifies Recorda-Me, including No Me Esqueca alias.',175:'Actual S Wonderful title variants in Rawl gershwin_songbook.',178:'Rawl jazz_standards / duke_ellington corpora identify Satin Doll, including satindol filename alias.',188:'Rawl josef_huber_midis corpus and public Jazz MIDI source identify Solar; Solar Wind excluded.',189:'Actual titles explicitly credit Duke Ellington; game soundtrack and TheFatRat homonyms excluded.',191:'Actual rendition filename explicitly credits Gershwin.',198:'Rawl josef_huber_midis stella alias and actual titles explicitly credit Victor Young.',199:'Actual rendition filename explicitly credits Gershwin.',222:'Actual title explicitly credits Antonio Carlos Jobim.',232:'Exact Irving Berlin standard title.'
};
const exclusions=[
 [4,'AoAd3AiopowhWcR6qopI','Danny Elfman film composition in Rawl danny_elfman corpus, not Sammy Fain jazz standard.'],
 [5,'znTxbPd98M8AeRus9tZi','John Legend composition, not Simons/Marks standard.'],
 [9,'fhedSxq6nnCfwiNocPKG','Jim Brickman composition, not Matt Dennis standard.'],[9,'7MmRCsVA5lZOSwpAWdJu','Jim Brickman composition, not Matt Dennis standard.'],
 [12,'VJrXvdxn73iafnpt4agt','Dance of the Autumn Leaves by Melody Bober, not Joseph Kosma.'],
 [24,'IBh2nacFE7Ivp8HwFKYr','Folsom Prison Blues filename number1, not Elliott Blues #1 analysis.'],
 [29,'QQcffBPvYHanDaIN7ng5','Broadway is descriptive text for SIX medley, not the standard.'],
 [47,'fV5rFudmwtaFQ2Cq9F1M','Kingdom Hearts composition, not Jerome Kern standard.'],
 [88,'uIaPY9Ghv8oxrFAAeoN4','Eugen Doga composition, not Cole Porter standard.'],
 [127,'kpnqLLbuAxRI2FuukWtM','Shawn Mendes / Taylor Swift song, not Richard Rodgers standard.'],
 [135,'EqIb8rsTAIHLFB9YAG98','Eugen Doga composition, not Jobim.'],
 [136,'6Wnfe0qtVkvvRvlrTE9v','Persona3 composition, not Eubie Blake standard.'],
 [165,'a00m5eOy5TtU2gcdugRf','Holst Venus Bringer of Peace, not Horace Silver Peace.'],
 [189,'wzMnXvKNzVHlEVgvM6CD','TheFatRat and Slaydit composition, not Duke Ellington.'],[189,'genesis_mfpl_04','Minnesota Fats game soundtrack source; no verified composition identity connecting it to the Duke Ellington standard.'],
 [206,'DvWYF4ZfSZA0fCtHgVl5','Catherine Rollin composition, not Walter Gross jazz standard.'],
 [207,'IaOVFrKvidI8kDX2kYwt','Genesis song, not Brandt/Haymes standard.'],
 [222,'eSgfP5pQObexS2HjLmtw','Wonder Wave by David Lanz, not Jobim Wave.']
];
export function decodeFields(fields){const out={};for(const[k,v]of Object.entries(fields??{})){if('stringValue'in v)out[k]=v.stringValue;else if('bytesValue'in v)out[k]=v.bytesValue;}return out;}
async function getJson(url){let error;for(let attempt=0;attempt<3;attempt++){try{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}catch(e){error=e;}}throw error;}
export async function verifyLinks(){
 const verifiedAt=new Date().toISOString(),index=await getJson(publicIndexUrl),midis=(index.fields.midis.arrayValue.values??[]).map(x=>decodeFields(x.mapValue.fields)),byId=new Map(midis.map(m=>[m.id,m])),firstBySlug=new Map();for(const m of midis)if(!firstBySlug.has(m.slug))firstBySlug.set(m.slug,m.id);
 const songs=JSON.parse(await fs.readFile(root+'dist/data/roadmaps.json','utf8')).songs,standards=Object.fromEntries(songs.map(s=>[s.index,[]])),records=[],unverified=[],duplicatePayloads=[];
 const jobs=Object.entries(candidates).flatMap(([index,ids])=>ids.map(id=>({index:Number(index),id})));let cursor=0;
 async function worker(){while(cursor<jobs.length){const {index:standardIndex,id}=jobs[cursor++],info=byId.get(id);try{
  if(!info)throw Error('MIDI id not in current public index');
  const documentUrl='https://firestore.googleapis.com/v1/projects/rawlrocks/databases/(default)/documents/midis/'+encodeURIComponent(id),doc=await getJson(documentUrl),fields=decodeFields(doc.fields),blob=Buffer.from(fields.blob??'','base64');
  if(blob.subarray(0,4).toString()!=='MThd')throw Error('Public document has no MThd MIDI payload');
  const midi=parseMidi(blob),noteOnCount=midi.tracks.reduce((n,t)=>n+t.filter(e=>e.type==='noteOn'&&e.velocity).length,0);if(!noteOnCount)throw Error('MIDI has no note onsets');
  const useId=firstBySlug.get(info.slug)!==id,url='https://rawl.rocks/f/'+encodeURIComponent(useId?id:info.slug),sha256=createHash('sha256').update(blob).digest('hex'),title=fields.title||info.title;
  records.push({standardIndex,midiId:id,title,indexTitle:info.title,slug:info.slug,url,documentUrl,documentUpdateTime:doc.updateTime,blobBytes:blob.length,midiHeader:'MThd',sha256,noteOnCount,compositionEvidence:evidence[standardIndex],embeddedTitle:midi.tracks.flatMap(t=>t.filter(e=>e.type==='trackName').map(e=>e.text)).find(text=>!text.includes('@'))?.replace(/\0/g,'')??null});
 }catch(error){unverified.push({standardIndex,midiId:id,title:info?.title??null,reason:String(error.message)});}}}
 await Promise.all(Array.from({length:6},worker));records.sort((a,b)=>a.standardIndex-b.standardIndex||candidates[a.standardIndex].indexOf(a.midiId)-candidates[b.standardIndex].indexOf(b.midiId));
 const seen=new Set();for(const record of records){const key=record.standardIndex+':'+record.sha256;if(seen.has(key)){duplicatePayloads.push({standardIndex:record.standardIndex,midiId:record.midiId,sha256:record.sha256});continue;}seen.add(key);standards[record.standardIndex].push({title:record.title,url:record.url,midiId:record.midiId,slug:record.slug});}
 const audit={version:1,verifiedAt,source:publicIndexUrl,indexUpdateTime:index.updateTime,indexCount:midis.length,coverage:{standards:songs.length,matchedStandards:Object.values(standards).filter(xs=>xs.length).length,renditions:Object.values(standards).reduce((n,xs)=>n+xs.length,0)},method:'Unauthenticated public Firestore index and MIDI document GET; real MThd payload with note onsets; composition identities reviewed separately from existence; duplicate MIDI bytes deduplicated within each standard. No negative claim about unindexed libraries.',records,duplicatePayloads,excluded:exclusions.map(([standardIndex,id,reason])=>({standardIndex,midiId:id,title:byId.get(id)?.title??null,reason})),unverifiedCandidates:unverified,reviewCandidates:[{standardIndex:200,midiId:'BJM7y0rKNNy34TvAWx0k',title:byId.get('BJM7y0rKNNy34TvAWx0k')?.title,reason:'Inspired-by/compound title; not confirmed as same composition as Gershwin Summertime.'}],unmatchedIndices:songs.filter(s=>!standards[s.index].length).map(s=>s.index)};
 await fs.writeFile(root+'src/music/rawl-links.json',JSON.stringify({version:1,verifiedAt,standards},null,2)+'\n');await fs.writeFile(root+'evidence/rawl-links-audit.json',JSON.stringify(audit,null,2)+'\n');
 console.log(JSON.stringify({...audit.coverage,publicIndex:midis.length,verifiedDocuments:records.length,duplicatePayloads:duplicatePayloads.length,unverified:unverified.length}));
}
if(process.argv.includes('--verify'))await verifyLinks();
