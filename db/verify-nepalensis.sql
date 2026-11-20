-- Exercise owner permissions and the species boundary using transaction-local records.
begin;
do $$
declare
 owner_key uuid; included uuid; other_line uuid; specimen uuid; foreign_specimen uuid;
 female uuid; other_female uuid; refused boolean := false;
begin
 select id into strict owner_key from auth.users where lower(email)='ljy5747@gmail.com' and email_confirmed_at is not null;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_key,'email','ljy5747@gmail.com','role','authenticated','app_metadata',jsonb_build_object('provider','google'))::text,true);
 execute 'set local role authenticated';
 insert into public.hemiso_lines(name,species) values('QA-'||gen_random_uuid(),' Dorcus.NEPALENSIS ') returning id into included;
 insert into public.hemiso_lines(name,species) values('QA-'||gen_random_uuid(),'Dorcus nepalensis hybrid') returning id into other_line;
 insert into public.hemiso_adults(code,species,sex) values('QA-'||gen_random_uuid(),'Dorcus.Nepalensis','F') returning id into female;
 insert into public.hemiso_adults(code,species,sex) values('QA-'||gen_random_uuid(),'Other','F') returning id into other_female;
 insert into public.hemiso_larvae(line_id,number,sex,nep_adult_id,nep_outcome) values(included,'qa-1','F',female,'normal') returning id into specimen;
 insert into public.hemiso_larvae(line_id,number,source_data) values(included,'qa-2','{"species":"Other"}') returning id into foreign_specimen;
 insert into public.hemiso_larvae(line_id,number) values(other_line,'qa-3');
 if not exists(select from public.hemiso_nep_larvae where id=specimen) or exists(select from public.hemiso_nep_larvae where id=foreign_specimen or line_id=other_line)
  or exists(select from public.hemiso_nep_adults where id=other_female) or exists(select from public.hemiso_nep_lines where id=other_line) then raise exception 'Species boundary failed'; end if;
 begin update public.hemiso_larvae set nep_outcome='normal' where id=foreign_specimen; exception when raise_exception then refused:=true; end;
 if not refused then raise exception 'Foreign specimen accepted'; end if;
 update public.hemiso_lines set nep_sets=jsonb_build_array(jsonb_build_object('start','2026-01-01','end','2026-01-15','mother',female,'count',0)) where id=included;
 if (select nep_sets->0->>'count' from public.hemiso_nep_lines where id=included) is distinct from '0' then raise exception 'Zero-count set lost'; end if;
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 if exists(select from public.hemiso_nep_lines) or exists(select from public.hemiso_nep_larvae) or exists(select from public.hemiso_nep_adults) then raise exception 'Views bypass RLS'; end if;
 if has_table_privilege('anon','public.hemiso_nep_larvae','select') then raise exception 'Anonymous grant'; end if;
end;$$;
rollback;
