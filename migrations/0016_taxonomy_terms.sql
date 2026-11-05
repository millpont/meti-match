-- Superadmin-managed vocabulary for the three term families pickers across the app draw from:
-- Attributes (sustainability/specialty/buyer-required attributes), Practices (conservation /
-- verified practices), and Certifications. Previously hardcoded in frontend/src/*/constants.ts
-- with no definitions; now a real table so Superadmin can add/edit terms and their definitions,
-- which the frontend shows as a hover tooltip on each chip. See taxonomy_routes.py.
--
-- Seeded with every term the app already used (union across the old separate lists, keeping
-- every distinct label even where two old lists nearly overlapped, e.g. "Non-GM" vs "Non-GMO")
-- so no existing offer/bid/requirement data references a term that's disappeared, plus a real
-- definition for each.

begin;

create table if not exists public.taxonomy_terms (
  id         uuid primary key default gen_random_uuid(),
  type       text not null check (type in ('attribute', 'practice', 'certification')),
  label      text not null,
  definition text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, label)
);

alter table public.taxonomy_terms enable row level security;

insert into public.taxonomy_terms (type, label, definition) values
  ('attribute', 'Low carbon intensity', 'Produced with practices that measurably reduce greenhouse gas emissions per unit of grain, typically verified through a carbon-intensity (CI) score.'),
  ('attribute', 'Regenerative agriculture', 'Farming practices that actively rebuild soil organic matter and biodiversity (e.g. no-till, cover cropping, diverse rotations) rather than just sustaining current conditions.'),
  ('attribute', 'Water efficient', 'Grown using irrigation or field practices that reduce water use per unit of yield relative to conventional production.'),
  ('attribute', 'Nutrient efficient', 'Fertilizer and nutrient application is managed (rate, timing, placement) to minimize excess and runoff while meeting crop needs.'),
  ('attribute', 'Soil health', 'Grown under practices documented to maintain or improve soil structure, organic matter, and biological activity.'),
  ('attribute', 'Biodiversity', 'Production practices that support on-farm habitat and species diversity, such as buffer strips, pollinator plantings, or diverse rotations.'),
  ('attribute', 'Non-GM', 'The grain is not genetically modified — free of genetically engineered traits.'),
  ('attribute', 'Organic', 'Certified organic under a recognized organic standard (no synthetic pesticides/fertilizers, no GMOs).'),
  ('attribute', 'Food Grade', 'Meets the quality and handling standards required for direct human food use, as opposed to feed or industrial use.'),
  ('attribute', 'Non-GMO', 'The grain is verified free of genetically modified organisms.'),
  ('attribute', 'Low-CI', 'Shorthand for Low Carbon Intensity — grain associated with a lower carbon-intensity score than conventional production.'),
  ('attribute', 'Sustainable', 'Produced under environmentally and socially responsible practices, without requiring one specific formal certification.'),
  ('attribute', 'Traceability Certification', 'The grain''s chain of custody from field to buyer can be documented and verified end-to-end.'),
  ('practice', 'No-Till', 'Fields are planted without disturbing the soil through tillage, preserving soil structure and reducing erosion.'),
  ('practice', 'Cover Crops', 'A non-cash crop is planted between main-crop seasons to protect and improve the soil.'),
  ('practice', 'Nutrient Management', 'Fertilizer application is planned and documented to match crop needs and reduce environmental loss.'),
  ('practice', 'Buffer Strips', 'Vegetated strips are maintained along field edges or waterways to filter runoff and reduce erosion.'),
  ('practice', 'Reduced Till', 'Tillage is minimized, though not eliminated, compared to conventional full tillage.'),
  ('practice', 'Crop Rotation', 'Different crops are grown in sequence on the same land across seasons to improve soil health and break pest cycles.'),
  ('practice', 'Conservation Tillage', 'Tillage practices that leave at least 30% of crop residue on the soil surface to reduce erosion.'),
  ('practice', 'Wetland Protection', 'Adjacent wetlands are preserved or restored rather than drained or converted to cropland.'),
  ('practice', 'Nutrient Management Plan', 'A documented, field-specific plan governing fertilizer rate, timing, and placement.'),
  ('practice', 'No-Till / Strip-Till', 'Soil disturbance is limited to a narrow strip at planting, or eliminated entirely, rather than full-field tillage.'),
  ('practice', 'Reduced / No Synthetic Inputs', 'Synthetic fertilizers and/or pesticides are reduced or eliminated in favor of alternative inputs.'),
  ('practice', 'Other Sustainable Practice', 'A verified sustainability practice not covered by the other listed categories.'),
  ('certification', 'Non-GMO', 'Certified as free of genetically modified organisms under a recognized verification program.'),
  ('certification', 'FSA GAP', 'USDA Farm Service Agency Good Agricultural Practices certification, verifying on-farm food safety practices.'),
  ('certification', 'Organic', 'Certified organic under USDA or an equivalent recognized organic standard.'),
  ('certification', 'GMP+', 'Certified under the GMP+ Feed Certification scheme for feed safety and quality assurance.'),
  ('certification', 'SQF', 'Safe Quality Food certification — a rigorous, GFSI-recognized food safety and quality management standard.'),
  ('certification', 'FSMA', 'Compliant with the FDA''s Food Safety Modernization Act preventive-controls requirements.')
on conflict (type, label) do nothing;

commit;
