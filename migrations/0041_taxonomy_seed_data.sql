-- Seeds taxonomy_terms across all five vocabularies (attribute/practice/certification/
-- data_requirement/service_category) so a handoff or a fresh environment doesn't start with
-- empty admin-managed pickers everywhere in the app. Four of these five already had real content
-- entered live through the Admin > Taxonomy screen (never previously captured in a migration);
-- this captures that content plus a starter set for data_requirement, the one vocabulary that was
-- still empty. Idempotent — `on conflict (type, label) do nothing` makes this a safe no-op for
-- anything that already exists (matches taxonomy_terms_type_label_key, see
-- migrations/0016_taxonomy_terms.sql).

begin;

insert into public.taxonomy_terms (type, label, definition) values
  ('attribute', '4R Nutrient Stewardship', '4R Nutrient Stewardship is a science-based framework that guides farmers to apply the right fertilizer source at the right rate, at the right time, and in the right place.'),
  ('attribute', 'Burn-free', null),
  ('attribute', 'Carbon Scoring: Certified', null),
  ('attribute', 'Carbon Scoring: Estimated', null),
  ('attribute', 'DCF: Deforestation and Conversion Free', null),
  ('attribute', 'High SOM (Soil Organic Matter)', null),
  ('attribute', 'Living roots (Cover Crops)', null),
  ('attribute', 'Low erosion', null),
  ('attribute', 'Low herbicide use', null),
  ('attribute', 'Low nutrient loss', null),
  ('attribute', 'Low pesticide use', null),
  ('attribute', 'Nature Positive', null),
  ('attribute', 'Non-GM', 'The grain is not genetically modified — free of genetically engineered traits.'),
  ('attribute', 'Nutrient cycling', null),
  ('attribute', 'Organic', 'Certified organic under a recognized organic standard (no synthetic pesticides/fertilizers, no GMOs).'),
  ('attribute', 'Water efficient', 'Grown using irrigation or field practices that reduce water use per unit of yield relative to conventional production.'),
  ('attribute', 'Zero pesticide use', null)
on conflict (type, label) do nothing;

insert into public.taxonomy_terms (type, label, definition) values
  ('certification', 'FSA GAP', 'USDA Farm Service Agency Good Agricultural Practices certification, verifying on-farm food safety practices.'),
  ('certification', 'FSMA', 'Compliant with the FDA''s Food Safety Modernization Act preventive-controls requirements.'),
  ('certification', 'GMP+', 'Certified under the GMP+ Feed Certification scheme for feed safety and quality assurance.'),
  ('certification', 'ISCC+', '(International Sustainability and Carbon Certification Plus) is a globally recognized, voluntary certification system that verifies the sustainability, traceability, and circularity of bio-based, renewable, and recycled raw materials across global supply chains.'),
  ('certification', 'Non-GMO', 'Certified as free of genetically modified organisms under a recognized verification program.'),
  ('certification', 'Organic', 'Certified organic under USDA or an equivalent recognized organic standard.'),
  ('certification', 'SQF', 'Safe Quality Food certification — a rigorous, GFSI-recognized food safety and quality management standard.')
on conflict (type, label) do nothing;

insert into public.taxonomy_terms (type, label, definition) values
  ('practice', 'Application Logs: Banned chemical screening', null),
  ('practice', 'Application Logs: Buffer zone mapping', null),
  ('practice', 'Buffer Strips', 'Vegetated strips are maintained along field edges or waterways to filter runoff and reduce erosion.'),
  ('practice', 'Conservation Tillage', 'Tillage practices that leave at least 30% of crop residue on the soil surface to reduce erosion.'),
  ('practice', 'Cover Crops', 'A non-cash crop is planted between main-crop seasons to protect and improve the soil.'),
  ('practice', 'Crop Rotations: Advanced', null),
  ('practice', 'Crop Rotations: Basic', null),
  ('practice', 'Forestry: Tree/Shrub establishment', null),
  ('practice', 'Forestry: Wildlife Habitat Management', null),
  ('practice', 'Grazing: Rotational grazing', null),
  ('practice', 'Monitoring: Herbicide use', null),
  ('practice', 'Monitoring: Nutrient loss', null),
  ('practice', 'Monitoring: Pesticide use', null),
  ('practice', 'Monitoring: Soil erosion', null),
  ('practice', 'Monitoring: Soil organic matter', null),
  ('practice', 'Monitoring: Water quality', null),
  ('practice', 'Monitoring: Withdrawal tracking', null),
  ('practice', 'Monitoring: Yield data tracking', null),
  ('practice', 'Nutrient Management Plan', 'A documented, field-specific plan governing fertilizer rate, timing, and placement.'),
  ('practice', 'Nutrient Management: Precision nutrient application', null),
  ('practice', 'Other Sustainable Practice', 'A verified sustainability practice not covered by the other listed categories.'),
  ('practice', 'Reduced / No Synthetic Inputs', 'Synthetic fertilizers and/or pesticides are reduced or eliminated in favor of alternative inputs.'),
  ('practice', 'Reduced Till', 'Tillage is minimized, though not eliminated, compared to conventional full tillage.'),
  ('practice', 'Soil Cover: Cover crops (100%)', null),
  ('practice', 'Tillage: Mulch', null),
  ('practice', 'Tillage: No-till', null),
  ('practice', 'Tillage: Strip-till', null),
  ('practice', 'Water Stewardship: Filter strips', null),
  ('practice', 'Water Stewardship: Grassed waterways', null),
  ('practice', 'Water Stewardship: Riparian buffers', null),
  ('practice', 'Wetland Protection', 'Adjacent wetlands are preserved or restored rather than drained or converted to cropland.')
on conflict (type, label) do nothing;

insert into public.taxonomy_terms (type, label, definition) values
  ('service_category', 'Customs & Documentation', 'Customs brokerage, export documentation, and compliance.'),
  ('service_category', 'Financing', 'Trade finance, letters of credit, and payment facilitation.'),
  ('service_category', 'Inspection', 'Quality/quantity inspection and grading services.'),
  ('service_category', 'Logistics', 'Freight, trucking, and cold-chain transportation.'),
  ('service_category', 'Storage & Warehousing', 'Grain storage, warehousing, and handling.')
on conflict (type, label) do nothing;

-- data_requirement was still empty — a starter set matching taxonomy_routes.py's own "future
-- vision" framing (precision-ag data a buyer might ask a grower for, negotiated over chat today
-- rather than matched on — see backend/taxonomy_routes.py and bids_routes.py's
-- required_data_requirements).
insert into public.taxonomy_terms (type, label, definition) values
  ('data_requirement', 'John Deere Operations Center Access', 'Shared read access to the grower''s John Deere Operations Center account for the relevant fields.'),
  ('data_requirement', 'Climate FieldView Access', 'Shared read access to the grower''s Climate FieldView account for the relevant fields.'),
  ('data_requirement', 'GeoJSON Field Boundaries', 'Field boundary data in GeoJSON format for the fields this listing covers.'),
  ('data_requirement', 'Yield Monitor Data Export', 'Combine yield-monitor data export for the relevant harvest.'),
  ('data_requirement', 'As-Applied Input Records', 'Machine-logged as-applied records for seed, fertilizer, and crop protection inputs.'),
  ('data_requirement', 'Soil Test Lab Report', 'A recent soil test lab report (PDF) for the fields this listing covers.')
on conflict (type, label) do nothing;

commit;
