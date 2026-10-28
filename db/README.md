# Hemiso_DB backend

This backend is installed in the existing BeetleLog Supabase project. It creates only new `hemiso_` tables and `hemiso_internal` functions. No production collection rows were copied during setup.

## Access

The allowlist contains only the existing, email-confirmed `ljy5747@gmail.com` account UUID. Authorization checks the signed account UUID, email and trusted Google provider metadata. Client-editable user metadata is never an authorization source. RLS covers every table; unapproved users cannot read, insert, update or delete collection records. Anonymous roles have no table or RPC permissions.

## Frontend API

- `rpc('hemiso_authorized')` → boolean.
- `from('hemiso_adults'|'hemiso_lines'|'hemiso_larvae').select('*')` → own records only.
- Insert with a client UUID or allow the default UUID; omit `owner_id`, `created_at`, `updated_at` to use server defaults.
- Optimistic edit: `.update(payload).eq('id', id).eq('updated_at', loadedVersion).select().maybeSingle()`. A null response means a concurrent edit; reload before retrying.
- Deletion affects only Hemiso records. Foreign-key constraints protect records used as parents or containing larvae. Delete dependent records explicitly if intended.
- `rpc('hemiso_import_beetlelog', {p_adult_ids: [...], p_line_ids: [...]})` imports selected source records. Selected lines also import their registered parents and all associated larvae. Existing imported identities are not duplicated. Returns `imported_adults`, `imported_lines`, `imported_larvae`, and `issues`.
- `rpc('hemiso_sync_beetlelog', {p_direction:'pull'})` pulls source changes for already-linked records. Local changes or simultaneous edits return a conflict instead of being overwritten.
- `rpc('hemiso_sync_beetlelog', {p_direction:'push'})` sends local changes for already-linked records to BeetleLog, preserving unknown source fields. A changed source snapshot returns a conflict instead of being overwritten.
- Both sync calls return `updated_adults`, `updated_lines`, `updated_larvae`, and `conflicts: [{kind,id,name,reason}]`.

Sync is explicit. New Hemiso-only records are not automatically created in BeetleLog. Deletions never propagate to BeetleLog. After import, sync or mutation, reload the local lists to obtain current server versions. `beetlelog_snapshot` is the synchronization baseline; do not change it in ordinary record forms.

## Verification

`verify.sql` runs a transaction containing disposable source/local fixtures and rolls it back. It verifies line-parent import, larva import including zero weights, push/pull mappings, preservation of unrelated original fields, conflict detection, unapproved account read/write/RPC denial, and anonymous denial.

The database security advisor reports no Hemiso security findings. Existing findings for other apps were outside this change. Performance checks find only the expected unused newly-created larva index; keep it for line lookups.

`schema.sql` is the one-time full setup reference. `hardening.sql` is the already-applied supplementary relationship validation (included in schema.sql too). Do not re-run the full setup against an existing installation.

Frontend contract regression: run `node tests/frontend.cjs` from the repository. It evaluates the real application in a Node VM with a mocked DOM and Supabase client. Checks cover HTML escaping and photo URL schemes, auth gating, species-scoped selection, repeated line imports for missing larvae, RPC argument mapping, adult/line/larva payloads, preserving zero measurements and unedited fields, optimistic update/delete versions, stale update rejection, OAuth callback construction, and logout cleanup. Test fixtures contain no production identities or collection data.

## Analysis extension

`analytics.sql` adds nullable `hemiso_larvae.pupal_weight` and `hemiso_adults.pupal_weight` (grams, numeric(8,3), greater than zero). Already installed. Existing RLS and ownership checks cover the column. It is intentionally independent of BeetleLog import and synchronization; those functions update explicit columns and preserve this measurement. The regression transaction verifies decimal persistence, zero rejection and preservation across larval pull.
