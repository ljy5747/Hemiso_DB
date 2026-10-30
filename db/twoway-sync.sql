-- Shared record synchronization is scoped by ID for atomic editing, or unscoped for refresh.
create or replace function hemiso_internal.as_weight(v text) returns numeric
language plpgsql immutable set search_path='' as $$begin
 if coalesce(v,'')!~'^[0-9]+([.][0-9]+)?$' or length(v)>12 then return null;end if;
 if v::numeric>0 and v::numeric<10000 then return v::numeric;end if;return null;
end;$$;
create or replace function hemiso_internal.sync_records(p_direction text, p_kind text default null, p_record_id uuid default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare doc jsonb;item jsonb;outitem jsonb;vals jsonb;basevals jsonb;localvals jsonb;rows jsonb;r record;kind text;arrkey text;tbl text;
 ca int:=0;cl int:=0;cv int:=0;conflicts jsonb:='[]';keyname text;rowkey text;parentid text;motherid text;lineref text;bottles jsonb;
begin
 if not coalesce(public.hemiso_authorized(),false) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_direction not in ('pull','push') then raise exception 'Invalid sync direction';end if;
 select data into doc from public.beetlelog_data where user_key='user:'||lower(auth.jwt()->>'email') for update;
 if doc is null then raise exception 'BeetleLog 데이터가 없습니다';end if;
 if p_kind is not null and p_kind not in ('adults','lines','larvae') then raise exception 'Invalid record kind';end if;
 foreach kind in array array['adults','lines','larvae'] loop
  if p_kind is not null and kind<>p_kind then continue;end if;
  tbl:='hemiso_'||kind;arrkey:=case kind when 'adults' then 'parents' when 'lines' then 'lines' else 'individuals' end;
  for r in execute format('select id,beetlelog_id,beetlelog_snapshot,to_jsonb(t) as payload from public.%I t where owner_id=auth.uid() and beetlelog_id is not null and ($1 is null or id=$1) order by created_at for update',tbl) using p_record_id loop
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
    begin
     if kind in ('adults','larvae') and r.payload->>'pupal_weight' is not null
       and (r.payload->>'pupal_weight')::numeric is distinct from hemiso_internal.as_weight(r.beetlelog_snapshot->'pupation'->>'pupaWeight') then
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','용화 무게가 양쪽에서 수정되었습니다. 내용을 비교해 주세요'));
      continue;
     end if;
     perform hemiso_internal.apply_values(kind,r.id,vals,item);
     if kind in ('adults','larvae') then
      execute format('update public.%I set pupal_weight=$1 where id=$2',tbl) using hemiso_internal.as_weight(item->'pupation'->>'pupaWeight'),r.id;
     end if;
    exception when check_violation or unique_violation or foreign_key_violation then
     conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','원본의 관리번호·부모·라인을 확인해 주세요'));continue;
    end;
   else
    if item is distinct from r.beetlelog_snapshot then
     conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',kind,'id',r.id,'name',rowkey,'reason','BeetleLog에서 먼저 수정되었습니다. 먼저 불러오기를 실행해 주세요'));continue;
    end if;
    outitem:=item||coalesce(r.payload->'source_data','{}');
    if kind in ('adults','larvae') and r.payload->>'pupal_weight' is not null then
     outitem:=jsonb_set(outitem,'{pupation}',(case when jsonb_typeof(outitem->'pupation')='object' then outitem->'pupation' else '{}'::jsonb end)||jsonb_build_object('pupaWeight',r.payload->>'pupal_weight'));
    end if;
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

create or replace function public.hemiso_sync_beetlelog(p_direction text default 'pull')
returns jsonb language sql security invoker set search_path='' as $$
 select hemiso_internal.sync_records(p_direction);
$$;

-- An edit and its linked BeetleLog update commit together, or both roll back.
create or replace function public.hemiso_save_record(
 p_kind text,p_id uuid,p_expected_updated_at timestamptz,p_patch jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare tbl text;allowed text[];cols text;oldrow jsonb;saved jsonb;doc jsonb;item jsonb;arrkey text;report jsonb;pupation jsonb;
begin
 if not coalesce(public.hemiso_authorized(),false) then raise exception 'Not authorized' using errcode='42501';end if;
 if p_kind='adults' then allowed:=array['code','species','lineage','generation','sex','size','pupal_weight','emerged','source','status','breeder','note','photo_url','father_id','mother_id'];
 elsif p_kind='lines' then allowed:=array['name','species','generation','is_wild','father_id','mother_id','year','method','note'];
 elsif p_kind='larvae' then allowed:=array['line_id','number','sex','records','emerged','size','pupal_weight'];
 else raise exception 'Invalid record kind';end if;
 if p_id is null or p_expected_updated_at is null or jsonb_typeof(p_patch) is distinct from 'object' or p_patch='{}' then raise exception 'Invalid edit request';end if;
 if exists(select 1 from jsonb_object_keys(p_patch) k where not k=any(allowed)) then raise exception 'Field is not editable' using errcode='42501';end if;
 tbl:='hemiso_'||p_kind;
 -- Match the sync engine lock order: owner document, then local records.
 select data into doc from public.beetlelog_data where user_key='user:'||lower(auth.jwt()->>'email') for update;
 execute format('select to_jsonb(t.*) from public.%I t where id=$1 and owner_id=auth.uid() for update',tbl) into oldrow using p_id;
 if oldrow is null then raise exception 'Record not found' using errcode='42501';end if;
 if (oldrow->>'updated_at')::timestamptz is distinct from p_expected_updated_at then raise exception '다른 화면에서 먼저 수정했습니다. 새로고침 후 다시 확인해 주세요.' using errcode='40001';end if;
 if oldrow->>'beetlelog_id' is not null then
  arrkey:=case p_kind when 'adults' then 'parents' when 'lines' then 'lines' else 'individuals' end;
  select value into item from jsonb_array_elements(coalesce(doc->arrkey,'[]')) where value->>'id'=oldrow->>'beetlelog_id';
  if item is null then raise exception 'BeetleLog 원본이 삭제되었거나 없습니다. 저장하지 않았습니다.' using errcode='40001';end if;
  if oldrow->'beetlelog_snapshot' is null or item is distinct from oldrow->'beetlelog_snapshot' then
   raise exception 'BeetleLog에서 먼저 수정되었습니다. 입력 내용은 유지됩니다. 닫은 뒤 새로고침하여 최신 기록을 확인해 주세요.' using errcode='40001';
  end if;
 end if;
 if p_patch ? 'pupal_weight' then
  pupation:=case when jsonb_typeof(oldrow->'source_data'->'pupation')='object' then oldrow->'source_data'->'pupation' else '{}'::jsonb end;
  p_patch:=p_patch||jsonb_build_object('source_data',jsonb_set(coalesce(oldrow->'source_data','{}'),'{pupation}',pupation||jsonb_build_object('pupaWeight',coalesce(p_patch->>'pupal_weight',''))));
 end if;
 select string_agg(quote_ident(k),',' order by k) into cols from jsonb_object_keys(p_patch) k;
 execute format('update public.%I as t set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1)) where t.id=$2 returning to_jsonb(t.*)',tbl,cols,cols,tbl)
 into saved using oldrow||p_patch,p_id;
 if oldrow->>'beetlelog_id' is not null then
  report:=hemiso_internal.sync_records('push',p_kind,p_id);
  if jsonb_array_length(report->'conflicts')>0 then raise exception '%',report->'conflicts'->0->>'reason' using errcode='40001';end if;
  execute format('select to_jsonb(t.*) from public.%I t where id=$1',tbl) into saved using p_id;
 end if;
 return jsonb_build_object('record',saved,'synced',oldrow->>'beetlelog_id' is not null);
end;$$;
revoke all on function hemiso_internal.as_weight(text),hemiso_internal.sync_records(text,text,uuid),public.hemiso_save_record(text,uuid,timestamptz,jsonb) from public,anon;
grant execute on function hemiso_internal.as_weight(text),hemiso_internal.sync_records(text,text,uuid),public.hemiso_save_record(text,uuid,timestamptz,jsonb) to authenticated;
