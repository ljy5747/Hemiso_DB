-- Applied additive schema extension. Does not alter BeetleLog records or sync mappings.
alter table public.hemiso_larvae add column if not exists pupal_weight numeric(8,3)
  check (pupal_weight > 0 and pupal_weight < 10000);
comment on column public.hemiso_larvae.pupal_weight is
  'Pupal weight in grams. Conversion ratio = adult size (mm) / pupal weight (g). Hemiso-only field preserved by sync.';

alter table public.hemiso_adults add column if not exists pupal_weight numeric(8,3)
  check (pupal_weight > 0 and pupal_weight < 10000);
comment on column public.hemiso_adults.pupal_weight is
  'Optional pupal weight in grams. Hemiso-only field preserved independently of BeetleLog sync.';
