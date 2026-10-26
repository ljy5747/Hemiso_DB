-- Hemiso_DB: isolated collection tables. No existing BeetleLog/KML data is rewritten.
begin;
create schema if not exists hemiso_internal;
revoke all on schema hemiso_internal from public,anon;
grant usage on schema hemiso_internal to authenticated;
create table public.hemiso_allowed_accounts (
 user_id uuid primary key references auth.users(id),
 email text not null unique check(email=lower(email)),active boolean not null default true
);
alter table public.hemiso_allowed_accounts enable row level security;
revoke all on public.hemiso_allowed_accounts from public,anon,authenticated;
grant select on public.hemiso_allowed_accounts to authenticated;
create policy hemiso_account_self on public.hemiso_allowed_accounts for select to authenticated
 using(user_id=(select auth.uid()));
insert into public.hemiso_allowed_accounts(user_id,email)
 select id,lower(email) from auth.users where lower(email)='ljy5747@gmail.com' and email_confirmed_at is not null;
create function public.hemiso_authorized() returns boolean language sql stable security invoker set search_path='' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.hemiso_allowed_accounts a
 where a.user_id=(select auth.uid()) and a.email=lower((select auth.jwt()->>'email')) and a.active
 and ((select auth.jwt()->'app_metadata'->>'provider')='google' or (select auth.jwt()->'app_metadata'->'providers') ? 'google'));
$$;
revoke all on function public.hemiso_authorized() from public,anon;
grant execute on function public.hemiso_authorized() to authenticated;
create table public.hemiso_adults (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),
 code text not null check(length(btrim(code)) between 1 and 80),species text not null default 'Dorcus nepalensis' check(length(species)<=200),
 lineage text not null default '' check(length(lineage)<=120),generation text not null default '' check(length(generation)<=30),
 sex text not null check(sex in ('M','F','U')),size numeric(6,2) check(size between 0 and 200),emerged date,
 source text not null default '입양',status text not null default '보유',breeder text not null default '' check(length(breeder)<=120),
 note text not null default '' check(length(note)<=3000),photo_url text not null default '' check(length(photo_url)<=2000000),
 father_id uuid references public.hemiso_adults(id),mother_id uuid references public.hemiso_adults(id),
 beetlelog_id text check(length(beetlelog_id) between 1 and 160),source_data jsonb not null default '{}'::jsonb,
 beetlelog_snapshot jsonb,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(owner_id,code),unique(owner_id,beetlelog_id),
 check(id is distinct from father_id and id is distinct from mother_id),
 check(father_id is null or mother_id is null or father_id<>mother_id)
);
create table public.hemiso_lines (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check(length(btrim(name)) between 1 and 80),species text not null default 'Dorcus nepalensis' check(length(species)<=200),
 generation text not null default '' check(length(generation)<=30),is_wild boolean not null default false,
 father_id uuid references public.hemiso_adults(id),mother_id uuid references public.hemiso_adults(id),
 year int check(year between 1980 and 2200),method text not null default '' check(length(method)<=200),note text not null default '' check(length(note)<=3000),
 beetlelog_id text check(length(beetlelog_id) between 1 and 160),source_data jsonb not null default '{}'::jsonb,beetlelog_snapshot jsonb,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(owner_id,name),unique(owner_id,beetlelog_id),check(father_id is null or mother_id is null or father_id<>mother_id)
);
create table public.hemiso_larvae (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id),
 line_id uuid not null references public.hemiso_lines(id),number text not null check(length(btrim(number)) between 1 and 80),
 sex text not null default 'U' check(sex in ('M','F','U')),records jsonb not null default '[]'::jsonb check(jsonb_typeof(records)='array'),
 emerged date,size numeric(6,2) check(size between 0 and 200),source_data jsonb not null default '{}'::jsonb,
 beetlelog_id text check(length(beetlelog_id) between 1 and 160),beetlelog_snapshot jsonb,
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 unique(line_id,number),unique(owner_id,beetlelog_id)
);
create index on public.hemiso_adults(father_id);create index on public.hemiso_adults(mother_id);
create index on public.hemiso_lines(father_id);create index on public.hemiso_lines(mother_id);create index on public.hemiso_larvae(line_id);
create function hemiso_internal.touch_and_validate() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.owner_id is distinct from old.owner_id or new.id<>old.id then raise exception 'Record identity cannot change';end if;
  new.updated_at:=clock_timestamp();
 end if;
 if tg_table_name='hemiso_adults' then
  if new.sex<>'M' and (exists(select 1 from public.hemiso_adults where father_id=new.id) or exists(select 1 from public.hemiso_lines where father_id=new.id)) then raise exception '부 개체로 연결된 성충은 수컷이어야 합니다';end if;
  if new.sex<>'F' and (exists(select 1 from public.hemiso_adults where mother_id=new.id) or exists(select 1 from public.hemiso_lines where mother_id=new.id)) then raise exception '모 개체로 연결된 성충은 암컷이어야 합니다';end if;
  if exists(with recursive ancestors(id,father_id,mother_id,path) as (
   select a.id,a.father_id,a.mother_id,array[a.id] from public.hemiso_adults a where a.id in (new.father_id,new.mother_id)
   union all select a.id,a.father_id,a.mother_id,t.path||a.id from public.hemiso_adults a join ancestors t on a.id in(t.father_id,t.mother_id) where not a.id=any(t.path)
  ) select 1 from ancestors where id=new.id) then raise exception '부모 계통에 순환 연결을 만들 수 없습니다';end if;
 end if;
 if tg_table_name in ('hemiso_adults','hemiso_lines') then
  if new.father_id is not null and not exists(select 1 from public.hemiso_adults where id=new.father_id and owner_id=new.owner_id and sex='M') then raise exception '수컷 부모 개체를 확인하세요';end if;
  if new.mother_id is not null and not exists(select 1 from public.hemiso_adults where id=new.mother_id and owner_id=new.owner_id and sex='F') then raise exception '암컷 부모 개체를 확인하세요';end if;
 elsif not exists(select 1 from public.hemiso_lines where id=new.line_id and owner_id=new.owner_id) then raise exception '라인을 확인하세요';end if;
 return new;
end;$$;
create trigger hemiso_adult_validate before insert or update on public.hemiso_adults for each row execute function hemiso_internal.touch_and_validate();
create trigger hemiso_line_validate before insert or update on public.hemiso_lines for each row execute function hemiso_internal.touch_and_validate();
create trigger hemiso_larva_validate before insert or update on public.hemiso_larvae for each row execute function hemiso_internal.touch_and_validate();
do $$declare t text;begin
 foreach t in array array['hemiso_adults','hemiso_lines','hemiso_larvae'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy %I on public.%I for all to authenticated using ((select public.hemiso_authorized()) and owner_id=(select auth.uid())) with check ((select public.hemiso_authorized()) and owner_id=(select auth.uid()))',t||'_owner',t);
 end loop;
end;$$;
create function hemiso_internal.as_date(v text) returns date language plpgsql immutable set search_path='' as $$begin
 if coalesce(v,'')!~'^\d{4}-\d{2}-\d{2}$' then return null;end if;return v::date;exception when others then return null;end;$$;
create function hemiso_internal.as_size(v text) returns numeric language plpgsql immutable set search_path='' as $$begin
 if coalesce(v,'')!~'^[0-9]+([.][0-9]+)?$' or length(v)>12 then return null;end if;
 if v::numeric between 0 and 200 then return v::numeric;end if;return null;end;$$;
create function hemiso_internal.as_sex(v text) returns text language sql immutable set search_path='' as $$select case when v='M' or v like '%수컷%' or v like '%♂%' then 'M' when v='F' or v like '%암컷%' or v like '%♀%' then 'F' else 'U' end;$$;
create function hemiso_internal.adult_values(v jsonb) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('code',left(btrim(coalesce(v->>'code','')),80),'species',left(coalesce(v->>'species',''),200),
 'lineage',left(coalesce(v->>'line',''),120),'generation',left(coalesce(v->>'gen',''),30),'sex',hemiso_internal.as_sex(v->>'sex'),
 'size',hemiso_internal.as_size(v->>'totalLength'),'emerged',hemiso_internal.as_date(v->>'eclosionDate'),
 'source',case when v->>'source'='채집' then '채집' when nullif(v->>'bornLineId','') is not null then '우화' else coalesce(nullif(v->>'source',''),'입양') end,
 'status',coalesce(nullif(v->>'status',''),'보유'),'breeder',left(coalesce(v->>'breeder',''),120),'note',left(coalesce(v->>'memo',''),3000),
 'photo_url',case when length(coalesce(v->>'photo',''))<=2000000 and (v->>'photo' ~ '^https://' or v->>'photo' ~ '^data:image/(jpeg|png|webp);base64,') then v->>'photo' else '' end,
 'father_id',(select id from public.hemiso_adults where owner_id=(select auth.uid()) and beetlelog_id=v->>'sireId' and sex='M'),
 'mother_id',(select id from public.hemiso_adults where owner_id=(select auth.uid()) and beetlelog_id=v->>'damId' and sex='F'));
$$;
create function hemiso_internal.line_values(v jsonb) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('name',left(btrim(coalesce(v->>'code','')),80),'species',left(coalesce(v->>'species',''),200),
 'generation',left(coalesce(v->>'gen',''),30),'is_wild',coalesce(v->>'isWild','false')='true',
 'father_id',(select id from public.hemiso_adults where owner_id=(select auth.uid()) and beetlelog_id=v->>'fatherId' and sex='M'),
 'mother_id',(select id from public.hemiso_adults where owner_id=(select auth.uid()) and beetlelog_id=v->>'motherId' and sex='F'),
 'year',case when coalesce(v->>'year','')~'^(19|20|21)[0-9]{2}$' and (v->>'year')::int>=1980 then (v->>'year')::int else null end,
 'method',left(coalesce(v->>'method',''),200),'note',left(coalesce(v->>'memo',''),3000));
$$;
create function hemiso_internal.larva_values(v jsonb) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('line_id',(select id from public.hemiso_lines where owner_id=(select auth.uid()) and beetlelog_id=v->>'lineId'),
 'number',left(btrim(coalesce(v->>'code','')),80),'sex',hemiso_internal.as_sex(v->>'sex'),
 'records',(select coalesce(jsonb_agg(jsonb_build_array(coalesce(r->>'date',''),coalesce(nullif(r->>'feedBrand',''),r->>'feedType',''),coalesce(r->>'bottleSize',''),coalesce(r->>'weight',''))),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(v->'bottleRecords')='array' then v->'bottleRecords' else '[]'::jsonb end) r),
 'emerged',hemiso_internal.as_date(v->'eclosion'->>'date'),'size',hemiso_internal.as_size(coalesce(v->'eclosion'->>'totalLength',v->'eclosion'->>'size')));
$$;
-- Typed patching through whitelisted fields keeps source IDs and ownership intact.
create function hemiso_internal.apply_values(kind text,rid uuid,v jsonb,snapshot jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if kind='adults' then update public.hemiso_adults set
  code=v->>'code',species=v->>'species',lineage=v->>'lineage',generation=v->>'generation',sex=v->>'sex',size=(v->>'size')::numeric,emerged=(v->>'emerged')::date,
  source=v->>'source',status=v->>'status',breeder=v->>'breeder',note=v->>'note',photo_url=v->>'photo_url',father_id=(v->>'father_id')::uuid,mother_id=(v->>'mother_id')::uuid,source_data=snapshot,beetlelog_snapshot=snapshot where id=rid;
 elsif kind='lines' then update public.hemiso_lines set
  name=v->>'name',species=v->>'species',generation=v->>'generation',is_wild=(v->>'is_wild')::boolean,father_id=(v->>'father_id')::uuid,mother_id=(v->>'mother_id')::uuid,
  year=(v->>'year')::int,method=v->>'method',note=v->>'note',source_data=snapshot,beetlelog_snapshot=snapshot where id=rid;
 elsif kind='larvae' then update public.hemiso_larvae set
  line_id=(v->>'line_id')::uuid,number=v->>'number',sex=v->>'sex',records=v->'records',emerged=(v->>'emerged')::date,size=(v->>'size')::numeric,
  source_data=snapshot,beetlelog_snapshot=snapshot where id=rid;
 end if;
end;$$;
create function public.hemiso_import_beetlelog(p_adult_ids text[] default '{}',p_line_ids text[] default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare doc jsonb;raw jsonb;vals jsonb;aid text;lid text;ids text[]:=coalesce(p_adult_ids,'{}');rid uuid;lrid uuid;sourceid text;ca int:=0;cl int:=0;cv int:=0;issues jsonb:='[]';
begin
 if not coalesce(public.hemiso_authorized(),false) then raise exception 'Not authorized' using errcode='42501';end if;
 if cardinality(ids)>500 or cardinality(coalesce(p_line_ids,'{}'))>500 then raise exception '한 번에 500개까지 선택하세요';end if;
 select data into doc from public.beetlelog_data where user_key='user:'||lower(auth.jwt()->>'email');
 if doc is null then raise exception '같은 계정에 저장된 BeetleLog 데이터가 없습니다';end if;
 for raw in select value from jsonb_array_elements(coalesce(doc->'lines','[]')) where value->>'id'=any(coalesce(p_line_ids,'{}')) loop
  ids:=array_append(array_append(ids,raw->>'fatherId'),raw->>'motherId');
 end loop;
 for aid in select distinct unnest(ids) loop
  if aid is null or aid='' then continue;end if;
  select value into raw from jsonb_array_elements(coalesce(doc->'parents','[]')) where value->>'id'=aid;
  if raw is null then issues:=issues||jsonb_build_array('성충 원본 없음: '||aid);continue;end if;
  if exists(select 1 from public.hemiso_adults where owner_id=auth.uid() and beetlelog_id=aid) then continue;end if;
  vals:=hemiso_internal.adult_values(raw)-'father_id'-'mother_id';
  begin
   insert into public.hemiso_adults(code,species,lineage,generation,sex,size,emerged,source,status,breeder,note,photo_url,beetlelog_id,source_data,beetlelog_snapshot)
   values(vals->>'code',vals->>'species',vals->>'lineage',vals->>'generation',vals->>'sex',(vals->>'size')::numeric,(vals->>'emerged')::date,
    vals->>'source',vals->>'status',vals->>'breeder',vals->>'note',vals->>'photo_url',aid,raw,raw);
   ca:=ca+1;
  exception when check_violation or unique_violation then issues:=issues||jsonb_build_array('성충 중복 또는 필드 확인: '||coalesce(raw->>'code',aid));end;
 end loop;
 -- Resolve imported adult pedigree only after all selected parent rows exist.
 for raw in select value from jsonb_array_elements(coalesce(doc->'parents','[]')) where value->>'id'=any(ids) loop
  select id into rid from public.hemiso_adults where owner_id=auth.uid() and beetlelog_id=raw->>'id';
  if rid is not null then
   vals:=hemiso_internal.adult_values(raw);
   update public.hemiso_adults set father_id=coalesce(father_id,(vals->>'father_id')::uuid),mother_id=coalesce(mother_id,(vals->>'mother_id')::uuid) where id=rid;
  end if;
 end loop;
 for raw in select value from jsonb_array_elements(coalesce(doc->'lines','[]')) where value->>'id'=any(coalesce(p_line_ids,'{}')) loop
  lid:=raw->>'id';vals:=hemiso_internal.line_values(raw);
  select id into lrid from public.hemiso_lines where owner_id=auth.uid() and beetlelog_id=lid;
  if lrid is null then
   begin
    insert into public.hemiso_lines(name,species,generation,is_wild,father_id,mother_id,year,method,note,beetlelog_id,source_data,beetlelog_snapshot)
    values(vals->>'name',vals->>'species',vals->>'generation',(vals->>'is_wild')::boolean,(vals->>'father_id')::uuid,(vals->>'mother_id')::uuid,
     (vals->>'year')::int,vals->>'method',vals->>'note',lid,raw,raw) returning id into lrid;
    cl:=cl+1;
   exception when check_violation or unique_violation then issues:=issues||jsonb_build_array('라인 중복 또는 필드 확인: '||coalesce(raw->>'code',lid));end;
  end if;
  if lrid is null then continue;end if;
  for raw in select value from jsonb_array_elements(coalesce(doc->'individuals','[]')) where value->>'lineId'=lid loop
   sourceid:=raw->>'id';
   if exists(select 1 from public.hemiso_larvae where owner_id=auth.uid() and beetlelog_id=sourceid) then continue;end if;
   vals:=hemiso_internal.larva_values(raw);
   begin
    insert into public.hemiso_larvae(line_id,number,sex,records,emerged,size,source_data,beetlelog_id,beetlelog_snapshot)
    values(lrid,vals->>'number',vals->>'sex',vals->'records',(vals->>'emerged')::date,(vals->>'size')::numeric,raw,sourceid,raw);
    cv:=cv+1;
   exception when check_violation or unique_violation then issues:=issues||jsonb_build_array('유충 중복 또는 필드 확인: '||coalesce(raw->>'code',sourceid));end;
  end loop;
 end loop;
 return jsonb_build_object('imported_adults',ca,'imported_lines',cl,'imported_larvae',cv,'issues',issues);
end;$$;
create function public.hemiso_sync_beetlelog(p_direction text default 'pull') returns jsonb language plpgsql security invoker set search_path='' as $$
declare doc jsonb;item jsonb;outitem jsonb;vals jsonb;basevals jsonb;localvals jsonb;rows jsonb;r record;kind text;arrkey text;tbl text;
 ca int:=0;cl int:=0;cv int:=0;conflicts jsonb:='[]';keyname text;rowkey text;parentid text;motherid text;lineref text;bottles jsonb;
begin
 if not coalesce(public.hemiso_authorized(),false) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_direction not in ('pull','push') then raise exception 'Invalid sync direction';end if;
 select data into doc from public.beetlelog_data where user_key='user:'||lower(auth.jwt()->>'email') for update;
 if doc is null then raise exception 'BeetleLog 데이터가 없습니다';end if;
 foreach kind in array array['adults','lines','larvae'] loop
  tbl:='hemiso_'||kind;arrkey:=case kind when 'adults' then 'parents' when 'lines' then 'lines' else 'individuals' end;
  for r in execute format('select id,beetlelog_id,beetlelog_snapshot,to_jsonb(t) as payload from public.%I t where owner_id=auth.uid() and beetlelog_id is not null order by created_at for update',tbl) loop
   select value into item from jsonb_array_elements(coalesce(doc->arrkey,'[]')) where value->>'id'=r.beetlelog_id;
   rowkey:=coalesce(r.payload->>'code',r.payload->>'name',r.payload->>'number',r.beetlelog_id);
   if item is null then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','BeetleLog 원본이 삭제되었거나 없습니다'));continue;end if;
   if r.beetlelog_snapshot is null then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','동기화 기준 정보가 없습니다'));continue;end if;
   if p_direction='pull' then
    if item=r.beetlelog_snapshot then continue;end if;
    basevals:=case kind when 'adults' then hemiso_internal.adult_values(r.beetlelog_snapshot) when 'lines' then hemiso_internal.line_values(r.beetlelog_snapshot) else hemiso_internal.larva_values(r.beetlelog_snapshot) end;
    select jsonb_object_agg(e.key,e.value) into localvals from jsonb_each(r.payload) e where basevals ? e.key;
    if localvals is distinct from basevals or r.payload->'source_data' is distinct from r.beetlelog_snapshot then
     conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','양쪽에서 수정되었습니다. 내용을 비교해 주세요'));continue;
    end if;
    vals:=case kind when 'adults' then hemiso_internal.adult_values(item) when 'lines' then hemiso_internal.line_values(item) else hemiso_internal.larva_values(item) end;
    begin perform hemiso_internal.apply_values(kind,r.id,vals,item);
    exception when check_violation or unique_violation or foreign_key_violation then
     conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','원본의 관리번호·부모·라인을 확인해 주세요'));continue;
    end;
   else
    if item is distinct from r.beetlelog_snapshot then
     conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','BeetleLog에서 먼저 수정되었습니다. 먼저 불러오기를 실행해 주세요'));continue;
    end if;
    outitem:=item||coalesce(r.payload->'source_data','{}');
    if kind in ('adults','lines') then
     select beetlelog_id into parentid from public.hemiso_adults where id=(r.payload->>'father_id')::uuid;
     select beetlelog_id into motherid from public.hemiso_adults where id=(r.payload->>'mother_id')::uuid;
     if (r.payload->>'father_id' is not null and parentid is null) or (r.payload->>'mother_id' is not null and motherid is null) then
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','부모 개체가 BeetleLog에 연결되지 않았습니다'));continue;
     end if;
    end if;
    if kind='adults' then
     outitem:=outitem||jsonb_build_object('id',r.beetlelog_id,'code',r.payload->>'code','species',r.payload->>'species','line',r.payload->>'lineage','gen',r.payload->>'generation',
      'sex',case r.payload->>'sex' when 'M' then '수컷 ♂' when 'F' then '암컷 ♀' else '미구분' end,'totalLength',coalesce(r.payload->>'size',''),'eclosionDate',coalesce(r.payload->>'emerged',''),
      'source',r.payload->>'source','status',r.payload->>'status','breeder',r.payload->>'breeder','memo',r.payload->>'note','photo',r.payload->>'photo_url','sireId',coalesce(parentid,''),'damId',coalesce(motherid,''));
    elsif kind='lines' then
     outitem:=outitem||jsonb_build_object('id',r.beetlelog_id,'code',r.payload->>'name','species',r.payload->>'species','gen',r.payload->>'generation','isWild',r.payload->'is_wild',
      'fatherId',coalesce(parentid,''),'motherId',coalesce(motherid,''),'year',coalesce(r.payload->>'year',''),'method',r.payload->>'method','memo',r.payload->>'note');
    else
     select beetlelog_id into lineref from public.hemiso_lines where id=(r.payload->>'line_id')::uuid;
     if lineref is null then conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','라인이 BeetleLog에 연결되지 않았습니다'));continue;end if;
     select coalesce(jsonb_agg(coalesce(outitem->'bottleRecords'->(b.ord::int-1),'{}')||jsonb_build_object(
      'id',coalesce(nullif(outitem->'bottleRecords'->(b.ord::int-1)->>'id',''),gen_random_uuid()::text),
      'date',coalesce(b.value->>0,''),'feedBrand',coalesce(b.value->>1,''),'bottleSize',coalesce(b.value->>2,''),'weight',coalesce(b.value->>3,'')) order by b.ord),'[]') into bottles
      from jsonb_array_elements(r.payload->'records') with ordinality b(value,ord);
     outitem:=outitem||jsonb_build_object('id',r.beetlelog_id,'lineId',lineref,'code',r.payload->>'number','sex',case r.payload->>'sex' when 'M' then '수컷 ♂' when 'F' then '암컷 ♀' else '미구분' end,
      'bottleRecords',bottles,'eclosion',coalesce(outitem->'eclosion','{}')||jsonb_build_object('date',coalesce(r.payload->>'emerged',''),'totalLength',coalesce(r.payload->>'size','')));
    end if;
    if outitem=item then continue;end if;
    select jsonb_agg(case when a.value->>'id'=r.beetlelog_id then outitem else a.value end order by a.ord) into rows
      from jsonb_array_elements(doc->arrkey) with ordinality a(value,ord);
    doc:=jsonb_set(doc,array[arrkey],rows);
    execute format('update public.%I set source_data=$1,beetlelog_snapshot=$1 where id=$2',tbl) using outitem,r.id;
   end if;
   if kind='adults' then ca:=ca+1;elsif kind='lines' then cl:=cl+1;else cv:=cv+1;end if;
  end loop;
 end loop;
 if p_direction='push' and ca+cl+cv>0 then
  update public.beetlelog_data set data=doc,updated_at=clock_timestamp() where user_key='user:'||lower(auth.jwt()->>'email');
 end if;
 return jsonb_build_object('updated_adults',ca,'updated_lines',cl,'updated_larvae',cv,'conflicts',conflicts);
end;$$;
revoke all on all functions in schema hemiso_internal from public,anon;
grant execute on all functions in schema hemiso_internal to authenticated;
revoke all on function public.hemiso_import_beetlelog(text[],text[]),public.hemiso_sync_beetlelog(text) from public,anon;
grant execute on function public.hemiso_import_beetlelog(text[],text[]),public.hemiso_sync_beetlelog(text) to authenticated;
commit;
