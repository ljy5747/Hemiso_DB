const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const marker = /\nboot\(\);\n\}\)\(\);\s*$/;
assert.match(source, marker, 'Expected terminal boot call for isolated test harness');
const instrumented = source.replace(marker, '\nglobalThis.test={state,analysisState,nepDataset,larvalRows,growthProfile,feedGroups,lineScores,observedOutcome,growthObservation,recordedEggSets,crossCandidates,pupalWeight,analysisRows,analysisSelection,analysisPage,analysisCsv,analysisGrowth,positive,average,esc,safePhoto,adultTable,adultDetail,adultForm,lineDetail,lineForm,larvaForm,recordRow,sourceRows,sourceFiltered,syncReport,pullLinked,showModal,persist,submitForm,action,boot,render};\n})();');
const elements = new Map();
const makeElement = () => ({innerHTML:'', textContent:'', className:'', style:{}, disabled:false, hidden:false, value:'', focus(){}, querySelector(){return null;}, querySelectorAll(){return [];}, click(){}, insertAdjacentHTML(_position,value){this.innerHTML+=value;}});
const element = selector => {if(!elements.has(selector))elements.set(selector,makeElement());return elements.get(selector);};
const calls = [];
const server = {adults:[], lines:[], larvae:[]};
let stale = false, authorize = true, signedUser = null, oauthOptions = null, pullResult={updated_adults:0,updated_lines:0,updated_larvae:0,conflicts:[]}, rpcFailure=null;
const auth = {
 async getUser(){return {data:{user:signedUser},error:null};},
 async signInWithOAuth(options){oauthOptions=options;return {error:null};},
 async signOut(){return {error:null};},
 onAuthStateChange(){},
};
const client = {auth,
 from(table){
  const call={table,operation:'select',filters:[]};
  const kind=table.replace('hemiso_','');
  const chain={
   select(columns='*'){call.columns=columns;return chain;},
   insert(payload){call.operation='insert';call.payload=payload;return chain;},
   update(payload){call.operation='update';call.payload=payload;return chain;},
   delete(){call.operation='delete';return chain;},
   eq(key,value){call.filters.push([key,value]);return chain;},
   async order(){calls.push(call);return {data:server[kind]||[],error:null};},
   async maybeSingle(){
    calls.push(call);
    if(stale && call.operation!=='select')return {data:null,error:null};
    const target=call.filters.find(([k])=>k==='id')?.[1];
    const row={...(server[kind]?.find(x=>x.id===target)||{}),id:target||'fixture-created',updated_at:'fixture-new-version',...call.payload};
    if(call.operation==='insert')server[kind].unshift(row);
    if(call.operation==='update')server[kind]=server[kind].map(x=>x.id===target?row:x);
    if(call.operation==='delete')server[kind]=server[kind].filter(x=>x.id!==target);
    return {data:call.operation==='select'?(server[kind]||[])[0]||null:row,error:null};
   },
  };return chain;
 },
 async rpc(name,args){
  calls.push({rpc:name,args});
  if(name==='hemiso_save_record'){
   if(stale||rpcFailure)return {data:null,error:{code:'40001',message:'다른 화면에서 먼저 수정했습니다. '+(rpcFailure||'')}};
   const row={...server[args.p_kind].find(r=>r.id===args.p_id),...args.p_patch,updated_at:'fixture-new-version'};
   server[args.p_kind]=server[args.p_kind].map(r=>r.id===row.id?row:r);
   return {data:{record:row,synced:Boolean(row.beetlelog_id)},error:null};
  }
  if(name==='hemiso_sync_beetlelog')return {data:pullResult,error:rpcFailure?{message:rpcFailure}:null};
  return {data:name==='hemiso_authorized'?authorize:{imported_adults:0,imported_lines:0,imported_larvae:0,issues:[]},error:null};
 },
};
class FixtureFormData {
 constructor(form){this.data=form.values;}
 get(name){return this.data[name]??null;}
 has(name){return Object.hasOwn(this.data,name);}
}
const sandbox={
 window:{supabase:{createClient(){return client;}},URL,addEventListener(){}},
 document:{querySelector:element,addEventListener(){},body:{style:{}},createElement:makeElement},
 location:{hash:'',href:'https://example.invalid/Hemiso_DB/'},FormData:FixtureFormData,URL,Blob,
 setTimeout(){return 1;},setInterval(){return 1;},clearTimeout(){},console,
};
vm.runInNewContext(instrumented,sandbox,{filename:'app.js'});
const t=sandbox.test, s=t.state;
const text='<img src=x onerror="globalThis.pwned=1"> & "quotes"';
const a={id:'adult-fixture',code:text,species:text,lineage:text,generation:text,sex:'M',size:0,note:text,photo_url:'javascript:alert(1)',breeder:text,source:'입양',status:'보유',updated_at:'version-one'};
const line={id:'line-fixture',name:text,species:text,father_id:a.id,year:2026,method:text,note:text,updated_at:'version-one'};
s.adults=[a];s.lines=[line];s.larvae=[{id:'larva-fixture',line_id:line.id,number:text,sex:'U',size:0,records:[['2026-10-01',text,'800','0']]}];
for(const html of [t.adultTable([a]),t.adultDetail(a),t.adultForm(a),t.lineDetail(line),t.lineForm(line),t.larvaForm(s.larvae[0]),t.syncReport({conflicts:[{name:text,reason:text}],issues:[text]})]){
 assert.ok(!html.includes(text),'Unescaped record field in generated HTML');
 assert.ok(!html.includes('<img src=x'),'Injected tag survived escaping');
 assert.ok(html.includes('&lt;img'),'Expected escaped fixture text');
}
assert.equal(t.safePhoto('javascript:alert(1)'), '');
assert.equal(t.safePhoto('data:image/svg+xml;base64,unsafe'), '');
assert.equal(t.safePhoto('data:image/png;base64,AA=='), 'data:image/png;base64,AA==');
assert.match(t.adultTable([a]),/0 mm/,'Zero adult length must remain visible');
assert.match(t.lineDetail(line),/0 g/,'Zero larva weight must remain visible');
assert.match(t.lineDetail(line),/0 mm/,'Zero eclosion length must remain visible');
assert.match(t.recordRow(['','','',0]),/value="0"/,'Numeric zero must remain editable');

async function run(){
 // Species isolation, independent pupal denominator, missing measurements and chronological growth.
 const as=t.analysisState;
 s.lines=[{id:'nep',name:text,species:'Dorcus nepalensis'},{id:'nep2',name:'Other line',species:' Dorcus.NEPALENSIS '},{id:'don',name:'DON',species:'Dorcus donckieri'}];
 s.larvae=[
  {id:'n1',line_id:'nep',number:'N1',sex:'M',size:70,pupal_weight:10,records:[['2026-02-01','Feed B','800',25],['2026-01-01',text,'500',20]]},
  {id:'n2',line_id:'nep2',number:'=formula',sex:'M',size:60,pupal_weight:12,records:[['2026-01-01','',0,0]]},
  {id:'n3',line_id:'nep',number:'Missing pupa',sex:'M',size:80,records:[['2026-01-01','','',30]]},
  {id:'nf',line_id:'nep',number:'Female',sex:'F',size:40,pupal_weight:5,records:[]},
  {id:'d1',line_id:'don',number:'DON',sex:'M',size:100,pupal_weight:20,records:[]}
 ];
 as.source='larvae';as.sex='M';as.line='all';as.metric='ratio';
 let selection=t.analysisSelection();assert.equal(selection.rows.length,3);
 assert.equal(selection.rows[0].id,'n1');assert.equal(selection.rows[0].ratio,7,'Ratio must divide 70mm by 10g pupal weight, never 25g peak larval weight');
 assert.equal(selection.rows[0].peak,25);assert.equal(selection.rows[1].ratio,5);assert.equal(selection.rows[2].ratio,null,'No fallback to peak larval weight');
 assert.equal(t.pupalWeight({source_data:{pupation:{pupaWeight:'11.25'}}}),11.25);assert.equal(t.pupalWeight({pupal_weight:10,source_data:{pupation:{pupaWeight:20}}}),10);assert.equal(t.pupalWeight({source_data:{pupation:{pupaWeight:''}}}),null);
 assert.equal(t.positive(0),null);assert.equal(t.positive(''),null);assert.equal(t.positive(Infinity),null);assert.equal(t.average([null,7,5]),6);
 const html=t.analysisPage();assert.ok(!html.includes(text));assert.ok(html.includes('&lt;img'));assert.match(html,/용화 무게\(g\)/);assert.ok(!html.includes('NaN'));
 const csv=t.analysisCsv();assert.match(csv,/'=formula/,'Spreadsheet formulas must be neutralized');assert.ok(!csv.includes('"DON"'));
 const growth=t.analysisGrowth(selection.rows);assert.ok(growth.indexOf('<td>2026-01-01</td>')<growth.indexOf('<td>2026-02-01</td>'),'Growth rows must be chronological');
 as.line='nep2';assert.equal(t.analysisSelection().rows.length,1);assert.equal(selection.rows[0].pupation,40);
 const otherName='EXCLUDED_UNDER_ALL_TABS';
 s.lines.push({id:'variant',species:'Dorcus nepalensis hybrid',name:otherName});
 s.larvae.push({id:'hybrid',line_id:'variant',number:otherName,sex:'M'},{id:'orphan',line_id:'?',number:otherName,sex:'M'},
  {id:'mixed',line_id:'nep',number:otherName,source_data:{species:'Dorcus donckieri'},sex:'M'});
 s.adults=[
  {id:'m',code:'M',sex:'M',species:'Dorcus.Nepalensis',status:'보유'},
  {id:'f',code:'F',sex:'F',species:'D. nepalensis',status:'보유',source_data:{bornLineId:'BL2'}},
  {id:'sibling',code:'F2',sex:'F',species:'네팔렌시스',status:'보유',father_id:'m'},
  {id:'x',code:otherName,sex:'M',species:'Other',status:'보유'}
 ];
 s.lines[1].beetlelog_id='BL2';
 Object.assign(s.lines[0],{father_id:'m',mother_id:'f',nep_sets:[{mother:'f',start:'2026-01-01',end:'2026-01-31',count:0}]});
 Object.assign(s.larvae[0],{nep_hatched:'2026-01-01',nep_pupated:'2026-05-01',nep_outcome:'normal',records:[
  ['2026-01-31','Feed A','1400 cc',23],['2026-01-01','Feed A','800ml',20],['2026-03-02','Feed B','800cc',24],['2026-04-01','Feed B','800cc',26]
 ]});
 s.larvae[1].pupal_weight=11;s.larvae[1].records=[['2026-01-01','Feed A','800',20]];
 const d=t.nepDataset(),rr=t.larvalRows(d),r1=rr.find(r=>r.id==='n1');
 assert.equal(d.adults.length,3);assert.equal(rr.length,4);assert.equal(r1.pupation,1000/26);
 const gp=t.growthProfile(r1);assert.equal(gp.early,3);assert.equal(gp.late,2);assert.equal(gp.day90,26);assert.equal(gp.peakAge,90);assert.equal(gp.duration,120);
 const malformed={...r1,records:[['2026-01-01','A','800',5],['2026-02-01','B','1400',null],['2026-03-01','B','1400',10]].map(([date,feed,volume,weight])=>({date,feed,volume,weight}))};
 assert.equal(t.growthProfile(malformed).intervals.length,0,'Do not bridge a missed weighing');
 const g=t.feedGroups(rr);assert.equal(g.length,3);assert.equal(g.find(x=>x.feed==='Feed A'&&x.volume===800).rate,3);assert.equal(g.find(x=>x.volume===1400).rate,1);
 const stats=t.lineScores(d,rr),n=stats.find(x=>x.line.id==='nep');
 assert.equal(n.n[0],2);assert.equal(n.hits,2);assert.equal(n.values[1],10);assert.equal(n.n[3],1);assert.equal(n.max,95);assert.equal(n.points.length,5);assert.equal(n.earned,95);
 assert.equal(t.recordedEggSets(d).length,0,'Historical larval recoveries are not egg counts');
 const pairs=t.crossCandidates(d,rr);assert.equal(pairs.length,1);assert.equal(pairs[0].level,2);assert.equal(pairs[0].n,2);assert.equal(pairs[0].complete,false);
 // Actual eggs count towards the line; unbred sisters have no personal result.
 const originals={lines:s.lines,adults:s.adults,larvae:s.larvae};
 const heritage=id=>({id,name:id,species:'Dorcus.Nepalensis',beetlelog_id:id,nep_sets:[]});
 const specimen=(id,sex,origin)=>({id,code:id,sex,species:'Dorcus.Nepalensis',status:'보유',source_data:{bornLineId:origin}});
 const closed=(mother,eggs)=>({mother,eggs,start:'2026-01-01',end:'2026-02-01'});
 const high=heritage('A'),low=heritage('B'),breeding=heritage('breeding');
 const highMom=specimen('recorded','F','A'),sister=specimen('unbred','F','A'),lowMom=specimen('low','F','B'),unknown=specimen('unknown','F',''),male=specimen('male','M','');
 const foreign={...heritage('foreign'),species:'Other',nep_sets:[closed('low',999)]};
 s.lines=[high,low,breeding,foreign];s.adults=[male,lowMom,unknown,highMom,sister,{...specimen('other','F','A'),species:'Other'}];s.larvae=[];
 breeding.nep_sets=[closed('recorded',20),closed('recorded',0),closed('low',4),{...closed('low',200),end:''},closed('male',200),closed('other',200)];
 const eggData=t.nepDataset(),eggRows=t.recordedEggSets(eggData);assert.equal(eggRows.length,3);
 assert.match(t.adultDetail(highMom),/총 20알 · 2세트/);assert.match(t.adultDetail(sister),/확인한 알 수 기록이 없습니다/);
 assert.doesNotMatch(t.adultDetail(male),/암컷 산란 수/);
 const sample=(lineId,outcome,reason)=>({lineId,sex:'M',size:74,pupal:10,peak:25,outcome,observation:{reason}});
 const cases=[sample('A','normal','feed'),sample('A','normal','individual'),sample('A',null,'individual'),sample('A','died','individual'),
  sample('A','normal','unknown'),sample('A',null,'feed'),sample('A',null,'unknown'),sample('B','normal','none')];
 const current=t.lineScores(eggData,cases),aa=current.find(x=>x.line.id==='A'),bb=current.find(x=>x.line.id==='B');
 assert.equal(aa.n[3],5);assert.equal(aa.qualified,2);assert.equal(aa.rawOutcomes,4);assert.equal(aa.rawNormal,3);assert.equal(aa.points[3],6);
 assert.equal(aa.values[4],10);assert.equal(aa.points[4],5);assert.equal(bb.points[4],2);assert.equal(aa.max,100);
 breeding.nep_sets=[closed('recorded',0),closed('low',0)];
 assert.equal(t.lineScores(t.nepDataset(),cases)[0].points[4],0);
 breeding.nep_sets=[closed('recorded',0)];assert.equal(t.lineScores(t.nepDataset(),cases)[0].points[4],null);
 as.tab='score';assert.match(t.analysisPage(),/암컷 산란 수 · 5/);as.tab='pairs';assert.doesNotMatch(t.analysisPage(),/가산점/);
 assert.equal(t.growthObservation({flags:['성장불량']}).reason,'unknown');
 const bottle=t.growthObservation({bottleRecords:[{flags:['원더링','성장불량']}]});assert.equal(bottle.everWandered,true);assert.equal(bottle.reason,'unknown');
 assert.equal(t.growthObservation({flags:[],growthIssueCause:'individual'}).reason,'none');
 assert.equal(t.observedOutcome({source_data:{eclosion:{defect:false,date:'2026-01-01'}}}),'normal');
 assert.equal(t.observedOutcome({source_data:{eclosion:{}}}),null);assert.equal(t.observedOutcome({source_data:{eclosion:{defect:false}}}),null);
 assert.equal(t.observedOutcome({nep_outcome:'normal',source_data:{eclosion:{defect:true}}}),'normal');
 Object.assign(s,originals);
 for(const tab of ['overview','growth','feed','score','pairs']){
  as.tab=tab;const view=t.analysisPage();assert.ok(!view.includes(otherName));assert.ok(!view.includes('NaN'));assert.ok(!view.includes('<img src=x'));
 }
 assert.equal(t.analysisCsv().includes(otherName),false);
 // Save supplementary data through the normal form path, including an actual zero and a stale-write retry.
 server.lines=s.lines.map(l=>({...l,updated_at:'obs-v1'}));server.adults=s.adults;server.larvae=s.larvae.map(v=>({...v,updated_at:'obs-v1'}));
 s.lines=server.lines;s.larvae=server.larvae;t.showModal('nep-individual','n1');calls.length=0;
 let observation={id:'nep-individual',values:{hatch:'2026-01-01',pupated:'2026-05-01',outcome:'normal',adult:''}};
 stale=true;await t.submitForm(observation);assert.equal(s.modal.kind,'nep-individual');assert.equal(element('#edit-error').hidden,false);stale=false;
 await t.submitForm(observation);assert.equal(s.modal,null);assert.equal(calls.find(c=>c.operation==='update').payload.nep_outcome,'normal');
 t.showModal('nep-individual','n1');calls.length=0;
 await t.submitForm({...observation,values:{...observation.values,wandering:'yes',growth:'feed'}});
 let shared=calls.find(c=>c.rpc==='hemiso_save_growth_observation');assert.equal(shared.args.p_growth,'feed');assert.equal(shared.args.p_wandering,true);assert.equal(shared.args.p_outcome,'normal');
 t.showModal('nep-sets','nep');calls.length=0;
 await t.submitForm({id:'nep-sets',values:{},querySelectorAll(){return [{querySelector(selector){const name=selector.split('"')[1];return {value:{start:'2026-01-01',end:'2026-01-31',mother:'f',count:'0',eggs:'13'}[name]};}}];}});
 assert.equal(calls.find(c=>c.operation==='update').payload.nep_sets[0].count,0);assert.equal(calls.find(c=>c.operation==='update').payload.nep_sets[0].eggs,13);assert.equal(s.modal,null);
 as.tab='overview';

 s.adults=[{id:'standalone',code:'A',species:'Dorcus nepalensis',sex:'M',size:90,pupal_weight:15}];as.source='adults';as.line='all';as.metric='size';
 assert.equal(t.analysisSelection().rows.length,1,'Adult and larval datasets must stay separate');assert.equal(t.analysisSelection().rows[0].ratio,6);assert.doesNotThrow(()=>t.analysisPage());
 s.lines=[];s.larvae=[];as.source='larvae';assert.doesNotThrow(()=>t.analysisPage());
 s.adults=[a];s.lines=[line];s.larvae=[];

 // Even stale in-memory collection data must be hidden before authorization.
 s.allowed=false;s.ready=true;t.render();
 assert.ok(!element('#app').innerHTML.includes('&lt;img'),'Unauthorized gate exposed record data');
 signedUser={id:'fixture-owner',email:'owner@example.invalid'};authorize=false;calls.length=0;
 await t.boot();
 assert.equal(s.allowed,false);
 assert.ok(!calls.some(c=>c.table?.startsWith('hemiso_')),'Rejected account queried collection records');
 assert.match(element('#app').innerHTML,/접근 권한이 없습니다/);
 authorize=true;calls.length=0;await t.boot();assert.equal(s.allowed,true);
 assert.equal(calls.filter(c=>c.table?.startsWith('hemiso_')).length,3,'Authorized account must load exactly the three collection tables');

 // Source filters and selection operate only on visible species and skip linked adults.
 s.allowed=true;s.source={parents:[{id:'source-nep',code:text,species:'Dorcus nepalensis'},{id:'source-don',code:'DON',species:'Dorcus donckieri'}],lines:[{id:'source-line',code:'NEP line',species:'Dorcus nepalensis'}]};
 s.sourceSpecies='Dorcus nepalensis';s.sourceSearch='';s.adults=[{...a,beetlelog_id:'source-nep'}];s.lines=[{...line,beetlelog_id:'source-line'}];
 assert.equal(t.sourceFiltered('parents').length,1);
 assert.ok(!t.sourceRows().includes(text),'Import HTML did not escape source record');
 await t.action('source-all',{});
 assert.equal(s.selectedAdults.size,0,'Already linked adults must not be selected again');
 assert.equal(s.selectedLines.has('source-line'),true,'Existing source lines must remain reselectable to import new larvae');
 s.sourceSpecies='Dorcus donckieri';await t.action('source-all',{});
 assert.equal(s.selectedAdults.has('source-don'),true);
 assert.equal(s.selectedAdults.has('source-nep'),false);
 calls.length=0;await t.action('import-save',makeElement());
 const imported=calls.find(c=>c.rpc==='hemiso_import_beetlelog');assert.ok(imported);
 assert.equal(JSON.stringify(imported.args.p_adult_ids),'["source-don"]');
 assert.equal(JSON.stringify(imported.args.p_line_ids),'["source-line"]');

 // CRUD field mappings preserve zero, blank optional values and source identities.
 server.adults=[a];server.lines=[line];server.larvae=[];s.adults=[a];s.lines=[line];s.modal={kind:'adult-form',id:a.id};calls.length=0;
 const adultForm={id:'adult-form',values:{code:'NEP-0',species:'Dorcus nepalensis',lineage:'Test',generation:'F2',sex:'M',size:'0',pupal_weight:'9.876',emerged:'',status:'보유',source:'입양',breeder:'Test',father_id:'',mother_id:'',note:'memo'}};
 await t.submitForm(adultForm);
 let mutation=calls.find(c=>c.rpc==='hemiso_save_record');assert.ok(mutation,'Atomic adult edit RPC did not run');mutation.payload=mutation.args.p_patch;mutation.table='hemiso_'+mutation.args.p_kind;
 assert.equal(mutation.table,'hemiso_adults');assert.equal(mutation.payload.size,0);assert.equal(mutation.payload.pupal_weight,9.876);assert.equal(mutation.payload.emerged,null);assert.equal(mutation.payload.father_id,null);assert.equal(mutation.payload.mother_id,null);
 assert.equal(mutation.args.p_id,a.id);assert.equal(mutation.args.p_expected_updated_at,'version-one');assert.ok(!calls.some(c=>c.operation==='update'),'Ordinary edits must use the atomic save RPC');
 assert.ok(!Object.hasOwn(mutation.payload,'photo_url'),'Unedited photos must be preserved');
 assert.ok(!Object.hasOwn(mutation.payload,'beetlelog_snapshot'),'Ordinary edits must preserve sync baselines');
 assert.equal(s.busy,false);

 calls.length=0;s.modal={kind:'line-form'};
 await t.submitForm({id:'line-form',values:{name:'NEP-L',species:'Dorcus nepalensis',generation:'F3',father_id:a.id,mother_id:'',year:'2026',is_wild:'on',method:'wood',note:''}});
 mutation=calls.find(c=>c.operation==='insert');assert.equal(mutation.table,'hemiso_lines');assert.equal(mutation.payload.is_wild,true);assert.equal(mutation.payload.year,2026);assert.equal(mutation.payload.mother_id,null);
 calls.length=0;s.modal={kind:'larva-form',lineId:line.id};
 const row=values=>({querySelectorAll(){return values.map(value=>({value}));}});
 await t.submitForm({id:'larva-form',values:{number:'L0',sex:'U',size:'0',pupal_weight:'12.345',emerged:''},querySelectorAll(){return [row(['2026-10-01','Test','800','0']),row(['','','',''])];}});
 mutation=calls.find(c=>c.operation==='insert');assert.equal(mutation.table,'hemiso_larvae');assert.equal(mutation.payload.line_id,line.id);assert.equal(mutation.payload.pupal_weight,12.345);assert.equal(mutation.payload.size,0);assert.equal(JSON.stringify(mutation.payload.records),'[["2026-10-01","Test","800","0"]]');

 // Server rejection of a stale compare-and-swap must not load or overwrite data.
 calls.length=0;stale=true;
 await assert.rejects(t.persist('adults',{note:'stale'},a),e=>/먼저 수정/.test(e.message));
 assert.equal(calls.length,1,'Stale edit must not proceed to collection reload');stale=false;
 calls.length=0;s.modal={kind:'confirm-delete',table:'larvae',id:'fixture-created',version:'fixture-new-version'};
 await t.action('delete-confirm',makeElement());
 const deletion=calls.find(c=>c.operation==='delete');assert.equal(deletion.table,'hemiso_larvae');
 assert.deepEqual(deletion.filters,[['id','fixture-created'],['updated_at','fixture-new-version']]);


 // Background pull runs only when allowed, linked, visible and not editing/busy.
 s.adults=[{...a,beetlelog_id:'source-nep'}];s.lines=[];s.larvae=[];s.modal=null;s.busy=false;s.allowed=true;
 calls.length=0;await t.pullLinked();assert.equal(calls[0].rpc,'hemiso_sync_beetlelog');assert.equal(calls[0].args.p_direction,'pull');
 s.modal={kind:'adult-form'};calls.length=0;await t.pullLinked();assert.equal(calls.length,0,'Background pull must pause during editing');
 s.modal=null;s.busy=true;await t.pullLinked();assert.equal(calls.length,0);s.busy=false;s.allowed=false;await t.pullLinked();assert.equal(calls.length,0);
 s.allowed=true;s.adults=[a];await t.pullLinked();assert.equal(calls.length,0,'No linked data needs no pull');
 s.adults=[{...a,beetlelog_id:'source-nep'}];rpcFailure='offline';await t.pullLinked();assert.equal(s.syncError,'offline');assert.equal(s.pulling,false);rpcFailure=null;await t.pullLinked();assert.equal(s.syncError,'');
 // An editor retains its initial expected version if background data changes later.
 server.adults=[{...a,beetlelog_id:'source-nep'}];s.adults=server.adults.slice();t.showModal('adult-form',a.id);
 const original=s.modal.original;s.adults=[{...original,updated_at:'newer-background-version'}];calls.length=0;
 await t.submitForm(adultForm);mutation=calls.find(c=>c.rpc==='hemiso_save_record');assert.equal(mutation.args.p_expected_updated_at,'version-one');assert.equal(s.lastSaveSynced,true);
 // A rejected save keeps both the draft modal and a persistent visible error.
 t.showModal('adult-form',a.id);const draft=s.modal;rpcFailure='remote conflict';calls.length=0;await t.submitForm(adultForm);
 assert.equal(s.modal,draft,'A conflict must not close or replace the edit form');assert.equal(element('#edit-error').hidden,false);assert.match(element('#edit-error').textContent,/remote conflict/);assert.equal(s.busy,false);rpcFailure=null;
 // Login must construct a proper callback URL rather than shadowing the URL constructor.
 await t.action('login',{});
 assert.equal(oauthOptions.provider,'google');assert.equal(oauthOptions.options.redirectTo,'https://example.invalid/Hemiso_DB/');
 await t.action('logout',{});assert.equal(s.allowed,false);assert.equal(s.adults.length,0);assert.equal(s.lines.length,0);assert.equal(s.larvae.length,0);
 console.log('PASS: scoped Nepalensis panels and CSV, growth and feed attribution, line scoring, cross evidence, observation and zero-set saves, atomic save RPC, automatic pull guards, frozen edit version, conflict draft preservation, pupal-weight ratio, species isolation, missing values, growth order, CSV safety, dataset separation, escaping, safe photos, auth gate, source species and repeat-line selection, CRUD mappings, zero values, optimistic concurrency, OAuth callback and logout cleanup.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
