(() => {
'use strict';
const PROJECT_URL = 'https://qybgsztoegkzqsdipili.supabase.co';
const KEY = 'sb_publishable_IwNmQESmOgj-DHR0sxOIlw_4EKsa4wu';
const EMAIL = 'ljy5747@gmail.com';
const PHOTO = 'assets/nepalensis-live.jpg';
const app = document.querySelector('#app');
const supa = window.supabase?.createClient(PROJECT_URL, KEY, {auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'hemiso-auth-v1'}});
const state = {user:null,allowed:false,ready:false,error:'',adults:[],lines:[],larvae:[],page:'home',search:'',sex:'all',status:'all',species:'all',modal:null,busy:false,source:null,sourceSearch:'',sourceSpecies:'all',selectedAdults:new Set(),selectedLines:new Set(),syncResult:null,syncError:'',pulling:false,lastSaveSynced:false};
const esc = v => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const findAdult = id => state.adults.find(x=>x.id===id);
const findLine = id => state.lines.find(x=>x.id===id);
const sexLabel = s=>({M:'♂ 수컷',F:'♀ 암컷',U:'미확인'}[s]||'미확인');
const badge = s=>`<span class="badge ${s==='M'?'male':s==='F'?'female':'muted'}">${sexLabel(s)}</span>`;
const linked = x=>x.beetlelog_id?'<span class="badge">BeetleLog</span>':'';
const safePhoto = value=>/^https:\/\//i.test(value||'') || /^data:image\/(jpeg|png|webp);base64,/i.test(value||'') ? value : '';
const note = x=>esc(x||'—');
const credit = ()=>`<small class="photo-credit">Photo © <a href="https://www.inaturalist.org/photos/160988294" target="_blank" rel="noopener noreferrer">H01 / iNaturalist</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></small>`;
const icon = type=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({analysis:'<path d="M4 3v17h17M8 16v-5m5 5V7m5 9V4"/>',home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',adults:'<ellipse cx="12" cy="14" rx="5" ry="7"/><path d="M9 7 7 3m8 4 2-4M7 11l-4-2m4 7-4 2m14-7 4-2m-4 7 4 2M12 7v14"/>',lines:'<rect x="9" y="2" width="6" height="5" rx="1"/><rect x="2" y="17" width="6" height="5" rx="1"/><rect x="16" y="17" width="6" height="5" rx="1"/><path d="M12 7v5M5 17v-5h14v5"/>',sync:'<path d="M20 7a9 9 0 0 0-15-2L2 8m0-5v5h5M4 17a9 9 0 0 0 15 2l3-3m0 5v-5h-5"/>',plus:'<path d="M12 5v14M5 12h14"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'}[type]||'')}</svg>`;
const btn = (action,label,kind='',attrs='')=>`<button type="button" class="btn ${kind}" data-action="${action}" ${attrs}>${label}</button>`;
const field = (label,name,value='',type='text',extra='')=>`<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (label,name,options,value,extra='')=>`<label class="field">${label}<select name="${name}" ${extra}>${options.map(([v,l])=>`<option value="${esc(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
const parentOptions = (sex,id)=>[['','미지정'],...state.adults.filter(a=>a.sex===sex&&a.id!==id).map(a=>[a.id,`${a.code} · ${a.lineage||a.species}`])];
const title = {home:'내 사육 기록',adults:'성충 관리',lines:'라인 관리',analysis:'사육 분석',sync:'BeetleLog 연동'};
let toastTimer;
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.className='toast show';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='toast',4500);}
function login(){
 app.innerHTML=`<main class="login-shell"><section class="login-visual"><img src="${PHOTO}" alt="나무 위의 네팔렌시스 사슴벌레 한 쌍"><div class="visual-caption"><span class="eyebrow">THE HEMISODORCUS COLLECTION</span><h2>Dorcus nepalensis</h2><p>한 개체의 기록에서, 다음 세대의 이야기로.</p></div>${credit()}</section><section class="login-panel"><a class="brand" href="./"><img src="favicon.svg" alt=""><span><strong>Hemiso</strong><small>PERSONAL BREEDING ARCHIVE</small></span></a><span class="eyebrow">YOUR PRIVATE COLLECTION</span><h1>A record<br>of generations.<small>나만의 성충 · 라인 데이터베이스</small></h1><p>개체의 성장과 혈통, 교배 라인을<br>하나의 기록으로 이어갑니다.</p>${state.error?`<div class="notice" role="alert">${esc(state.error)}</div>`:''}${state.user?`${btn('logout','로그아웃 후 다른 계정으로 로그인','subtle')}`:btn('login',icon('lock')+(state.ready?'Google 계정으로 로그인':'접속 확인 중…'),'primary',state.ready&&supa?'':'disabled')}<div class="allowed-account">허용된 계정<strong>${EMAIL}</strong></div><p class="login-footnote">사육 기록은 로그인 후 확인할 수 있습니다.<br>허용된 계정만 데이터를 조회하고 수정할 수 있습니다.</p></section></main>`;
}
async function boot(){
 state.error='';login();
 if(!supa){state.ready=true;state.error='인증 모듈을 불러오지 못했습니다. 네트워크 연결 후 새로고침해 주세요.';login();return;}
 try{
  const {data,error}=await supa.auth.getUser();
  if(error&&error.name!=='AuthSessionMissingError')throw error;
  state.user=data?.user||null;
  if(state.user){
   const {data:authorized,error:ae}=await supa.rpc('hemiso_authorized');if(ae)throw ae;
   if(!authorized)throw Error('이 계정은 접근 권한이 없습니다. 허용된 Google 계정으로 로그인해 주세요.');
   state.allowed=true;await load();await pullLinked({paint:false});
  }
 }catch(e){state.allowed=false;state.error=e.message||String(e);}
 state.ready=true;render();
}
async function load(){
 const results=await Promise.all(['adults','lines','larvae'].map(n=>supa.from('hemiso_'+n).select('*').order('created_at',{ascending:false})));
 results.forEach(r=>{if(r.error)throw r.error;});
 [state.adults,state.lines,state.larvae]=results.map(r=>r.data||[]);
}
function render(){
 if(!state.allowed){login();return;}
 app.innerHTML=`<div class="shell"><aside class="sidebar"><a class="brand" href="#home"><img src="favicon.svg" alt=""><span><strong>Hemiso</strong><small>BREEDING ARCHIVE</small></span></a><nav aria-label="주 메뉴"><p class="nav-label">MY COLLECTION</p>${['home','adults','lines','analysis','sync'].map(p=>`<a href="#${p}" class="nav-item ${state.page===p?'active':''}" ${state.page===p?'aria-current="page"':''}>${icon(p)}${title[p]}</a>`).join('')}</nav><div class="sidebar-bottom"><span class="connection-dot"></span>개인 컬렉션<strong>${EMAIL}</strong>${btn('logout','로그아웃','subtle small')}</div></aside><main class="main"><header class="topbar"><span class="eyebrow">HEMISODORCUS / PERSONAL ARCHIVE</span><div class="actions">${btn('refresh','새로고침','subtle small')}<span class="badge">PRIVATE DATA</span></div></header><div class="section-heading"><div><p class="eyebrow">${{home:'OVERVIEW',adults:'ADULT SPECIMENS',lines:'BREEDING LINES',analysis:'BREEDING INSIGHTS',sync:'CONNECTED RECORDS'}[state.page]}</p><h1 class="page-title">${title[state.page]}</h1></div><div class="actions">${state.page==='adults'?btn('adult-new',icon('plus')+'성충 등록','primary'):state.page==='lines'?btn('line-new',icon('plus')+'라인 등록','primary'):''}</div></div>${syncNotice()}${state.page==='home'?home():state.page==='adults'?adults():state.page==='lines'?lines():state.page==='analysis'?analysisPage():syncPage()}<footer class="page-footer"><span>Hemiso_DB · 개인 사육 아카이브</span><span>${new Date().getFullYear()}</span></footer></main></div><div id="modal-root"></div>`;
 renderModal();
}
function empty(message,action,label){return `<div class="empty-state">${icon('adults')}<h3>${message}</h3><p>첫 기록을 남기거나 BeetleLog에서 가져와 주세요.</p>${action?btn(action,label,'primary'):''}</div>`;}
function home(){
 const held=state.adults.filter(a=>a.status==='보유');
 return `<section class="hero"><div class="hero-content"><span class="eyebrow">YOUR COLLECTION, GENERATION BY GENERATION</span><h2>기록이 쌓이면,<br>다음 세대가 보입니다.</h2><p>성충의 혈통과 교배 라인을 한눈에 정리하세요.</p><div class="actions">${btn('adult-new',icon('plus')+'성충 등록','primary')}${btn('line-new','라인 등록','subtle')}</div><small><i>Dorcus nepalensis</i></small></div><div class="hero-photo"><img src="${PHOTO}" alt="나무 위의 네팔렌시스 사슴벌레">${credit()}</div></section><section class="stats" aria-label="컬렉션 요약">${[['등록 성충',state.adults.length,'ADULTS'],['보유 성충',held.length,'IN COLLECTION'],['등록 라인',state.lines.length,'LINES'],['등록 유충',state.larvae.length,'LARVAE']].map(([l,n,e])=>`<div class="stat"><span class="eyebrow">${e}</span><strong>${n}<small> ${e==='LINES'?'개':'마리'}</small></strong><span>${l}</span></div>`).join('')}</section><section class="card"><div class="section-heading"><h2>최근 등록한 성충</h2><a href="#adults" class="btn subtle small">전체 보기 ${icon('arrow')}</a></div>${state.adults.length?adultTable(state.adults.slice(0,5)):empty('아직 등록한 성충이 없습니다.','open-import','BeetleLog에서 가져오기')}</section><section class="card"><div class="section-heading"><h2>최근 등록한 라인</h2><a href="#lines" class="btn subtle small">전체 보기 ${icon('arrow')}</a></div>${state.lines.length?lineTable(state.lines.slice(0,4)):empty('아직 등록한 라인이 없습니다.','line-new','라인 등록')}</section>`;
}
function adultTable(items){return `<div class="table-wrap"><table><thead><tr><th>관리번호 / 종</th><th>혈통 · 누대</th><th>성별</th><th>크기</th><th>상태</th><th>연동</th><th>수정</th></tr></thead><tbody>${items.map(a=>`<tr><td><button class="record-link" data-action="adult-detail" data-id="${a.id}">${esc(a.code)}</button><small class="species-name">${esc(a.species)}</small></td><td>${esc(a.lineage||'미상')}<small class="species-name">${esc(a.generation||'—')}</small></td><td>${badge(a.sex)}</td><td class="mono">${a.size==null?'—':esc(a.size)+' mm'}</td><td><span class="badge ${a.status==='보유'?'':'muted'}">${esc(a.status)}</span></td><td>${linked(a)||'—'}</td><td>${btn('adult-edit','수정','subtle small',`data-id="${esc(a.id)}"`)}</td></tr>`).join('')}</tbody></table></div>`;}
function lineTable(items){return `<div class="table-wrap"><table><thead><tr><th>라인명 / 종</th><th>부 개체</th><th>모 개체</th><th>누대 / 연도</th><th>유충</th><th>연동</th></tr></thead><tbody>${items.map(l=>`<tr><td><button class="record-link" data-action="line-detail" data-id="${l.id}">${esc(l.name)}</button><small class="species-name">${esc(l.species)}</small></td><td>${esc(findAdult(l.father_id)?.code||(l.is_wild?'Wild':'미지정'))}</td><td>${esc(findAdult(l.mother_id)?.code||'미지정')}</td><td>${note(l.generation)}<small class="species-name">${note(l.year)}</small></td><td>${state.larvae.filter(v=>v.line_id===l.id).length}마리</td><td>${linked(l)||'—'}</td></tr>`).join('')}</tbody></table></div>`;}
function filterBar(kind){
 const species=[...new Set(state[kind].map(a=>a.species).filter(Boolean))].sort();
 return `<div class="filters"><label class="search-field"><span class="sr-only">검색</span><input id="record-search" type="search" placeholder="${kind==='adults'?'관리번호 · 종 · 혈통':'라인명 · 종 · 부모 개체'} 검색" value="${esc(state.search)}"></label><label class="sr-only" for="filter-species">종 필터</label><select id="filter-species"><option value="all">전체 종</option>${species.map(s=>`<option ${state.species===s?'selected':''}>${esc(s)}</option>`).join('')}</select>${kind==='adults'?`<label class="sr-only" for="filter-sex">성별 필터</label><select id="filter-sex">${[['all','전체 성별'],['M','수컷'],['F','암컷'],['U','미확인']].map(([v,l])=>`<option value="${v}" ${state.sex===v?'selected':''}>${l}</option>`).join('')}</select><label class="sr-only" for="filter-status">상태 필터</label><select id="filter-status">${['all','보유','분양','사망'].map(s=>`<option value="${s}" ${state.status===s?'selected':''}>${s==='all'?'전체 상태':s}</option>`).join('')}</select>`:''}</div>`;
}
function filtered(kind){const q=state.search.toLowerCase().trim();return state[kind].filter(a=>(state.species==='all'||a.species===state.species)&&(kind!=='adults'||((state.sex==='all'||a.sex===state.sex)&&(state.status==='all'||a.status===state.status)))&&[a.code,a.name,a.species,a.lineage,a.generation,a.note,findAdult(a.father_id)?.code,findAdult(a.mother_id)?.code].some(v=>String(v||'').toLowerCase().includes(q)));}
function adults(){const items=filtered('adults');return `<section class="card">${filterBar('adults')}<div id="records-results">${adultResults(items)}</div></section>`;}
function adultResults(items){return items.length?adultTable(items):empty(state.adults.length?'검색 조건에 맞는 성충이 없습니다.':'아직 등록한 성충이 없습니다.','adult-new','성충 등록');}
function lines(){const items=filtered('lines');return `<section class="card">${filterBar('lines')}<div id="records-results">${lineResults(items)}</div></section>`;}
function lineResults(items){return items.length?lineTable(items):empty(state.lines.length?'검색 조건에 맞는 라인이 없습니다.':'아직 등록한 라인이 없습니다.','line-new','라인 등록');}
const NEP_SPECIES='Dorcus nepalensis';
const analysisState={source:'larvae',sex:'M',line:'all',metric:'size',growth:'',tab:'overview',feedSex:'M',feed:'all',band:'all'};
const positive=value=>value==null||String(value).trim()===''?null:(Number.isFinite(Number(value))&&Number(value)>0?Number(value):null);
const isNep=value=>['dorcus nepalensis','d nepalensis','네팔렌시스'].includes(String(value??'').toLowerCase().replace(/[.\s]+/g,' ').trim());
const fmt=(value,decimals=2)=>value==null?'—':Number(value).toLocaleString('ko-KR',{maximumFractionDigits:decimals});
const average=values=>{const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null;};
function median(values){
 const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);
 return sorted.length?(sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2):null;
}
const pupalWeight=record=>positive(record.pupal_weight)??positive(record.source_data?.pupation?.pupaWeight);
function growthRecords(v){return (Array.isArray(v.records)?v.records:[]).filter(Array.isArray).map((r,index)=>({date:String(r[0]||''),feed:String(r[1]||''),volume:String(r[2]??''),weight:positive(r[3]),index}));}
function nepDataset(){
 const lines=state.lines.filter(l=>isNep(l.species)),adults=state.adults.filter(a=>isNep(a.species));
 const lineById=new Map(lines.map(l=>[l.id,l])),adultById=new Map(adults.map(a=>[a.id,a]));
 const larvae=state.larvae.filter(v=>lineById.has(v.line_id)&&(!String(v.source_data?.species??'').trim()||isNep(v.source_data.species)));
 return {lines,adults,larvae,lineById,adultById};
}
function larvalRows(data){
 return data.larvae.map(v=>{
  const l=data.lineById.get(v.line_id),records=growthRecords(v),weights=records.map(r=>r.weight).filter(Number.isFinite);
  const adult=data.adultById.get(v.nep_adult_id);
  const linked=adult&&(adult.sex===v.sex||[adult.sex,v.sex].includes('U'))&&adult.id!==l.father_id&&adult.id!==l.mother_id?adult:null;
  const peak=weights.length?Math.max(...weights):null,size=positive(v.size)??positive(linked?.size),pupal=pupalWeight(v)??(linked?pupalWeight(linked):null);
  return {id:v.id,kind:'larva',code:v.number,species:NEP_SPECIES,sex:v.sex==='U'&&linked?linked.sex:v.sex,line:l.name,lineId:l.id,generation:l.generation,size,peak,pupal,
   ratio:size&&pupal?size/pupal:null,pupation:peak&&pupal?100*pupal/peak:null,emerged:v.emerged||linked?.emerged,records,
   hatch:v.nep_hatched||v.source_data?.hatchDate||l.source_data?.hatchDate,hatchSource:v.nep_hatched||v.source_data?.hatchDate?'개체':'라인',
   pupated:v.nep_pupated||v.source_data?.pupation?.pupaDate,outcome:v.nep_outcome,adultId:v.nep_adult_id};
 });
}
function analysisRows(){
 const data=nepDataset();
 if(analysisState.source!=='adults')return larvalRows(data);
 return data.adults.map(a=>({id:a.id,kind:'adult',code:a.code,species:NEP_SPECIES,sex:a.sex,line:a.lineage||'혈통 미상',lineId:a.lineage||'',generation:a.generation,size:positive(a.size),peak:null,pupal:pupalWeight(a),ratio:positive(a.size)&&pupalWeight(a)?a.size/pupalWeight(a):null,emerged:a.emerged,records:[]}));
}
function analysisSelection(){
 const all=analysisRows(),lines=new Map(all.map(r=>[r.lineId,r.line]));
 if(analysisState.line!=='all'&&!lines.has(analysisState.line))analysisState.line='all';
 const rows=all.filter(r=>(analysisState.sex==='all'||r.sex===analysisState.sex)&&(analysisState.line==='all'||r.lineId===analysisState.line));
 rows.sort((a,b)=>(b[analysisState.metric]??-Infinity)-(a[analysisState.metric]??-Infinity)||String(a.code).localeCompare(String(b.code),undefined,{numeric:true}));
 return {lines,rows};
}
function dayNumber(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
 const stamp=Date.parse(date+'T00:00:00Z');
 return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===date?stamp/86400000:null;
}
function volumeCc(value){
 const match=String(value).trim().toLowerCase().replace(/,/g,'').match(/^(\d+(?:\.\d+)?)\s*(?:cc|ml|㎖|㏄)?$/);
 return match?positive(match[1]):null;
}
function growthProfile(row){
 const measured=row.records.map(r=>({...r,day:dayNumber(r.date)})).filter(r=>r.day!=null).sort((a,b)=>a.day-b.day);
 const counts=new Map();for(const r of measured)counts.set(r.day,(counts.get(r.day)||0)+1);
 const hatch=dayNumber(row.hatch),pupated=dayNumber(row.pupated),intervals=[];
 const eligible=r=>counts.get(r.day)===1&&r.weight!=null&&(hatch==null||r.day>=hatch)&&(pupated==null||r.day<=pupated);
 for(let i=1;i<measured.length;i++){
  const start=measured[i-1],end=measured[i];if(!eligible(start)||!eligible(end))continue;
  intervals.push({start,end,rate:(end.weight-start.weight)*30/(end.day-start.day),volume:volumeCc(start.volume),feed:start.feed.trim()});
 }
 const valid=measured.filter(eligible),peak=valid.reduce((best,r)=>!best||r.weight>best.weight?r:best,null);
 const near=hatch==null?[]:valid.filter(r=>Math.abs(r.day-hatch-90)<=15).sort((a,b)=>Math.abs(a.day-hatch-90)-Math.abs(b.day-hatch-90)||a.day-b.day);
 return {intervals,early:intervals.length>1?intervals[0].rate:null,late:intervals.length>1?intervals.at(-1).rate:null,
  day90:near[0]?.weight??null,peakAge:peak&&hatch!=null&&peak.weight===row.peak?peak.day-hatch:null,duration:hatch!=null&&pupated!=null&&pupated>=hatch?pupated-hatch:null};
}
function feedGroups(rows){
 const groups=new Map();
 for(const r of rows.filter(r=>r.sex===analysisState.feedSex)){
  for(const item of growthProfile(r).intervals){
   if(!item.feed||item.volume==null)continue;
   const band=5*Math.floor(item.start.weight/5),key=JSON.stringify([item.feed.toLowerCase(),item.volume,band]);
   if(!groups.has(key))groups.set(key,{feed:item.feed,volume:item.volume,band,individuals:new Map(),count:0});
   const g=groups.get(key);if(!g.individuals.has(r.id))g.individuals.set(r.id,[]);
   g.individuals.get(r.id).push(item.rate);g.count++;
  }
 }
 return [...groups.values()].map(g=>({...g,n:g.individuals.size,rate:average([...g.individuals.values()].map(average))})).sort((a,b)=>a.band-b.band||a.feed.localeCompare(b.feed)||a.volume-b.volume);
}
function birthLines(data){
 const result=new Map(),external=new Map(data.lines.filter(l=>l.beetlelog_id).map(l=>[l.beetlelog_id,l.id]));
 for(const a of data.adults){const line=external.get(a.source_data?.bornLineId);if(line)result.set(a.id,line);}
 for(const v of data.larvae){if(v.nep_adult_id&&data.adults.some(a=>a.id===v.nep_adult_id))result.set(v.nep_adult_id,v.line_id);}
 return result;
}
const SCORE_WEIGHTS=[40,25,15,15];
const FEMALE_BONUS=5;
function femaleLineBonuses(data,births){
 const setsByLine=new Map();
 for(const line of data.lines)for(const set of line.nep_sets||[]){
  const origin=births.get(set.mother);
  if(!origin||data.adultById.get(set.mother)?.sex!=='F')continue;
  if(!Number.isInteger(set.count)||set.count<0||dayNumber(set.start)==null||dayNumber(set.end)==null||set.end<set.start)continue;
  if(!setsByLine.has(origin))setsByLine.set(origin,[]);
  setsByLine.get(origin).push(set.count);
 }
 const means=new Map([...setsByLine].map(([id,sets])=>[id,average(sets)]));
 const threshold=means.size>=2?median([...means.values()]):null;
 const bonuses=new Map();
 for(const female of data.adults.filter(a=>a.sex==='F')){
  const origin=births.get(female.id),mean=means.get(origin)??null;
  const points=threshold==null||mean==null?null:(mean>threshold?FEMALE_BONUS:0);
  bonuses.set(female.id,{origin,mean,threshold,points,sets:setsByLine.get(origin)?.length||0});
 }
 return bonuses;
}
function lineScores(data,rows){
 const males=rows.filter(r=>r.sex==='M');
 const stats=data.lines.map(line=>{
  const own=rows.filter(r=>r.lineId===line.id),male=own.filter(r=>r.sex==='M'),sizes=male.filter(r=>r.size!=null),hits=sizes.filter(r=>r.size>=70).length;
  const peers=males.filter(r=>r.lineId!==line.id&&r.size!=null&&r.pupal!=null);
  const excess=sizes.filter(r=>r.pupal!=null).map(r=>{
   const ref=median(peers.filter(p=>Math.abs(p.pupal-r.pupal)<=1).map(p=>p.size));return ref==null?null:r.size-ref;
  }).filter(Number.isFinite);
  const weights=male.map(r=>r.peak).filter(Number.isFinite),outcomes=own.filter(r=>['normal','imperfect','died'].includes(r.outcome)),normal=outcomes.filter(r=>r.outcome==='normal').length;
  return {line,values:[sizes.length?hits/sizes.length:null,median(excess),median(weights),outcomes.length?normal/outcomes.length:null],
   n:[sizes.length,excess.length,weights.length,outcomes.length],hits,normal};
 });
 for(const st of stats){
  st.points=st.values.map((v,i)=>{
   if(v==null)return null;
   if(i===0||i===3)return v*SCORE_WEIGHTS[i];
   const peers=stats.filter(s=>s!==st&&s.values[i]!=null);if(!peers.length)return null;
   const below=peers.filter(p=>p.values[i]<v).length,tied=peers.filter(p=>p.values[i]===v).length;
   const rank=(below+tied/2)/peers.length;
   return rank*SCORE_WEIGHTS[i];
  });
  st.max=st.points.reduce((sum,v,i)=>sum+(v==null?0:SCORE_WEIGHTS[i]),0);st.earned=st.points.reduce((sum,v)=>sum+(v??0),0);
 }
 return stats;
}
function crossCandidates(data,rows){
 const births=birthLines(data),bonuses=femaleLineBonuses(data,births),byId=data.adultById;
 function ancestry(a){
  const ids=new Set([a.id]);let frontier=[a],complete=true;
  for(let depth=0;depth<2;depth++){
   const next=[];for(const node of frontier){
    const line=data.lineById.get(births.get(node.id));
    for(const key of ['father_id','mother_id']){
     const parent=byId.get(node[key]||line?.[key]);if(!parent){complete=false;continue;}
     ids.add(parent.id);next.push(parent);
    }
   }
   frontier=next;
  }
  return {ids,complete};
 }
 const held=data.adults.filter(a=>a.status==='보유'),anc=new Map(held.map(a=>[a.id,ancestry(a)])),out=[];
 for(const m of held.filter(a=>a.sex==='M'))for(const f of held.filter(a=>a.sex==='F')){
  const ma=anc.get(m.id),fa=anc.get(f.id),mb=births.get(m.id),fb=births.get(f.id);
  if((mb&&mb===fb)||[...ma.ids].some(id=>fa.ids.has(id)))continue;
  const direct=data.lines.filter(l=>l.father_id===m.id&&l.mother_id===f.id);
  const similar=mb&&fb?data.lines.filter(l=>births.get(l.father_id)===mb&&births.get(l.mother_id)===fb):[];
  const evidence=lines=>{const ids=new Set(lines.map(l=>l.id));return rows.filter(r=>ids.has(r.lineId)&&r.sex==='M'&&r.size!=null);};
  const exact=evidence(direct),related=evidence(similar);
  const offspring=exact.length?exact:related,level=exact.length?2:related.length?1:0;
  out.push({m,f,bonus:bonuses.get(f.id),level,n:offspring.length,hits:offspring.filter(r=>r.size>=70).length,complete:ma.complete&&fa.complete});
 }
 return out.sort((a,b)=>b.level-a.level||b.n-a.n||b.hits-a.hits||(b.bonus.points??0)-(a.bonus.points??0)||String(a.m.code).localeCompare(String(b.m.code)));
}
function analysisScatter(rows){
 const points=rows.filter(r=>r.pupal!=null&&r.size!=null);
 if(!points.length)return '<p class="analysis-empty">용화 무게와 우화 체장이 모두 있는 기록이 필요합니다.</p>';
 const xmax=Math.max(...points.map(r=>r.pupal))*1.15,ymax=Math.max(...points.map(r=>r.size))*1.12;
 const x=v=>62+v/xmax*520,y=v=>266-v/ymax*230;
 return `<svg class="analysis-chart" viewBox="0 0 620 325" role="img" aria-label="용화 무게와 우화 체장 산점도"><title>용화 무게(g)와 우화 체장(mm), ${points.length}개체</title>${[0,.25,.5,.75,1].map(t=>`<path class="chart-grid" d="M62 ${y(t*ymax)}H582"/><text x="52" y="${y(t*ymax)+4}" text-anchor="end">${fmt(t*ymax,1)}</text><text x="${x(t*xmax)}" y="288" text-anchor="middle">${fmt(t*xmax,1)}</text>`).join('')}<path class="chart-axis" d="M62 30V266H582"/><text x="62" y="18">우화 체장 (mm)</text><text x="320" y="317" text-anchor="middle">용화 무게 (g)</text>${points.map(r=>`<circle cx="${x(r.pupal)}" cy="${y(r.size)}" r="5" class="chart-dot sex-${esc(r.sex)}"><title>${esc(r.code)} · ${esc(r.line)} · ${fmt(r.pupal)}g → ${fmt(r.size)}mm · ${fmt(r.ratio)}mm/g</title></circle>`).join('')}</svg><p class="muted">${points.length}개체 · 점에 마우스를 올리면 개체 기록이 표시됩니다. 상세 값은 아래 비교표에서도 확인할 수 있습니다.</p>`;
}
function analysisGroups(rows){
 const metric=analysisState.metric,unit=metric==='size'?'mm':metric==='pupation'?'%':['peak','pupal'].includes(metric)?'g':'mm/g',groups=new Map();
 rows.forEach(r=>{if(!groups.has(r.lineId))groups.set(r.lineId,{name:r.line,values:[]});if(r[metric]!=null)groups.get(r.lineId).values.push(r[metric]);});
 const list=[...groups.values()].filter(g=>g.values.length).map(g=>({...g,mean:average(g.values)})).sort((a,b)=>b.mean-a.mean),max=Math.max(1,...list.map(g=>g.mean));
 return list.length?`<div class="analysis-bars">${list.map(g=>`<div class="analysis-bar"><div><span>${esc(g.name)}</span><strong>${fmt(g.mean)} ${unit} <small>n=${g.values.length}</small></strong></div><div class="analysis-track"><span style="width:${g.mean/max*100}%"></span></div></div>`).join('')}</div><p class="muted">유효한 측정값의 산술평균 · n은 계산에 포함된 개체 수입니다.</p>`:'<p class="analysis-empty">선택한 지표의 측정값이 없습니다.</p>';
}
function analysisGrowth(rows){
 const available=rows.filter(r=>r.records.some(p=>p.weight!=null&&/^\d{4}-\d{2}-\d{2}$/.test(p.date)));
 if(!available.some(r=>r.id===analysisState.growth))analysisState.growth=available[0]?.id||'';
 const row=available.find(r=>r.id===analysisState.growth);
 if(!row)return '<p class="analysis-empty">날짜와 체중을 함께 기록하면 성장 곡선을 볼 수 있습니다.</p>';
 const points=row.records.filter(p=>p.weight!=null&&dayNumber(p.date)!=null).sort((a,b)=>a.date.localeCompare(b.date)||a.index-b.index);
 if(!points.length)return '<p class="analysis-empty">유효한 날짜와 체중이 필요합니다.</p>';
 const dates=points.map(p=>Date.parse(p.date)),min=Math.min(...dates),span=Math.max(...dates)-min,max=Math.max(...points.map(p=>p.weight))*1.15;
 const x=(p,i)=>span?60+(dates[i]-min)/span*520:320,y=p=>230-p.weight/max*190;
 return `${select('성장 기록을 볼 개체','analysis-growth',available.map(r=>[r.id,`${r.code} · ${r.line}`]),row.id,'id="analysis-growth"')}<svg class="analysis-chart" viewBox="0 0 620 290" role="img" aria-label="${esc(row.code)}의 날짜별 체중 변화"><title>${esc(row.code)} 체중 변화</title>${[0,.5,1].map(t=>`<path class="chart-grid" d="M60 ${230-t*190}H580"/><text x="50" y="${234-t*190}" text-anchor="end">${fmt(t*max,1)}</text>`).join('')}<path class="chart-axis" d="M60 30V230H580"/><text x="60" y="18">체중 (g)</text><polyline class="growth-line" points="${points.map((p,i)=>`${x(p,i)},${y(p)}`).join(' ')}"/>${points.map((p,i)=>`<circle class="chart-dot" cx="${x(p,i)}" cy="${y(p)}" r="4"><title>${esc(p.date)} · ${fmt(p.weight)}g · ${esc(p.feed)} · ${esc(p.volume)}</title></circle>`).join('')}<text x="60" y="256">${esc(points[0].date)}</text><text x="580" y="256" text-anchor="end">${esc(points.at(-1).date)}</text></svg><div class="table-wrap"><table><thead><tr><th>측정일</th><th>체중</th><th>먹이</th><th>용량</th></tr></thead><tbody>${points.map(p=>`<tr><td>${esc(p.date)}</td><td>${fmt(p.weight)} g</td><td>${note(p.feed)}</td><td>${note(p.volume)}</td></tr>`).join('')}</tbody></table></div>`;
}
function analysisOverview(){
 const {lines,rows}=analysisSelection(),larval=analysisState.source==='larvae';
 const sizes=rows.map(r=>r.size).filter(v=>v!=null),peaks=rows.map(r=>r.peak).filter(v=>v!=null),pupals=rows.map(r=>r.pupal).filter(v=>v!=null),ratios=rows.map(r=>r.ratio).filter(v=>v!=null);
 return `<section class="card analysis-intro analysis-card"><h2>개체와 라인 비교</h2><div class="analysis-filters">${select('분석 대상','analysis-source',[['larvae','유충 → 우화 기록'],['adults','등록 성충']],analysisState.source,'id="analysis-source"')}${select('성별','analysis-sex',[['M','수컷'],['F','암컷'],['U','미확인'],['all','전체 성별']],analysisState.sex,'id="analysis-sex"')}${select(larval?'라인':'혈통','analysis-line',[['all',larval?'전체 라인':'전체 혈통'],...[...lines]],analysisState.line,'id="analysis-line"')}${select('비교 지표 · 내림차순','analysis-metric',larval?[['size','우화 체장'],['peak','유충 최대 체중'],['pupation','용화 환원율'],['pupal','용화 무게'],['ratio','우화 환원율']]:[['size','성충 체장'],['pupal','용화 무게'],['ratio','우화 환원율']],analysisState.metric,'id="analysis-metric"')}</div><div class="notice">용화 환원율 = 용화 무게(g) ÷ 관측 유충 최고 체중(g) × 100%. 우화 환원율 = 우화 체장(mm) ÷ 용화 무게(g), 단위 mm/g. ${larval?'체장만 있거나 용화 무게가 없으면 환원율 계산에서 제외합니다.':'성충 수정 화면에서 용화 무게를 입력하면 환원율을 함께 비교할 수 있습니다.'} 누락값·0 이하의 측정값은 평균에서 제외합니다. 전체 성별 선택 시 암수가 함께 집계됩니다.</div><p class="muted">성충과 유충 → 우화 기록은 별도로 집계합니다. 연결된 개체의 용화 무게는 BeetleLog와 함께 수정됩니다. 최대 체중은 측정한 기록 중 최댓값이며, 라인별 비교는 조건에 따른 인과관계를 뜻하지 않습니다.</p></section><section class="stats analysis-stats">${[['비교 대상',rows.length,'마리',null],['평균 체장',average(sizes),'mm',sizes.length],...(larval?[['평균 최대 체중',average(peaks),'g',peaks.length]]:[]),['평균 용화 무게',average(pupals),'g',pupals.length],...(larval?[['평균 용화 환원율',average(rows.map(r=>r.pupation)),'%',rows.filter(r=>r.pupation!=null).length]]:[]),['평균 우화 환원율',average(ratios),'mm/g',ratios.length]].map(([l,v,u,n])=>`<div class="stat"><span>${l}</span><strong>${fmt(v)}<small> ${u}</small></strong>${n==null?'':`<small class="muted">측정 ${n}마리</small>`}</div>`).join('')}</section>${rows.length?`<div class="analysis-panels"><section class="card"><h2>${larval?'라인':'혈통'}별 평균 ${analysisState.metric==='size'?'체장':analysisState.metric==='peak'?'최대 체중':analysisState.metric==='pupal'?'용화 무게':analysisState.metric==='pupation'?'용화 환원율':'우화 환원율'}</h2>${analysisGroups(rows)}</section><section class="card"><h2>용화 무게와 우화 체장</h2>${analysisScatter(rows)}</section></div><section class="card analysis-card"><div class="section-heading"><div><h2>개체별 비교</h2><p class="muted">${rows.length}개체 · 선택한 지표가 큰 순서로 표시합니다.</p></div>${btn('analysis-csv','CSV 다운로드','subtle small')}</div><div class="table-wrap"><table><thead><tr><th>개체번호</th><th>${larval?'라인':'혈통'} · 누대</th><th>성별</th><th>체장 (mm)</th>${larval?'<th>최대 체중 (g)</th>':''}<th>용화 무게 (g)</th>${larval?'<th>용화 환원율 (%)</th>':''}<th>우화 환원율 (mm/g)</th>${larval?'<th>측정 횟수</th>':''}<th>우화일</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button class="record-link" data-action="${larval?'larva-edit':'adult-detail'}" data-id="${esc(r.id)}">${esc(r.code)}</button></td><td>${esc(r.line)}<small class="species-name">${note(r.generation)}</small></td><td>${badge(r.sex)}</td><td class="mono">${fmt(r.size)}</td>${larval?`<td class="mono">${fmt(r.peak)}</td>`:''}<td class="mono">${fmt(r.pupal)}</td>${larval?`<td class="mono">${fmt(r.pupation)}</td>`:''}<td class="mono">${fmt(r.ratio)}</td>${larval?`<td>${r.records.filter(p=>p.weight!=null).length}</td>`:''}<td>${note(r.emerged)}</td></tr>`).join('')}</tbody></table></div></section>${larval?`<section class="card analysis-card"><h2>개체별 성장 기록</h2>${analysisGrowth(rows)}</section>`:''}`:`<section class="card"><div class="analysis-empty"><h3>조건에 맞는 기록이 없습니다.</h3><p>성별·라인을 바꾸거나 라인 관리에서 유충 체중·용화 무게·우화 체장을 기록해 주세요.</p><a href="#lines" class="btn subtle">라인 관리로 이동</a></div></section>`}`;
}
const nepAction=(action,label,id)=>btn(action,label,'subtle small',`data-id="${esc(id)}"`);
function analysisTable(head,rows,empty){
 if(!rows.length)return `<p class="analysis-empty">${esc(empty)}</p>`;
 return `<div class="table-wrap"><table><thead><tr>${head.map(h=>`<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(cells=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function growthPage(rows){
 const profile=rows.filter(r=>analysisState.sex==='all'||r.sex===analysisState.sex).map(r=>({r,p:growthProfile(r)}));
 const groups=new Map();
 for(const {r,p} of profile){
  if(!groups.has(r.lineId))groups.set(r.lineId,{name:r.line,profiles:[]});
  groups.get(r.lineId).profiles.push(p);
 }
 const groupValue=(items,key)=>{const values=items.map(p=>p[key]).filter(Number.isFinite);return values.length?fmt(median(values))+' · n='+values.length:'—';};
 const lineTable=analysisTable(['라인','초반 (g/30일)','후반 (g/30일)','90일 체중 (g)','최고 체중 도달 (일)','유충 기간 (일)'],[...groups.values()].map(g=>[esc(g.name),...['early','late','day90','peakAge','duration'].map(k=>groupValue(g.profiles,k))]),'표시할 라인이 없습니다.');
 return `<section class="card analysis-card"><h2>초반과 후반의 성장 속도</h2><div class="analysis-filters">${select('성별','analysis-sex',[['M','수컷'],['F','암컷'],['U','미확인'],['all','전체 성별']],analysisState.sex,'id="analysis-sex"')}</div>
 <p class="muted">날짜와 체중을 연속해서 잰 첫 구간과 마지막 구간의 증감을 30일 기준으로 비교합니다. 두 구간이 있어야 두 값이 표시됩니다. 90일 체중은 부화 후 75~105일 사이에서 90일에 가장 가까운 실측값입니다.</p>
 <h3>라인별 중앙값</h3>${lineTable}<h3>개체별 실측 기록</h3>
 ${analysisTable(['라인 · 개체','성별','초반 (g/30일)','후반 (g/30일)','90일 체중 (g)','최고 체중 도달 (일)','유충 기간 (일)','부화일 기준','기록'],profile.map(({r,p})=>[esc(r.line)+' · '+esc(r.code),badge(r.sex),fmt(p.early),fmt(p.late),fmt(p.day90),fmt(p.peakAge,0),fmt(p.duration,0),r.hatch?esc(r.hatchSource)+' · '+esc(r.hatch):'—',nepAction('nep-individual','관찰 기록',r.id)]),'해당 성별의 네팔렌시스 유충 기록이 없습니다.')}
 <p class="muted">유충 기간은 부화일부터 용화일까지입니다. 개체 부화일이 없으면 BeetleLog에 기록한 라인 부화일을 사용하며, 표에 그 기준을 표시합니다.</p></section>`;
}
function feedPage(rows){
 const groups=feedGroups(rows),feeds=[...new Set(groups.map(g=>g.feed.toLowerCase()))].sort(),bands=[...new Set(groups.map(g=>g.band))].sort((a,b)=>a-b);
 if(!feeds.includes(analysisState.feed))analysisState.feed='all';
 if(!bands.includes(Number(analysisState.band)))analysisState.band='all';
 const bandLabel=n=>`${n} 이상 ~ ${n+5} 미만`;
 const shown=groups.filter(g=>(analysisState.feed==='all'||g.feed.toLowerCase()===analysisState.feed)&&(analysisState.band==='all'||g.band===Number(analysisState.band)));
 return `<section class="card analysis-card"><h2>먹이원과 사육통 용량</h2><div class="analysis-filters">
 ${select('성별','analysis-feedSex',[['M','수컷'],['F','암컷']],analysisState.feedSex,'id="analysis-feedSex"')}
 ${select('먹이원','analysis-feed',[['all','전체 먹이원'],...feeds.map(f=>[f,groups.find(g=>g.feed.toLowerCase()===f).feed])],analysisState.feed,'id="analysis-feed"')}
 ${select('시작 체중 (g)','analysis-band',[['all','전체 체중 구간'],...bands.map(n=>[n,bandLabel(n)])],analysisState.band,'id="analysis-band"')}</div>
 <p class="muted">같은 성별·시작 체중 구간에서 먹이원과 용량별 증체량을 비교합니다. 교체일에 넣어 준 먹이와 용량을 다음 측정일까지 적용합니다. 한 개체에 여러 구간이 있으면 개체별 평균을 먼저 구합니다.</p>
 ${analysisTable(['시작 체중 (g)','먹이원','용량 (cc)','개체 수','측정 구간 수','평균 증감 (g/30일)'],shown.map(g=>[bandLabel(g.band),esc(g.feed),fmt(g.volume),fmt(g.n),fmt(g.count),fmt(g.rate)]),'먹이·용량을 입력한 교체 기록과 다음 날짜의 체중이 필요합니다.')}</section>`;
}
function scorePage(data,rows){
 const scores=lineScores(data,rows);
 const describe=(st,i,raw)=>`${st.points[i]==null?'미평가':fmt(st.points[i],1)+'점'}<small class="species-name">${raw} · n=${st.n[i]}</small>`;
 return `<section class="card analysis-card"><h2>라인 점수 · 수컷 70 mm 목표</h2><p class="muted">라인 기본점은 체장·체중·정상 우화의 네 항목으로 최대 95점입니다. 암컷에게 적용되는 산란 혈통 가산점은 성충 상세와 교배 후보에서 확인할 수 있습니다. 유충 기록의 체장·번데기 무게가 비어 있으면 해당 개체로 연결한 성충의 값을 사용합니다. 분모는 현재 평가할 수 있는 항목의 배점 합계입니다.</p>
 ${analysisTable(['라인','점수 / 평가 가능 배점','70 mm 달성 · '+SCORE_WEIGHTS[0],'무게 대비 체장 · '+SCORE_WEIGHTS[1],'유충 최고 체중 · '+SCORE_WEIGHTS[2],'정상 우화 · '+SCORE_WEIGHTS[3],'산란 기록'],scores.map(st=>[esc(st.line.name),st.max?`<strong>${fmt(st.earned,1)} / ${st.max}</strong>`:'미평가',
 describe(st,0,`${st.hits}/${st.n[0]}마리`),describe(st,1,fmt(st.values[1])+' mm'),describe(st,2,fmt(st.values[2])+' g'),describe(st,3,`${st.normal}/${st.n[3]}마리`),nepAction('nep-sets','산란 세트',st.line.id)]),'네팔렌시스 라인을 등록하면 점수표가 표시됩니다.')}
 <details><summary>산출 기준과 표본 수</summary><ul>
 <li>70 mm 달성은 체장이 기록된 수컷 중 70 mm 이상인 비율, 정상 우화는 결과가 입력된 암수 중 정상 비율입니다.</li>
 <li>무게 대비 체장은 번데기 무게가 ±1 g인 다른 라인 수컷들의 체장 중앙값과 각 수컷의 체장 차이를 구해 라인 중앙값을 냅니다.</li>
 <li>유충 최고 체중은 수컷별 관측 최고 체중의 중앙값입니다.</li>
 <li>무게 대비 체장과 최고 체중은 비교 가능한 다른 라인 중 값이 낮은 라인의 비율에 배점을 곱합니다. 동률은 절반으로 계산합니다. n은 측정된 개체 수입니다.</li></ul></details></section>`;
}
const bonusRule='네팔렌시스 암컷들의 종료 세트를 출생 라인별로 모아 세트당 평균 회수 유충 수를 구합니다. 비교 가능한 라인이 2개 이상이고 해당 평균이 라인 평균들의 중앙값을 초과하면 그 라인 출신 암컷 모두에게 5점을 더합니다. 회수 0마리도 평균에 포함합니다.';
function femaleScoreView(bonus,base){
 const points=bonus.points;
 const label=points==null?'판정 보류':`+${points}점`;
 let evidence='출생 라인 미확인';
 if(bonus.origin){
  evidence=bonus.sets?`평균 ${fmt(bonus.mean)}마리/세트 · ${bonus.sets}세트`:'출생 라인의 종료 세트 없음';
  if(bonus.sets)evidence+=bonus.threshold==null?' · 비교 라인 부족':` · 중앙값 ${fmt(bonus.threshold)}마리`;
 }
 const earned=base?.max?fmt(base.earned,1)+'점':'미평가';
 const total=base?.max&&points!=null?` · 합계 ${fmt(base.earned+points,1)} / ${base.max+FEMALE_BONUS}점`:'';
 return `<strong>${label}</strong><small class="species-name">${evidence}</small><small class="species-name">출생 라인 기본점 ${earned}${base?.max?' (평가 가능 '+base.max+'점)':''}${total}</small>`;
}
function adultBonusSection(adult){
 if(adult.sex!=='F'||!isNep(adult.species))return '';
 const data=nepDataset(),bonus=femaleLineBonuses(data,birthLines(data)).get(adult.id);
 if(!bonus)return '';
 const base=lineScores(data,larvalRows(data)).find(s=>s.line.id===bonus.origin);
 return `<h3 class="detail-subtitle">산란 혈통 가산점</h3>${femaleScoreView(bonus,base)}`;
}
function pairsPage(data,rows){
 const list=crossCandidates(data,rows),baseScores=new Map(lineScores(data,rows).map(s=>[s.line.id,s]));
 return `<section class="card analysis-card"><h2>교배 후보</h2><p class="muted">보유 중인 네팔렌시스 수컷과 암컷 중 같은 출생 라인, 부모·자식, 조부모까지 공통 조상이 확인되는 조합은 제외합니다. 같은 부모 조합, 같은 출생 라인 조합, 첫 시도 순으로 표시합니다. 같은 단계에서는 측정된 수컷 후손 수, 70 mm 달성 수, 암컷 가산점 순으로 정렬합니다.</p>
 ${analysisTable(['수컷','암컷','암컷의 산란 혈통 가산점','조합 근거','70 mm 이상 / 측정 수컷','부모·조부모 기록'],list.map(p=>[esc(p.m.code),esc(p.f.code),femaleScoreView(p.bonus,baseScores.get(p.bonus.origin)),['첫 시도','같은 출생 라인 조합','같은 부모 조합'][p.level],p.n?`${p.hits} / ${p.n}마리`:'미평가',p.complete?'양쪽 모두 확인':'일부 미상']),'혈연 제외 조건을 통과한 보유 수컷·암컷 조합이 없습니다.')}
 <details><summary>암컷 가산점 기준</summary><p>${bonusRule}</p></details></section>`;
}
function analysisPage(){
 const tabs=[['overview','개체 비교'],['growth','성장·기간'],['feed','먹이·용량'],['score','라인 점수'],['pairs','교배 후보']];
 const tab=analysisState.tab,data=nepDataset(),rows=larvalRows(data);
 return `<section class="card analysis-card"><h2><i>Dorcus nepalensis</i></h2><p class="muted">네팔렌시스 전용 분석 · 성충 ${data.adults.length}마리 · 라인 ${data.lines.length}개 · 유충 등록 ${data.larvae.length}마리</p>
 <nav class="nep-tabs" aria-label="분석 메뉴">${tabs.map(([key,label])=>btn('nep-tab',label,tab===key?'primary small':'subtle small',`data-tab="${key}" aria-pressed="${tab===key}"`)).join('')}</nav></section>
 ${tab==='overview'?analysisOverview():tab==='growth'?growthPage(rows):tab==='feed'?feedPage(rows):tab==='score'?scorePage(data,rows):pairsPage(data,rows)}`;
}
function observationForm(v){
 const data=nepDataset(),l=data.lineById.get(v.line_id);
 const linked=new Set(data.larvae.filter(r=>r.id!==v.id).map(r=>r.nep_adult_id));
 const choices=data.adults.filter(a=>!linked.has(a.id)&&a.id!==l.father_id&&a.id!==l.mother_id&&(a.sex===v.sex||[a.sex,v.sex].includes('U')));
 const options=[['','미입력'],['normal','정상 우화'],['imperfect','불완전 우화'],['died','우화 전·중 폐사']];
 return modalFrame('개체 관찰 · '+v.number,`<form id="nep-individual" class="form-grid">
 ${field('개체 부화일','hatch',v.nep_hatched,'date')}${field('개체 용화일','pupated',v.nep_pupated,'date')}
 ${select('관찰한 우화 결과','outcome',options,v.nep_outcome||'')}
 ${select('이 유충이 우화한 성충','adult',[['','연결 안 함'],...choices.map(a=>[a.id,a.code])],v.nep_adult_id||'')}
 </form><p class="muted">Hemiso 전용 관찰 기록입니다. 날짜를 비워 두면 BeetleLog의 부화일·용화일을 사용합니다. 성충을 연결하면 그 성충의 산란·후손 기록을 출생 라인까지 추적할 수 있습니다.</p>`,saveFooter('nep-individual'));
}
function setFields(s,line){
 const candidates=nepDataset().adults.filter(a=>a.sex==='F'&&(!line.mother_id||line.mother_id===a.id));
 return `<fieldset class="nep-set"><legend>산란 세트</legend>${select('모 개체','mother',[['','선택'],...candidates.map(a=>[a.id,a.code])],s.mother||line.mother_id||'','required')}
 ${field('투입일','start',s.start,'date','required')}${field('회수일','end',s.end,'date','required')}${field('회수 유충 수','count',s.count??'','number','required min="0" max="999999" step="1"')}${btn('nep-set-remove','세트 제외','subtle small')}</fieldset>`;
}
const saveFooter=id=>btn('close','취소','subtle')+`<button class="btn primary" form="${id}" type="submit">저장</button>`;
function setsForm(l){
 return modalFrame('산란 세트 · '+l.name,`<p>종료한 세트마다 회수 유충 수를 입력하세요. 한 마리도 회수하지 못한 세트는 0으로 기록합니다.</p><form id="nep-sets"><div id="nep-set-list">${(l.nep_sets||[]).map(s=>setFields(s,l)).join('')}</div>${btn('nep-set-add','세트 추가','subtle small')}</form>`,saveFooter('nep-sets'));
}
async function saveObservation(form,get){
 const original=state.modal.original,data=nepDataset(),isLarva=form.id==='nep-individual',allowed=isLarva?data.larvae:data.lines;
 if(!original||!allowed.some(x=>x.id===original.id))throw Error('네팔렌시스 기록을 확인하세요.');
 let patch;
 if(isLarva){
  patch={nep_hatched:get('hatch')||null,nep_pupated:get('pupated')||null,nep_outcome:get('outcome')||null,nep_adult_id:get('adult')||null};
 }else{
  const sets=[...form.querySelectorAll('.nep-set')].map(el=>{
   const val=n=>el.querySelector('[name="'+n+'"]').value;
   if(!val('mother')||!val('start')||!val('end')||val('count')===''||val('end')<val('start'))throw Error('세트의 모 개체·날짜·회수 수를 확인하세요.');
   return {mother:val('mother'),start:val('start'),end:val('end'),count:Number(val('count'))};
  });
  patch={nep_sets:sets};
 }
 const {data:written,error}=await supa.from(isLarva?'hemiso_larvae':'hemiso_lines').update(patch).eq('id',original.id).eq('updated_at',original.updated_at).select('id').maybeSingle();
 if(error)throw error;if(!written)throw Error('다른 화면에서 먼저 수정했습니다. 기록을 다시 열어 주세요.');
 state.lastSaveSynced=false;await load();state.modal=null;
}
function analysisCsv(){
 const {rows}=analysisSelection(),header=['종','개체번호','라인/혈통','누대','성별','체장(mm)','유충 최대 체중(g)','용화 무게(g)','용화 환원율(%)','우화 환원율(mm/g)','우화일'];
 const cell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
 return '\uFEFF'+[header,...rows.map(r=>[r.species,r.code,r.line,r.generation,sexLabel(r.sex),r.size,r.peak,r.pupal,r.pupation,r.ratio,r.emerged])].map(r=>r.map(cell).join(',')).join('\r\n');
}

function syncPage(){
 const count=state.adults.filter(a=>a.beetlelog_id).length+state.lines.filter(l=>l.beetlelog_id).length;
 return `<section class="card"><div class="section-heading"><div><h2>같은 계정의 기록을 연결하세요</h2><p class="muted">BeetleLog에서 필요한 종과 성충·라인만 선택해 가져올 수 있습니다.</p></div><span class="badge">${count}건 연결됨</span></div><p>라인을 가져오면 부모 개체와 해당 라인의 유충 기록도 함께 연결됩니다.</p><div class="actions" style="margin-top:22px">${btn('open-import',icon('plus')+'기록 선택해서 가져오기','primary')}</div></section><section class="card"><div class="section-heading"><div><h2>연결된 기록 동기화</h2><p class="muted">변경을 확인하고 필요한 방향으로 반영하세요.</p></div>${icon('sync')}</div><div class="sync-summary"><div><h3>BeetleLog → Hemiso</h3><p class="muted">자동 확인 외에 즉시 최신 기록을 불러올 수 있습니다.</p>${btn('sync-pull','BeetleLog 변경 불러오기','subtle',state.busy?'disabled':'')}</div><div><h3>Hemiso → BeetleLog</h3><p class="muted">기존에 남아 있는 미반영 변경을 수동으로 보냅니다. 새 수정은 저장 시 함께 반영됩니다.</p>${btn('sync-push','BeetleLog에 반영','primary',state.busy?'disabled':'')}</div></div><div class="notice">Hemiso에서 연결 기록을 저장하면 BeetleLog에도 즉시 반영됩니다. BeetleLog 변경은 접속·화면 복귀 시와 30초마다 자동 확인합니다. 편집 중에는 자동 갱신을 멈추고, 양쪽에서 같은 기록을 수정한 경우 충돌을 표시합니다. Hemiso에서 새로 만든 미연결 기록과 삭제는 BeetleLog에 자동 반영되지 않습니다.</div>${state.syncResult?syncReport(state.syncResult):''}</section><section class="card"><div class="section-heading"><div><h2>내 기록 백업</h2><p class="muted">현재 성충·라인·유충 기록을 JSON 파일로 내려받습니다.</p></div>${btn('backup','백업 다운로드','subtle')}</div></section>`;
}
function syncReport(r){return `<div class="notice" role="status"><strong>반영 결과</strong><p>성충 ${Number(r.updated_adults??r.imported_adults??0)} · 라인 ${Number(r.updated_lines??r.imported_lines??0)} · 유충 ${Number(r.updated_larvae??r.imported_larvae??0)}</p>${r.conflicts?.length?`<p>충돌 ${r.conflicts.length}건 — 원본과 현재 내용을 확인해 주세요.</p><ul>${r.conflicts.map(x=>`<li>${esc(x.name||x.id)}: ${esc(x.reason)}</li>`).join('')}</ul>`:''}${r.issues?.length?`<ul>${r.issues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</div>`;}
function showModal(kind,id){const list=kind==='adult-form'?state.adults:['line-form','nep-sets'].includes(kind)?state.lines:['larva-form','nep-individual'].includes(kind)?state.larvae:[];state.modal={kind,id,photo:undefined,original:list.find(x=>x.id===id)};renderModal();}
function closeModal(){state.modal=null;renderModal();}
function modalFrame(title,body,foot=''){return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><header class="modal-head"><h2>${esc(title)}</h2>${btn('close',icon('close'),'subtle small','aria-label="닫기"')}</header><div class="modal-body">${body}<div class="notice" id="edit-error" role="alert" hidden></div></div>${foot?`<footer class="modal-actions">${foot}</footer>`:''}</section></div>`;}
function renderModal(){
 const root=document.querySelector('#modal-root');if(!root)return;
 const m=state.modal;if(!m){root.innerHTML='';document.body.style.overflow='';return;}
 let html='';
 if(m.kind==='adult-form')html=adultForm(findAdult(m.id)||{});
 else if(m.kind==='line-form')html=lineForm(findLine(m.id)||{});
 else if(m.kind==='adult-detail')html=adultDetail(findAdult(m.id));
 else if(m.kind==='line-detail')html=lineDetail(findLine(m.id));
 else if(m.kind==='larva-form')html=larvaForm(state.larvae.find(v=>v.id===m.id)||{line_id:m.lineId});
 else if(m.kind==='nep-individual'&&nepDataset().larvae.some(v=>v.id===m.id))html=observationForm(m.original);
 else if(m.kind==='nep-sets'&&nepDataset().lineById.has(m.id))html=setsForm(m.original);
 else if(m.kind==='import')html=importModal();
 else if(m.kind==='confirm-delete')html=modalFrame('기록 삭제',`<p><strong>${esc(m.name)}</strong> 기록을 삭제합니다. 삭제 후 복구할 수 없습니다.</p><p class="muted">BeetleLog 원본은 삭제되지 않습니다. 다른 기록에 연결되어 있으면 삭제가 제한됩니다.</p>`,btn('close','취소','subtle')+btn('delete-confirm','삭제','danger'));
 root.innerHTML=html;document.body.style.overflow='hidden';
 root.querySelector('input:not([type=file]),select,button')?.focus({preventScroll:true});
}
function adultForm(a){
 const body=`<form id="adult-form" class="form-grid">${field('관리번호 *','code',a.code,'text','required maxlength="80" placeholder="예: NEP26-001"')}${field('종 *','species',a.species||'Dorcus nepalensis','text','required maxlength="200" list="species-options"')}<datalist id="species-options">${['Dorcus nepalensis','Dorcus donckieri','Dorcus arrowi','Dorcus wardi'].map(s=>`<option>${s}</option>`).join('')}</datalist>${field('혈통명','lineage',a.lineage,'text','maxlength="120"')}${field('누대','generation',a.generation,'text','maxlength="30" placeholder="예: F2 / CB / Wild"')}${select('성별 *','sex',[['M','♂ 수컷'],['F','♀ 암컷'],['U','미확인']],a.sex||'M')}${field('크기 (mm)','size',a.size,'number','min="0" max="200" step="0.01"')}${field('용화 무게 (g)','pupal_weight',pupalWeight(a),'number','min="0.001" max="9999.999" step="0.001" placeholder="예: 12.5"')}<p class="muted wide">연결된 성충은 저장하면 BeetleLog에도 함께 반영됩니다. 용화 무게를 지우면 양쪽 기록에서 비워집니다.</p>${field('우화일','emerged',a.emerged,'date')}${select('보유 상태','status',[['보유','보유'],['분양','분양'],['사망','사망']],a.status||'보유')}${select('입수 경로','source',[['우화','우화'],['입양','입양'],['채집','채집']],a.source||'입양')}${field('브리더','breeder',a.breeder,'text','maxlength="120"')}${select('부 개체','father_id',parentOptions('M',a.id),a.father_id||'')}${select('모 개체','mother_id',parentOptions('F',a.id),a.mother_id||'')}<label class="field wide">사진<input type="file" id="adult-photo" accept="image/jpeg,image/png,image/webp"><small class="muted">JPEG·PNG·WebP · 저장 전 자동 축소</small><img id="photo-preview" class="photo-preview" src="${esc(safePhoto(a.photo_url))}" alt="성충 사진 미리보기" ${safePhoto(a.photo_url)?'':'hidden'}>${btn('photo-remove','사진 지우기','subtle small')}</label><label class="field wide">메모<textarea name="note" rows="3" maxlength="3000">${esc(a.note)}</textarea></label></form>`;
 return modalFrame(a.id?'성충 수정':'성충 등록',body,btn('close','취소','subtle')+`<button class="btn primary" form="adult-form" type="submit">${a.id?'수정 완료':'등록'}</button>`);
}
function lineForm(l){return modalFrame(l.id?'라인 수정':'라인 등록',`<form id="line-form" class="form-grid">${field('라인명 *','name',l.name,'text','required maxlength="80" placeholder="예: NEP26-A"')}${field('종 *','species',l.species||'Dorcus nepalensis','text','required maxlength="200"')}${select('부 개체','father_id',parentOptions('M'),l.father_id||'')}${select('모 개체','mother_id',parentOptions('F'),l.mother_id||'')}${field('누대','generation',l.generation,'text','maxlength="30"')}${field('교배 연도','year',l.year||new Date().getFullYear(),'number','min="1980" max="2200"')}${field('산란 방법','method',l.method,'text','maxlength="200" placeholder="예: 산란목 / 매트"')}<div class="field"><span>Wild 라인</span><label class="inline-check"><input type="checkbox" name="is_wild" ${l.is_wild?'checked':''}> 채집 암컷 라인</label></div><label class="field wide">메모<textarea name="note" maxlength="3000" rows="3">${esc(l.note)}</textarea></label></form>`,btn('close','취소','subtle')+`<button class="btn primary" form="line-form" type="submit">${l.id?'수정 완료':'등록'}</button>`);}
function parentCard(id,label){const a=findAdult(id);return `<div class="parent-card"><small>${label}</small>${a?`<button class="record-link" data-action="adult-detail" data-id="${a.id}">${esc(a.code)}</button><span>${esc(a.lineage||a.species)}</span><small>${esc(a.generation||'—')} · ${a.size==null?'—':esc(a.size)+' mm'}</small>`:'<strong>미지정</strong>'}</div>`;}
function adultDetail(a){if(!a)return modalFrame('성충을 찾을 수 없습니다.','목록을 새로고침해 주세요.');
 return modalFrame(a.code,`<div class="detail-grid"><div class="detail-photo">${safePhoto(a.photo_url)?`<img src="${esc(safePhoto(a.photo_url))}" alt="${esc(a.code)} 사진">`:`<div class="specimen-placeholder">${icon('adults')}<span>등록된 사진 없음</span></div>`}</div><div><p class="eyebrow">${esc(a.species)}</p><h2>${esc(a.lineage||'혈통 미상')}</h2><p>${badge(a.sex)} ${linked(a)}</p><dl class="detail-list">${[['크기',a.size==null?'—':a.size+' mm'],['용화 무게',pupalWeight(a)==null?'—':pupalWeight(a)+' g'],['환원율',positive(a.size)&&pupalWeight(a)?fmt(a.size/pupalWeight(a))+' mm/g':'—'],['누대',a.generation],['우화일',a.emerged],['상태',a.status],['입수 경로',a.source],['브리더',a.breeder]].map(([k,v])=>`<div><dt>${k}</dt><dd>${note(v)}</dd></div>`).join('')}</dl></div></div>${adultBonusSection(a)}<h3 class="detail-subtitle">계통도</h3><div class="pedigree">${parentCard(a.father_id,'♂ 부')}${parentCard(a.mother_id,'♀ 모')}</div><div class="pedigree grandparents">${parentCard(findAdult(a.father_id)?.father_id,'부계 조부')}${parentCard(findAdult(a.father_id)?.mother_id,'부계 조모')}${parentCard(findAdult(a.mother_id)?.father_id,'모계 조부')}${parentCard(findAdult(a.mother_id)?.mother_id,'모계 조모')}</div><h3 class="detail-subtitle">메모</h3><p class="record-note">${note(a.note)}</p>`,btn('adult-delete','삭제','danger',`data-id="${a.id}"`)+btn('adult-edit','수정','primary',`data-id="${a.id}"`));}
function lineDetail(l){if(!l)return modalFrame('라인을 찾을 수 없습니다.','목록을 새로고침해 주세요.');const larvae=state.larvae.filter(v=>v.line_id===l.id).sort((a,b)=>a.number.localeCompare(b.number,undefined,{numeric:true}));return modalFrame(l.name,`<p class="eyebrow">${esc(l.species)}</p><div class="actions" style="margin:14px 0">${linked(l)}<span class="badge">${esc(l.generation||'누대 미상')}</span><span class="badge">${note(l.year)}</span>${l.is_wild?'<span class="badge">Wild</span>':''}</div><div class="pedigree">${parentCard(l.father_id,'♂ 부')}${parentCard(l.mother_id,'♀ 모')}</div><dl class="detail-list"><div><dt>산란 방법</dt><dd>${note(l.method)}</dd></div></dl><p class="record-note">${note(l.note)}</p><div class="section-heading detail-subtitle"><h3>유충 기록 <span class="muted">${larvae.length}</span></h3>${btn('larva-new','유충 추가','subtle small',`data-id="${l.id}"`)}</div>${larvae.length?`<div class="table-wrap"><table><thead><tr><th>개체번호</th><th>성별</th><th>최근 교체일</th><th>최근 무게</th><th>용화 무게</th><th>우화 크기</th><th>환원율</th><th>수정</th></tr></thead><tbody>${larvae.map(v=>{const r=(v.records||[]).at(-1)||[];return `<tr><td><button class="record-link" data-action="larva-edit" data-id="${v.id}">${esc(v.number)}</button></td><td>${badge(v.sex)}</td><td>${note(r[0])}</td><td>${r[3]==null||r[3]===''?'—':esc(r[3])+' g'}</td><td>${pupalWeight(v)==null?'—':fmt(pupalWeight(v))+' g'}</td><td>${v.size==null?'—':esc(v.size)+' mm'}</td><td>${positive(v.size)&&pupalWeight(v)?fmt(v.size/pupalWeight(v))+' mm/g':'—'}</td><td>${btn('larva-edit','수정','subtle small',`data-id="${esc(v.id)}"`)}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="muted">아직 등록한 유충이 없습니다.</p>'}`,btn('line-delete','삭제','danger',`data-id="${l.id}"`)+btn('line-edit','수정','primary',`data-id="${l.id}"`));}
function larvaForm(v){return modalFrame(v.id?'유충 기록 수정':'유충 추가',`<form id="larva-form" class="form-grid">${field('개체번호 *','number',v.number,'text','required maxlength="80"')}${select('성별','sex',[['U','미확인'],['M','수컷'],['F','암컷']],v.sex||'U')}${field('용화 무게 (g)','pupal_weight',pupalWeight(v),'number','min="0.001" max="9999.999" step="0.001" placeholder="예: 12.5"')}<p class="muted wide">연결된 유충은 저장하면 용화 무게와 체중 기록도 BeetleLog에 함께 반영됩니다. 환원율은 우화 체장 ÷ 용화 무게(mm/g)로 계산합니다.</p>${field('우화일','emerged',v.emerged,'date')}${field('우화 크기 (mm)','size',v.size,'number','min="0" max="200" step="0.01"')}<div class="field wide"><span>먹이 교체 · 체중 기록</span><small class="muted">교체일 / 먹이원 / 용량 / 무게(g)</small><div id="larva-records">${(v.records?.length?v.records:[['','','','']]).map(r=>recordRow(r)).join('')}</div>${btn('record-add','기록 줄 추가','subtle small')}</div></form>`,(v.id?btn('larva-delete','유충 삭제','danger',`data-id="${v.id}"`):'')+btn('close','취소','subtle')+`<button class="btn primary" form="larva-form" type="submit">저장</button>`);}
function recordRow(r){return `<div class="larva-record-row"><input type="date" data-record="0" aria-label="교체일" value="${esc(r[0]||'')}"><input data-record="1" aria-label="먹이원" placeholder="먹이원" value="${esc(r[1]??'')}"><input data-record="2" aria-label="용량" placeholder="용량" value="${esc(r[2]??'')}"><input type="number" min="0" step="0.01" data-record="3" aria-label="무게 (g)" placeholder="무게(g)" value="${esc(r[3]??'')}">${btn('record-remove','×','subtle small','aria-label="기록 줄 삭제"')}</div>`;}
function importModal(){const data=state.source;return modalFrame('BeetleLog에서 가져오기',!data?'<p>기록을 불러오는 중…</p>':`<p class="muted">라인을 선택하면 부모와 유충도 함께 가져옵니다. 이미 연결한 라인은 다시 선택해 누락 유충을 추가할 수 있습니다.</p><div class="filters"><label class="search-field"><span class="sr-only">원본 검색</span><input id="source-search" type="search" placeholder="관리번호 · 종 · 혈통 검색" value="${esc(state.sourceSearch)}"></label><label class="sr-only" for="source-species">가져올 종</label><select id="source-species"><option value="all">전체 종</option>${[...new Set([...data.parents,...data.lines].map(x=>x.species).filter(Boolean))].sort().map(s=>`<option ${state.sourceSpecies===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div><div class="actions">${btn('source-all','표시 항목 모두 선택','subtle small')}${btn('source-none','선택 해제','subtle small')}</div><div id="source-list">${sourceRows()}</div>`,btn('close','닫기','subtle')+btn('import-save','선택한 기록 가져오기','primary',!data||state.busy?'disabled':''));}
function sourceFiltered(kind){const q=state.sourceSearch.toLowerCase().trim();return (state.source?.[kind]||[]).filter(x=>(state.sourceSpecies==='all'||x.species===state.sourceSpecies)&&[x.code,x.species,x.line,x.gen].some(s=>String(s||'').toLowerCase().includes(q)));}
function sourceRows(){return ['parents','lines'].map(kind=>`<h3 class="detail-subtitle">${kind==='parents'?'성충':'라인'} ${sourceFiltered(kind).length}건</h3><div class="checkbox-list">${sourceFiltered(kind).map(x=>{const exists=(kind==='parents'?state.adults:state.lines).some(a=>a.beetlelog_id===String(x.id));const taken=kind==='parents'&&exists;const selected=kind==='parents'?state.selectedAdults:state.selectedLines;return `<label class="checkbox-row"><input type="checkbox" data-source="${kind}" value="${esc(x.id)}" ${taken?'disabled':selected.has(String(x.id))?'checked':''}><span><strong>${esc(x.code||'관리번호 미등록')}</strong><small>${esc(x.species||'종 미지정')} · ${esc(x.line||x.gen||'')}</small></span>${exists?`<span class="badge muted">${kind==='parents'?'연결됨':'누락 유충 추가 가능'}</span>`:''}</label>`;}).join('')||'<p class="muted">표시할 기록이 없습니다.</p>'}</div>`).join('');}
async function openImport(){state.source=null;state.sourceSearch='';state.sourceSpecies='all';state.selectedAdults.clear();state.selectedLines.clear();showModal('import');try{const {data,error}=await supa.from('beetlelog_data').select('data').eq('user_key','user:'+EMAIL).maybeSingle();if(error)throw error;if(!data?.data)throw Error('이 계정의 BeetleLog 기록이 없습니다.');state.source={parents:Array.isArray(data.data.parents)?data.data.parents:[],lines:Array.isArray(data.data.lines)?data.data.lines:[]};if(state.modal?.kind==='import')renderModal();}catch(e){toast(e.message);closeModal();}}
async function persist(table,payload,old){
 state.lastSaveSynced=false;
 if(old?.id){
  const {data,error}=await supa.rpc('hemiso_save_record',{p_kind:table,p_id:old.id,p_expected_updated_at:old.updated_at,p_patch:payload});
  if(error)throw error;if(!data?.record)throw Error('저장 결과를 확인하지 못했습니다. 새로고침 후 확인해 주세요.');
  state.lastSaveSynced=Boolean(data.synced);await load();return data.record;
 }
 const {data,error}=await supa.from('hemiso_'+table).insert(payload).select().maybeSingle();if(error)throw error;if(!data)throw Error('저장 결과가 없습니다.');await load();return data;
}
function syncNotice(){return state.syncError?`<div class="notice" role="status">자동 연동 확인이 지연되고 있습니다. ${esc(state.syncError)} ${btn('refresh','다시 확인','subtle small')}</div>`:state.syncResult?.conflicts?.length?`<div class="notice" role="status">양쪽 변경을 확인해야 하는 기록 ${state.syncResult.conflicts.length}건이 있습니다. <a href="#sync">연동 결과 보기</a></div>`:'';}
async function pullLinked({paint=true,force=false}={}){
 if(!state.allowed||state.pulling||(!force&&(state.busy||state.modal||document.visibilityState==='hidden')))return;
 if(![...state.adults,...state.lines,...state.larvae].some(r=>r.beetlelog_id))return;
 state.pulling=true;
 try{
  const {data,error}=await supa.rpc('hemiso_sync_beetlelog',{p_direction:'pull'});if(error)throw error;
  if(!state.allowed)return;
  const changed=['updated_adults','updated_lines','updated_larvae'].some(k=>Number(data?.[k])>0);
  const reportChanged=JSON.stringify(state.syncResult?.conflicts||[])!==JSON.stringify(data?.conflicts||[]),hadError=Boolean(state.syncError);
  state.syncError='';state.syncResult=data;
  if(changed)await load();
  if(paint&&(changed||reportChanged||hadError)&&!state.modal&&!state.busy)render();
  return data;
 }catch(e){if(state.allowed){state.syncError=e.message||String(e);if(paint&&!state.modal&&!state.busy)render();}return {error:e};}
 finally{state.pulling=false;}
}

async function submitForm(form){
 if(state.busy)return;state.busy=true;const submit=document.querySelector(`[form="${form.id}"]`);if(submit)submit.disabled=true;
 const f=new FormData(form), get=k=>String(f.get(k)||'').trim(), nullable=k=>get(k)||null, number=k=>get(k)===''?null:Number(get(k));
 try{
  if(['nep-individual','nep-sets'].includes(form.id)){await saveObservation(form,get);}
  else if(form.id==='adult-form'){
   const old=state.modal.original||findAdult(state.modal.id);const p={code:get('code'),species:get('species'),lineage:get('lineage'),generation:get('generation'),sex:get('sex'),size:number('size'),pupal_weight:number('pupal_weight'),emerged:nullable('emerged'),status:get('status'),source:get('source'),breeder:get('breeder'),father_id:nullable('father_id'),mother_id:nullable('mother_id'),note:get('note')};
   if(state.modal.photo!==undefined)p.photo_url=state.modal.photo;
   const a=await persist('adults',p,old);state.modal={kind:'adult-detail',id:a.id};
  }else if(form.id==='line-form'){
   const p={name:get('name'),species:get('species'),generation:get('generation'),father_id:nullable('father_id'),mother_id:nullable('mother_id'),year:number('year'),is_wild:f.has('is_wild'),method:get('method'),note:get('note')};
   const l=await persist('lines',p,state.modal.original||findLine(state.modal.id));state.modal={kind:'line-detail',id:l.id};
  }else if(form.id==='larva-form'){
   const old=state.modal.original||state.larvae.find(v=>v.id===state.modal.id);const records=[...form.querySelectorAll('.larva-record-row')].map(row=>[...row.querySelectorAll('input')].map(e=>e.value.trim())).filter(r=>r.some(v=>v!==''));
   const p={line_id:old?.line_id||state.modal.lineId,number:get('number'),sex:get('sex'),size:number('size'),pupal_weight:number('pupal_weight'),emerged:nullable('emerged'),records};
   await persist('larvae',p,old);state.modal={kind:'line-detail',id:p.line_id};
  }
  render();toast(state.lastSaveSynced?'Hemiso와 BeetleLog에 함께 저장했습니다.':'Hemiso에 저장했습니다.');
 }catch(e){const box=document.querySelector('#edit-error');if(box){box.textContent=friendlyError(e);box.hidden=false;}toast(friendlyError(e));}finally{state.busy=false;if(submit)submit.disabled=false;}
}
function friendlyError(e){if(e.code==='23505')return '같은 관리번호 또는 이름의 기록이 이미 있습니다.';if(e.code==='23503')return '부모 개체나 유충에 연결된 기록입니다. 연결을 먼저 확인해 주세요.';return e.message||String(e);}
async function sync(direction){if(state.busy)return;state.busy=true;render();try{const {data,error}=await supa.rpc('hemiso_sync_beetlelog',{p_direction:direction});if(error)throw error;state.syncResult=data;await load();toast(data?.conflicts?.length?'충돌한 기록은 덮어쓰지 않았습니다. 결과를 확인해 주세요.':'동기화가 완료되었습니다.');}catch(e){toast(e.message);}finally{state.busy=false;render();}}
async function action(name,el){
 switch(name){
 case 'login':{const redirect=new URL('./',location.href);redirect.hash='';redirect.search='';const {error}=await supa.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect.href,queryParams:{prompt:'select_account'}}});if(error)toast(error.message);break;}
 case 'logout':{await supa.auth.signOut();state.user=null;state.allowed=false;state.adults=[];state.lines=[];state.larvae=[];state.source=null;state.modal=null;state.syncResult=null;state.syncError='';document.body.style.overflow='';render();break;}
 case 'refresh':{const result=await pullLinked({paint:false,force:true});await load();render();toast(result?.error?'연동을 확인하지 못했습니다. 안내를 확인해 주세요.':result?.conflicts?.length?'충돌한 기록을 확인해 주세요.':'BeetleLog의 최신 기록까지 불러왔습니다.');break;}
 case 'adult-new':showModal('adult-form');break;
 case 'adult-edit':showModal('adult-form',el.dataset.id);break;
 case 'adult-detail':showModal('adult-detail',el.dataset.id);break;
 case 'line-new':showModal('line-form');break;
 case 'line-edit':showModal('line-form',el.dataset.id);break;
 case 'line-detail':showModal('line-detail',el.dataset.id);break;
 case 'larva-new':state.modal={kind:'larva-form',lineId:el.dataset.id};renderModal();break;
 case 'larva-edit':showModal('larva-form',el.dataset.id);break;
 case 'close':if(!state.busy)closeModal();break;
 case 'photo-remove':state.modal.photo='';document.querySelector('#photo-preview').hidden=true;document.querySelector('#adult-photo').value='';break;
 case 'record-add':document.querySelector('#larva-records').insertAdjacentHTML('beforeend',recordRow(['','','','']));break;
 case 'record-remove':el.closest('.larva-record-row').remove();break;
 case 'adult-delete':case 'line-delete':case 'larva-delete':{const table=name.split('-')[0]==='adult'?'adults':name.split('-')[0]==='line'?'lines':'larvae';const record=state[table].find(x=>x.id===el.dataset.id);state.modal={kind:'confirm-delete',table,id:record.id,name:record.code||record.name||record.number,version:record.updated_at};renderModal();break;}
 case 'delete-confirm':{if(state.busy)return;const m=state.modal;state.busy=true;try{const {data,error}=await supa.from('hemiso_'+m.table).delete().eq('id',m.id).eq('updated_at',m.version).select('id').maybeSingle();if(error)throw error;if(!data)throw Error('기록이 변경되었습니다. 새로고침 후 다시 확인해 주세요.');await load();closeModal();render();toast('기록을 삭제했습니다.');}finally{state.busy=false;}break;}
 case 'open-import':await openImport();break;
 case 'source-none':state.selectedAdults.clear();state.selectedLines.clear();document.querySelector('#source-list').innerHTML=sourceRows();break;
 case 'source-all':for(const kind of ['parents','lines'])for(const x of sourceFiltered(kind)){if(kind==='lines'||!state.adults.some(a=>a.beetlelog_id===String(x.id)))(kind==='parents'?state.selectedAdults:state.selectedLines).add(String(x.id));}document.querySelector('#source-list').innerHTML=sourceRows();break;
 case 'import-save':{if(state.busy)return;if(!state.selectedAdults.size&&!state.selectedLines.size){toast('가져올 기록을 선택해 주세요.');return;}state.busy=true;el.disabled=true;try{const {data,error}=await supa.rpc('hemiso_import_beetlelog',{p_adult_ids:[...state.selectedAdults],p_line_ids:[...state.selectedLines]});if(error)throw error;state.syncResult=data;await load();closeModal();state.page='sync';location.hash='sync';render();toast('선택한 기록을 가져왔습니다.');}finally{state.busy=false;el.disabled=false;}break;}
 case 'sync-pull':await sync('pull');break;
 case 'sync-push':await sync('push');break;
 case 'nep-tab':analysisState.tab=el.dataset.tab;render();break;
 case 'nep-individual':case 'nep-sets':showModal(name,el.dataset.id);break;
 case 'nep-set-add':document.querySelector('#nep-set-list').insertAdjacentHTML('beforeend',setFields({},state.modal.original));break;
 case 'nep-set-remove':el.closest('.nep-set').remove();break;
 case 'analysis-csv':{const url=window.URL.createObjectURL(new Blob([analysisCsv()],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Hemiso_comparison_'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>window.URL.revokeObjectURL(url),1000);break;}
 case 'backup':{const content=JSON.stringify({format:'Hemiso_DB',version:1,exported_at:new Date().toISOString(),adults:state.adults,lines:state.lines,larvae:state.larvae},null,2);const url=window.URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Hemiso_DB_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>window.URL.revokeObjectURL(url),1000);break;}
 }
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;action(b.dataset.action,b).catch(err=>toast(friendlyError(err)));});
document.addEventListener('submit',e=>{if(['adult-form','line-form','larva-form','nep-individual','nep-sets'].includes(e.target.id)){e.preventDefault();submitForm(e.target);}});
document.addEventListener('input',e=>{if(e.target.id==='record-search'){state.search=e.target.value;document.querySelector('#records-results').innerHTML=state.page==='adults'?adultResults(filtered('adults')):lineResults(filtered('lines'));}if(e.target.id==='source-search'){state.sourceSearch=e.target.value;document.querySelector('#source-list').innerHTML=sourceRows();}});
document.addEventListener('change',e=>{
 const id=e.target.id;
 if(id.startsWith('analysis-')){const key=id.slice(9);if(Object.hasOwn(analysisState,key)){analysisState[key]=e.target.value;if(key==='source'){analysisState.line='all';analysisState.metric='size';}render();}return;}
 if(id.startsWith('filter-')){state[id.slice(7)]=e.target.value;document.querySelector('#records-results').innerHTML=state.page==='adults'?adultResults(filtered('adults')):lineResults(filtered('lines'));}
 if(id==='source-species'){state.sourceSpecies=e.target.value;document.querySelector('#source-list').innerHTML=sourceRows();}
 if(e.target.dataset.source){const set=e.target.dataset.source==='parents'?state.selectedAdults:state.selectedLines;e.target.checked?set.add(e.target.value):set.delete(e.target.value);}
 if(id==='adult-photo')uploadPhoto(e.target.files[0]).catch(err=>toast(err.message));
});
async function uploadPhoto(file){
 if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPEG·PNG·WebP 사진을 선택해 주세요.');if(file.size>20*1024*1024)throw Error('20MB 이하의 사진을 선택해 주세요.');
 const modal=state.modal;const bitmap=await createImageBitmap(file);const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const data=canvas.toDataURL('image/jpeg',.78);if(data.length>1900000)throw Error('사진 용량이 큽니다. 작은 사진으로 다시 시도해 주세요.');if(state.modal!==modal)return;modal.photo=data;const img=document.querySelector('#photo-preview');if(img){img.src=data;img.hidden=false;}
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.modal&&!state.busy)closeModal();if(e.key==='Tab'&&state.modal){const modal=document.querySelector('.modal');const focusable=[...modal.querySelectorAll('button:not(:disabled),input:not(:disabled),select,textarea,a[href]')].filter(x=>x.getClientRects().length);const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
function navigate(){const p=location.hash.slice(1);state.page=['adults','lines','analysis','sync'].includes(p)?p:'home';state.search='';state.sex='all';state.species='all';state.status='all';closeModal();render();}
window.addEventListener('hashchange',navigate);
window.addEventListener('focus',()=>pullLinked());
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')pullLinked();});
setInterval(()=>pullLinked(),30000);
state.page=['adults','lines','analysis','sync'].includes(location.hash.slice(1))?location.hash.slice(1):'home';
supa?.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){state.allowed=false;state.user=null;state.adults=[];state.lines=[];state.larvae=[];state.source=null;state.modal=null;document.body.style.overflow='';render();}else if(event==='SIGNED_IN'&&state.ready&&!state.allowed&&session?.user){setTimeout(boot,0);}});
boot();
})();
