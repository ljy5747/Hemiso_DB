-- All fixture rows and document changes roll back at the end.
begin;
do $$
declare uid uuid; lid uuid; vid uuid; mom uuid; item jsonb; doc jsonb; rev timestamptz; external_id text:=gen_random_uuid()::text;
begin
 select id into strict uid from auth.users where lower(email)='ljy5747@gmail.com' and email_confirmed_at is not null;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email','ljy5747@gmail.com','role','authenticated','app_metadata',jsonb_build_object('provider','google'))::text,true);
 execute 'set local role authenticated';
 insert into public.hemiso_adults(code,species,sex) values('QA-'||gen_random_uuid(),'Dorcus nepalensis','F') returning id into mom;
 insert into public.hemiso_lines(name,species,mother_id,beetlelog_id) values('QA-'||gen_random_uuid(),'Dorcus.Nepalensis',mom,'qa-line-'||external_id) returning id into lid;
 update public.hemiso_lines set nep_sets=jsonb_build_array(jsonb_build_object('mother',mom,'start','2026-01-01','end','2026-02-01','eggs',0)) where id=lid;
 begin
  update public.hemiso_lines set nep_sets=jsonb_set(nep_sets,'{0,eggs}','-1') where id=lid;
  raise exception using errcode='XX000',message='negative eggs accepted';
 exception when raise_exception then null;end;
 item:=jsonb_build_object('id',external_id,'code','QA','lineId','qa-line-'||external_id,'flags',jsonb_build_array('전용','성장불량'),'bottleRecords',jsonb_build_array(jsonb_build_object('flags',jsonb_build_array('원더링'),'memo','keep')));
 update public.beetlelog_data set data=jsonb_set(data,'{individuals}',(data->'individuals')||jsonb_build_array(item)) where user_key='user:ljy5747@gmail.com';
 insert into public.hemiso_larvae(line_id,number,beetlelog_id,beetlelog_snapshot,source_data,records) values(lid,'QA',external_id,item,item,hemiso_internal.larva_values(item)->'records') returning id,updated_at into vid,rev;
 perform public.hemiso_save_growth_observation(vid,rev,true,'individual',null,null,'normal',null);
 select x into strict doc from public.beetlelog_data b cross join lateral jsonb_array_elements(b.data->'individuals') x where b.user_key='user:ljy5747@gmail.com' and x->>'id'=external_id;
 if doc->>'growthIssueCause' is distinct from 'individual' or not ((doc->'flags') ?& array['원더링','성장불량','전용']) or doc->'bottleRecords' is distinct from item->'bottleRecords'
  or not exists(select from public.hemiso_larvae where id=vid and source_data=doc and beetlelog_snapshot=doc and nep_outcome='normal') then raise exception 'atomic write failed'; end if;
 begin perform public.hemiso_save_growth_observation(vid,rev,false,'none',null,null,null,null);
  raise exception 'stale edit accepted';exception when serialization_failure then null;end;
 -- A BeetleLog-only change makes a stale Hemiso save fail, then a pull retrieves the cause.
 item:=doc||jsonb_build_object('growthIssueCause','feed','code','QA','lineId','qa-line-'||external_id);
 update public.beetlelog_data set data=jsonb_set(data,'{individuals}',(select jsonb_agg(case when x->>'id'=external_id then item else x end order by ord) from jsonb_array_elements(data->'individuals') with ordinality t(x,ord))) where user_key='user:ljy5747@gmail.com';
 select updated_at into rev from public.hemiso_larvae where id=vid;
 begin perform public.hemiso_save_growth_observation(vid,rev,false,'none',null,null,null,null);
  raise exception 'remote conflict missed';exception when serialization_failure then null;end;
 perform hemiso_internal.sync_records('pull','larvae',vid);
 if not exists(select from public.hemiso_larvae where id=vid and source_data->>'growthIssueCause'='feed' and nep_outcome='normal') then raise exception 'BeetleLog pull failed';end if;
 select updated_at into rev from public.hemiso_larvae where id=vid;
 perform public.hemiso_save_growth_observation(vid,rev,false,'none',null,null,null,null);
 if not exists(select from public.hemiso_larvae where id=vid and source_data->'flags'='["전용"]' and source_data->>'growthIssueCause' is null) then raise exception 'clear failed';end if;
 if has_function_privilege('anon','public.hemiso_save_growth_observation(uuid,timestamptz,boolean,text,date,date,text,uuid)','execute') then raise exception 'anonymous access';end if;
end;$$;
rollback;
