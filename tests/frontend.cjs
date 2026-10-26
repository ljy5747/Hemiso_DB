const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const marker = /\nboot\(\);\n\}\)\(\);\s*$/;
assert.match(source, marker, 'Expected terminal boot call for isolated test harness');
const instrumented = source.replace(marker, '\nglobalThis.test={state,esc,safePhoto,adultTable,adultDetail,adultForm,lineDetail,lineForm,larvaForm,recordRow,sourceRows,sourceFiltered,syncReport,persist,submitForm,action,boot,render};\n})();');
const elements = new Map();
const makeElement = () => ({innerHTML:'', textContent:'', className:'', style:{}, disabled:false, hidden:false, value:'', focus(){}, querySelector(){return null;}, querySelectorAll(){return [];}, click(){}, insertAdjacentHTML(_position,value){this.innerHTML+=value;}});
const element = selector => {if(!elements.has(selector))elements.set(selector,makeElement());return elements.get(selector);};
const calls = [];
const server = {adults:[], lines:[], larvae:[]};
let stale = false, authorize = true, signedUser = null, oauthOptions = null;
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
 async rpc(name,args){calls.push({rpc:name,args});return {data:name==='hemiso_authorized'?authorize:{imported_adults:0,imported_lines:0,imported_larvae:0,issues:[]},error:null};},
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
 setTimeout(){return 1;},clearTimeout(){},console,
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
 const adultForm={id:'adult-form',values:{code:'NEP-0',species:'Dorcus nepalensis',lineage:'Test',generation:'F2',sex:'M',size:'0',emerged:'',status:'보유',source:'입양',breeder:'Test',father_id:'',mother_id:'',note:'memo'}};
 await t.submitForm(adultForm);
 let mutation=calls.find(c=>c.operation==='update');assert.ok(mutation,'Adult update did not run');
 assert.equal(mutation.table,'hemiso_adults');assert.equal(mutation.payload.size,0);assert.equal(mutation.payload.emerged,null);assert.equal(mutation.payload.father_id,null);assert.equal(mutation.payload.mother_id,null);
 assert.deepEqual(mutation.filters,[['id',a.id],['updated_at','version-one']]);
 assert.ok(!Object.hasOwn(mutation.payload,'photo_url'),'Unedited photos must be preserved');
 assert.ok(!Object.hasOwn(mutation.payload,'beetlelog_snapshot'),'Ordinary edits must preserve sync baselines');
 assert.equal(s.busy,false);

 calls.length=0;s.modal={kind:'line-form'};
 await t.submitForm({id:'line-form',values:{name:'NEP-L',species:'Dorcus nepalensis',generation:'F3',father_id:a.id,mother_id:'',year:'2026',is_wild:'on',method:'wood',note:''}});
 mutation=calls.find(c=>c.operation==='insert');assert.equal(mutation.table,'hemiso_lines');assert.equal(mutation.payload.is_wild,true);assert.equal(mutation.payload.year,2026);assert.equal(mutation.payload.mother_id,null);
 calls.length=0;s.modal={kind:'larva-form',lineId:line.id};
 const row=values=>({querySelectorAll(){return values.map(value=>({value}));}});
 await t.submitForm({id:'larva-form',values:{number:'L0',sex:'U',size:'0',emerged:''},querySelectorAll(){return [row(['2026-10-01','Test','800','0']),row(['','','',''])];}});
 mutation=calls.find(c=>c.operation==='insert');assert.equal(mutation.table,'hemiso_larvae');assert.equal(mutation.payload.line_id,line.id);assert.equal(mutation.payload.size,0);assert.equal(JSON.stringify(mutation.payload.records),'[["2026-10-01","Test","800","0"]]');

 // Server rejection of a stale compare-and-swap must not load or overwrite data.
 calls.length=0;stale=true;
 await assert.rejects(t.persist('adults',{note:'stale'},a),/먼저 수정/);
 assert.equal(calls.length,1,'Stale edit must not proceed to collection reload');stale=false;
 calls.length=0;s.modal={kind:'confirm-delete',table:'larvae',id:'fixture-created',version:'fixture-new-version'};
 await t.action('delete-confirm',makeElement());
 const deletion=calls.find(c=>c.operation==='delete');assert.equal(deletion.table,'hemiso_larvae');
 assert.deepEqual(deletion.filters,[['id','fixture-created'],['updated_at','fixture-new-version']]);

 // Login must construct a proper callback URL rather than shadowing the URL constructor.
 await t.action('login',{});
 assert.equal(oauthOptions.provider,'google');assert.equal(oauthOptions.options.redirectTo,'https://example.invalid/Hemiso_DB/');
 await t.action('logout',{});assert.equal(s.allowed,false);assert.equal(s.adults.length,0);assert.equal(s.lines.length,0);assert.equal(s.larvae.length,0);
 console.log('PASS: escaping, safe photos, auth gate, source species and repeat-line selection, CRUD mappings, zero values, optimistic concurrency, OAuth callback and logout cleanup.');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
