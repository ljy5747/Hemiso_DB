-- Supplementary Hemiso measurements. Existing BeetleLog synchronization uses explicit columns.
alter table public.hemiso_larvae
 add column nep_hatched date,
 add column nep_pupated date,
 add column nep_outcome text check (nep_outcome in ('normal','imperfect','died')),
 add column nep_adult_id uuid references public.hemiso_adults(id) on delete set null,
 add constraint hemiso_nep_order check (nep_hatched is null or nep_pupated is null or nep_hatched <= nep_pupated);
create unique index hemiso_nep_one_adult on public.hemiso_larvae(nep_adult_id) where nep_adult_id is not null;
alter table public.hemiso_lines add column nep_sets jsonb not null default '[]' check (jsonb_typeof(nep_sets)='array');
create function hemiso_internal.is_nepalensis(label text) returns boolean language sql immutable set search_path='' as $$
 select trim(regexp_replace(lower(coalesce(label,'')), '[.[:space:]]+', ' ', 'g')) in ('dorcus nepalensis','d nepalensis','네팔렌시스');
$$;
create function hemiso_internal.check_nep_analysis() returns trigger language plpgsql security invoker set search_path='' as $$
declare setrow jsonb;
begin
 if tg_table_name='hemiso_lines' then
  if new.nep_sets='[]' then return new; end if;
  if not hemiso_internal.is_nepalensis(new.species) then raise exception '네팔렌시스 라인을 선택하세요'; end if;
  for setrow in select value from jsonb_array_elements(new.nep_sets) loop
   if jsonb_typeof(setrow)<>'object' or coalesce(setrow->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' or
    coalesce(setrow->>'end','') !~ '^\d{4}-\d{2}-\d{2}$' or (setrow->>'end')::date < (setrow->>'start')::date or
    jsonb_typeof(setrow->'count') is distinct from 'number' or coalesce(setrow->>'count','') !~ '^\d{1,6}$' then raise exception '종료한 산란 세트의 날짜와 회수 수를 확인하세요'; end if;
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
create trigger hemiso_nep_larva_fields before insert or update of nep_hatched,nep_pupated,nep_outcome,nep_adult_id on public.hemiso_larvae for each row execute function hemiso_internal.check_nep_analysis();
create trigger hemiso_nep_line_sets before insert or update of nep_sets on public.hemiso_lines for each row execute function hemiso_internal.check_nep_analysis();
revoke all on function hemiso_internal.is_nepalensis(text),hemiso_internal.check_nep_analysis() from public,anon;
grant execute on function hemiso_internal.is_nepalensis(text),hemiso_internal.check_nep_analysis() to authenticated;

-- Security-invoker views keep the collection's owner policies for SQL analysis and exports.
create view public.hemiso_nep_lines with (security_invoker=true) as
 select * from public.hemiso_lines where hemiso_internal.is_nepalensis(species);
create view public.hemiso_nep_adults with (security_invoker=true) as
 select * from public.hemiso_adults where hemiso_internal.is_nepalensis(species);
create view public.hemiso_nep_larvae with (security_invoker=true) as
 select v.* from public.hemiso_larvae v join public.hemiso_nep_lines l on l.id=v.line_id
 where nullif(btrim(v.source_data->>'species'),'') is null or hemiso_internal.is_nepalensis(v.source_data->>'species');
revoke all on public.hemiso_nep_lines, public.hemiso_nep_adults, public.hemiso_nep_larvae from public, anon, authenticated;
grant select on public.hemiso_nep_lines, public.hemiso_nep_adults, public.hemiso_nep_larvae to authenticated;
