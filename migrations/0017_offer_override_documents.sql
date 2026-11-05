-- Two gaps in the production-data override flow:
--
-- 1. "Soil test on file" was a bare boolean claim with nowhere to actually attach the soil test
--    report — unlike third-party verification, which already got a real document upload
--    (0014_updates_batch.sql). Give it the same treatment.
-- 2. A listing that overrides its grower's per-commodity production data had no way to attach
--    ITS OWN verification statement or soil test document — override_verification_document_path
--    existed on `offers` but no endpoint ever wrote to it (a known, disclosed gap). Add the
--    matching soil-test column and wire up endpoints for both (see offers_routes.py).

begin;

alter table public.production_data
  add column if not exists soil_test_document_path text;

alter table public.offers
  add column if not exists override_soil_test_document_path text;

commit;
