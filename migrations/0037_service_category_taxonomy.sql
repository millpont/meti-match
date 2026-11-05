-- Phase 10 Pass 2: Service Provider marketplace. Service categories (logistics, inspection,
-- financing, etc.) reuse the existing taxonomy_terms system — same admin-managed, superadmin-
-- CRUD, ChipMultiSelect-picker pattern every other vocabulary in this app already uses, rather
-- than a bespoke table for one more flat label+definition list.

begin;

alter table public.taxonomy_terms drop constraint taxonomy_terms_type_check;
alter table public.taxonomy_terms add constraint taxonomy_terms_type_check check (type in (
  'attribute', 'practice', 'certification', 'data_requirement', 'service_category'
));

commit;
