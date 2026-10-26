create or replace function hemiso_internal.touch_and_validate() returns trigger language plpgsql security invoker set search_path='' as $$
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
