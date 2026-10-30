-- Integration test: all fixtures and edits roll back; no production record is retained.
begin;
do $$
declare uid uuid;doc jsonb;result jsonb;aid uuid;lid uuid;denied boolean;claims jsonb;vid uuid;vers timestamptz;
begin
 select id into uid from auth.users where lower(email)='ljy5747@gmail.com' and email_confirmed_at is not null;
 if uid is null then raise exception 'Verified owner account missing';end if;
 claims:=jsonb_build_object('sub',uid,'email','ljy5747@gmail.com','role','authenticated','app_metadata',jsonb_build_object('provider','google','providers',jsonb_build_array('google')));
 perform set_config('request.jwt.claims',claims::text,true);
 -- Add a disposable source family inside this transaction only.
 select data into doc from public.beetlelog_data where user_key='user:ljy5747@gmail.com' for update;
 if doc is null then raise exception 'Existing BeetleLog account missing';end if;
 doc:=jsonb_set(doc,'{parents}',coalesce(doc->'parents','[]')||jsonb_build_array(
  jsonb_build_object('id','hemiso-test-m','code','HEMISO_TEST_M','species','Dorcus nepalensis','sex','수컷 ♂','totalLength','70','memo','original','customPreserved','yes'),
  jsonb_build_object('id','hemiso-test-f','code','HEMISO_TEST_F','species','Dorcus nepalensis','sex','암컷 ♀','totalLength','40')));
 doc:=jsonb_set(doc,'{lines}',coalesce(doc->'lines','[]')||jsonb_build_array(jsonb_build_object('id','hemiso-test-line','code','HEMISO_TEST_LINE','species','Dorcus nepalensis','fatherId','hemiso-test-m','motherId','hemiso-test-f','year','2026')));
 doc:=jsonb_set(doc,'{individuals}',coalesce(doc->'individuals','[]')||jsonb_build_array(jsonb_build_object('id','hemiso-test-larva','code','HEMISO_TEST_LARVA','lineId','hemiso-test-line','bottleRecords',jsonb_build_array(jsonb_build_object('id','bottle1','date','2026-10-01','feedBrand','Test','weight','0','bottleSize','800')))));
 update public.beetlelog_data set data=doc where user_key='user:ljy5747@gmail.com';
 execute 'set local role authenticated';
 if not public.hemiso_authorized() then raise exception 'Owner rejected';end if;
 result:=public.hemiso_import_beetlelog('{}',array['hemiso-test-line']);
 if (result->>'imported_adults')::int<>2 or (result->>'imported_lines')::int<>1 or (result->>'imported_larvae')::int<>1 then raise exception 'Import result mismatch: %',result;end if;
 select id into aid from public.hemiso_adults where beetlelog_id='hemiso-test-m';
 select id into lid from public.hemiso_lines where beetlelog_id='hemiso-test-line';
 if not exists(select 1 from public.hemiso_lines where id=lid and father_id=aid and mother_id is not null) then raise exception 'Parents not linked';end if;
 if not exists(select 1 from public.hemiso_larvae where beetlelog_id='hemiso-test-larva' and records->0->>3='0') then raise exception 'Zero weight lost';end if;
 update public.hemiso_larvae set pupal_weight=12.345 where beetlelog_id='hemiso-test-larva';
 if not exists(select 1 from public.hemiso_larvae where beetlelog_id='hemiso-test-larva' and pupal_weight=12.345) then raise exception 'Pupal weight did not persist';end if;
 denied:=false;begin update public.hemiso_larvae set pupal_weight=0 where beetlelog_id='hemiso-test-larva';exception when check_violation then denied:=true;end;
 if not denied then raise exception 'Invalid zero pupal weight accepted';end if;
 update public.hemiso_adults set pupal_weight=9.876, note='edited in Hemiso' where id=aid;
 result:=public.hemiso_sync_beetlelog('push');
 if (result->>'updated_adults')::int<1 or jsonb_array_length(result->'conflicts')<>0 then raise exception 'Push failed: %',result;end if;
 select data into doc from public.beetlelog_data where user_key='user:ljy5747@gmail.com';
 if not exists(select 1 from jsonb_array_elements(doc->'parents') x where x->>'id'='hemiso-test-m' and x->>'memo'='edited in Hemiso' and x->>'customPreserved'='yes') then raise exception 'Push lost original fields';end if;
 -- Simulate a source edit, then a pull.
 select jsonb_set(doc,'{parents}',(select jsonb_agg(case when x->>'id'='hemiso-test-m' then x||'{"memo":"edited in BeetleLog"}'::jsonb else x end) from jsonb_array_elements(doc->'parents') x)) into doc;
 update public.beetlelog_data set data=doc where user_key='user:ljy5747@gmail.com';
 result:=public.hemiso_sync_beetlelog('pull');
 if (result->>'updated_adults')::int<>1 or not exists(select 1 from public.hemiso_adults where id=aid and note='edited in BeetleLog' and pupal_weight=9.876) then raise exception 'Pull failed: %',result;end if;
 -- Pull a changed larval record and ensure the Hemiso-only pupal measurement survives.
 select data into doc from public.beetlelog_data where user_key='user:ljy5747@gmail.com';
 select jsonb_set(doc,'{individuals}',(select jsonb_agg(case when x->>'id'='hemiso-test-larva' then jsonb_set(x,'{bottleRecords,0,weight}','"12"'::jsonb) else x end) from jsonb_array_elements(doc->'individuals') x)) into doc;
 update public.beetlelog_data set data=doc where user_key='user:ljy5747@gmail.com';
 result:=public.hemiso_sync_beetlelog('pull');
 if not exists(select 1 from public.hemiso_larvae where beetlelog_id='hemiso-test-larva' and pupal_weight=12.345 and records->0->>3='12') then raise exception 'Sync lost pupal weight or failed larval pull';end if;

 -- Saving one linked record atomically updates only that BeetleLog record.
 select id,updated_at into vid,vers from public.hemiso_larvae where beetlelog_id='hemiso-test-larva';
 result:=public.hemiso_save_record('larvae',vid,vers,'{"size":75,"pupal_weight":15}'::jsonb);
 if result->>'synced'<>'true' then raise exception 'Linked save not synchronized';end if;
 select data into doc from public.beetlelog_data where user_key='user:ljy5747@gmail.com';
 if not exists(select 1 from jsonb_array_elements(doc->'individuals') x where x->>'id'='hemiso-test-larva' and (x->'pupation'->>'pupaWeight')::numeric=15 and x->'eclosion'->>'totalLength'='75.00' and x->'bottleRecords'->0->>'weight'='12') then raise exception 'Atomic larval save lost measurements: %',result;end if;
 -- Source pupa edits must now flow back to the column as well as the raw source.
 select jsonb_set(doc,'{individuals}',(select jsonb_agg(case when x->>'id'='hemiso-test-larva' then jsonb_set(x,'{pupation,pupaWeight}','"16.5"'::jsonb) else x end) from jsonb_array_elements(doc->'individuals') x)) into doc;
 update public.beetlelog_data set data=doc where user_key='user:ljy5747@gmail.com';
 result:=public.hemiso_sync_beetlelog('pull');
 if not exists(select 1 from public.hemiso_larvae where id=vid and pupal_weight=16.5) then raise exception 'Source pupal change did not pull: %',result;end if;
 denied:=false;begin perform public.hemiso_save_record('larvae',vid,vers,'{"size":90}');exception when serialization_failure then denied:=true;end;
 if not denied then raise exception 'Stale save succeeded';end if;
 select updated_at into vers from public.hemiso_larvae where id=vid;
 select jsonb_set(doc,'{individuals}',(select jsonb_agg(case when x->>'id'='hemiso-test-larva' then x||'{"memo":"remote while editing"}'::jsonb else x end) from jsonb_array_elements(doc->'individuals') x)) into doc;
 update public.beetlelog_data set data=doc where user_key='user:ljy5747@gmail.com';
 denied:=false;begin perform public.hemiso_save_record('larvae',vid,vers,'{"size":90}');exception when serialization_failure then denied:=true;end;
 if not denied or not exists(select 1 from public.hemiso_larvae where id=vid and size=75) then raise exception 'Remote conflict did not roll back local edit';end if;
 result:=public.hemiso_sync_beetlelog('pull');
 select updated_at into vers from public.hemiso_larvae where id=vid;
 result:=public.hemiso_save_record('larvae',vid,vers,'{"pupal_weight":null}');
 if not exists(select 1 from public.hemiso_larvae where id=vid and pupal_weight is null and source_data->'pupation'->>'pupaWeight'='') then raise exception 'Clearing weight failed';end if;
 denied:=false;begin perform public.hemiso_save_record('larvae',vid,(result->'record'->>'updated_at')::timestamptz,jsonb_build_object('owner_id',gen_random_uuid()));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Edit whitelist bypass';end if;
 -- Unsaved changes to a different record must not be pushed by a scoped save.
 update public.hemiso_adults set note='unrelated local edit' where beetlelog_id='hemiso-test-f';
 select updated_at into vers from public.hemiso_adults where id=aid;
 result:=public.hemiso_save_record('adults',aid,vers,'{"note":"atomic adult edit","pupal_weight":10.25}');
 select data into doc from public.beetlelog_data where user_key='user:ljy5747@gmail.com';
 if not exists(select 1 from jsonb_array_elements(doc->'parents') x where x->>'id'='hemiso-test-m' and x->>'memo'='atomic adult edit' and x->>'customPreserved'='yes' and (x->'pupation'->>'pupaWeight')::numeric=10.25) then raise exception 'Atomic adult sync failed';end if;
 if exists(select 1 from jsonb_array_elements(doc->'parents') x where x->>'id'='hemiso-test-f' and x->>'memo'='unrelated local edit') then raise exception 'Scoped save pushed another record';end if;
 update public.hemiso_adults set note='local concurrent edit' where id=aid;
 select jsonb_set(doc,'{parents}',(select jsonb_agg(case when x->>'id'='hemiso-test-m' then x||'{"memo":"remote concurrent edit"}'::jsonb else x end) from jsonb_array_elements(doc->'parents') x)) into doc;
 update public.beetlelog_data set data=doc where user_key='user:ljy5747@gmail.com';
 result:=public.hemiso_sync_beetlelog('pull');
 if jsonb_array_length(result->'conflicts')<>1 or not exists(select 1 from public.hemiso_adults where id=aid and note='local concurrent edit') then raise exception 'Conflict protection failed: %',result;end if;
 -- Unapproved authenticated account cannot read, edit or call integration RPCs.
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'email','other@example.invalid','role','authenticated','app_metadata',jsonb_build_object('provider','google'))::text,true);
 if coalesce(public.hemiso_authorized(),false) then raise exception 'Unapproved account authorized';end if;
 if exists(select 1 from public.hemiso_adults) or exists(select 1 from public.hemiso_lines) or exists(select 1 from public.hemiso_larvae) then raise exception 'RLS leaked records';end if;
 denied:=false;begin insert into public.hemiso_adults(code,sex) values('UNAUTHORIZED','M');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unauthorized write allowed';end if;
 denied:=false;begin perform public.hemiso_import_beetlelog('{}','{}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unauthorized RPC allowed';end if;
 denied:=false;begin perform public.hemiso_save_record('adults',aid,vers,'{"note":"denied"}');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Unauthorized save allowed';end if;
 execute 'reset role';execute 'set local role anon';
 denied:=false;begin perform count(*) from public.hemiso_adults;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous table access allowed';end if;
 denied:=false;begin perform public.hemiso_authorized();exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous auth RPC allowed';end if;
 execute 'reset role';
end;$$;
rollback;
select 'Hemiso atomic targeted editing, pupal push/pull, clear, stale and remote-conflict rollback, whitelist, RLS and original sync passed; fixtures rolled back' as result;
