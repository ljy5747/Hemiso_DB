create or replace function hemiso_internal.check_nep_analysis() returns trigger language plpgsql security invoker set search_path='' as $$
declare setrow jsonb;
begin
 if tg_table_name='hemiso_lines' then
  if new.nep_sets='[]' then return new; end if;
  if not hemiso_internal.is_nepalensis(new.species) then raise exception '네팔렌시스 라인을 선택하세요'; end if;
  for setrow in select value from jsonb_array_elements(new.nep_sets) loop
   if jsonb_typeof(setrow)<>'object' or coalesce(setrow->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' or
    coalesce(setrow->>'end','') !~ '^\d{4}-\d{2}-\d{2}$' or (setrow->>'end')::date < (setrow->>'start')::date or
    not (setrow ?| array['count','eggs']) or exists (
      select from jsonb_each(setrow) e where e.key in ('count','eggs')
        and (jsonb_typeof(e.value)<>'number' or e.value::text !~ '^[0-9]{1,6}$')) then raise exception '종료한 산란 세트의 날짜와 산란·회수 수를 확인하세요'; end if;
   if new.mother_id is not null and new.mother_id is distinct from (setrow->>'mother')::uuid then raise exception '이 라인의 모 개체를 선택하세요'; end if;
   if not exists(select 1 from public.hemiso_adults a where a.id=(setrow->>'mother')::uuid and a.owner_id=new.owner_id and a.sex='F' and hemiso_internal.is_nepalensis(a.species)) then raise exception '모 개체를 확인하세요'; end if;
  end loop;
 elsif new.nep_hatched is not null or new.nep_pupated is not null or new.nep_outcome is not null or new.nep_adult_id is not null then
  if not exists(select 1 from public.hemiso_lines l where l.id=new.line_id and l.owner_id=new.owner_id and hemiso_internal.is_nepalensis(l.species)) then raise exception '네팔렌시스 유충만 선택할 수 있습니다'; end if;
  if nullif(btrim(new.source_data->>'species'),'') is not null and not hemiso_internal.is_nepalensis(new.source_data->>'species') then raise exception '유충과 라인의 종을 확인하세요'; end if;
  if new.nep_adult_id is not null and not exists(select 1 from public.hemiso_adults a join public.hemiso_lines l on l.id=new.line_id where a.id=new.nep_adult_id and a.owner_id=new.owner_id and hemiso_internal.is_nepalensis(a.species) and (a.sex=new.sex or 'U' in (a.sex,new.sex)) and a.id is distinct from l.father_id and a.id is distinct from l.mother_id) then raise exception '우화한 동일 개체를 선택하세요'; end if;
 end if;
 return new;
end;$$;

-- Only the two specimen flags are shared. All other BeetleLog fields and bottle observations stay intact.
create or replace function public.hemiso_save_growth_observation(
 p_id uuid, p_version timestamptz, p_wandering boolean, p_growth text,
 p_hatched date, p_pupated date, p_outcome text, p_adult uuid
) returns boolean language plpgsql security invoker set search_path='' as $$
declare
 v public.hemiso_larvae%rowtype; doc jsonb; raw jsonb; original jsonb; flags jsonb; pos bigint;
 account_key text:='user:'||lower(auth.jwt()->>'email');
begin
 if not coalesce(public.hemiso_authorized(),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_growth is null or p_growth not in ('none','unknown','feed','individual') or p_wandering is null then raise exception '관찰값을 확인하세요'; end if;
 select data into doc from public.beetlelog_data where user_key=account_key for update;
 select * into strict v from public.hemiso_larvae where id=p_id and owner_id=auth.uid() for update;
 if v.updated_at is distinct from p_version then raise exception '다른 화면에서 먼저 수정했습니다. 다시 열어 주세요.' using errcode='40001'; end if;
 if not exists(select from public.hemiso_nep_larvae where id=v.id) then raise exception '네팔렌시스 유충을 확인하세요'; end if;
 raw:=v.source_data;
 if v.beetlelog_id is not null then
  select x.value,x.ord-1 into original,pos from jsonb_array_elements(doc->'individuals') with ordinality x(value,ord) where x.value->>'id'=v.beetlelog_id;
  if original is null or original is distinct from v.beetlelog_snapshot or raw is distinct from original then
   raise exception '연동 기록이 변경되었습니다. 새로고침 후 다시 열어 주세요.' using errcode='40001';
  end if;
 end if;
 if jsonb_typeof(raw->'flags')='array' then flags:=raw->'flags'; else flags:='[]'; end if;
 flags:=flags-'원더링'-'성장불량';
 if p_wandering then flags:=flags||'["원더링"]'::jsonb; end if;
 if p_growth<>'none' then flags:=flags||'["성장불량"]'::jsonb; end if;
 raw:=raw||jsonb_build_object('flags',flags,'growthIssueCause',nullif(p_growth,'none'));
 if v.beetlelog_id is not null then
  update public.beetlelog_data set data=jsonb_set(doc,array['individuals',pos::text],raw),updated_at=clock_timestamp() where user_key=account_key;
 end if;
 update public.hemiso_larvae set source_data=raw,beetlelog_snapshot=case when v.beetlelog_id is not null then raw else v.beetlelog_snapshot end,
  nep_hatched=p_hatched,nep_pupated=p_pupated,nep_outcome=p_outcome,nep_adult_id=p_adult where id=v.id;
 return true;
end;$$;
revoke all on function public.hemiso_save_growth_observation(uuid,timestamptz,boolean,text,date,date,text,uuid) from public,anon;
grant execute on function public.hemiso_save_growth_observation(uuid,timestamptz,boolean,text,date,date,text,uuid) to authenticated;
