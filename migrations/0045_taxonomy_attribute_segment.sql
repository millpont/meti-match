-- Specialty vs Sustainability has only ever existed as two separate arrays on offers
-- (sustainability_attributes/specialty_attributes), both populated by picking terms from the
-- SAME flat taxonomy_terms(type='attribute') pool -- there was no stored distinction at the
-- taxonomy level. This adds that real distinction so the superadmin UI and filters can group by
-- it instead of just offering the same list twice.
--
-- Per user decision: every attribute term that already exists becomes 'sustainability'; the new
-- curated list below becomes 'specialty'. Nothing is deleted -- a label collision with the new
-- list re-tags that existing term as specialty instead of erroring (on conflict ... do update).
alter table taxonomy_terms add column if not exists segment text
  check (segment in ('specialty', 'sustainability') or segment is null);

update taxonomy_terms set segment = 'sustainability'
where type = 'attribute' and segment is null;

insert into taxonomy_terms (type, label, segment) values
  ('attribute', 'Non-GM', 'specialty'),
  ('attribute', 'Non-GM Verified', 'specialty'),
  ('attribute', 'Certified Organic', 'specialty'),
  ('attribute', 'Heirloom / Heritage Variety', 'specialty'),
  ('attribute', 'Waxy (High-Amylopectin)', 'specialty'),
  ('attribute', 'High-Amylose', 'specialty'),
  ('attribute', 'High Beta-Glucan', 'specialty'),
  ('attribute', 'Low / High Glycemic Index (GI)', 'specialty'),
  ('attribute', 'High-Protein', 'specialty'),
  ('attribute', 'Low-Protein', 'specialty'),
  ('attribute', 'High-Lysine / High-Tryptophan', 'specialty'),
  ('attribute', 'High-Gluten Strength / High-Extensibility', 'specialty'),
  ('attribute', 'High-Oleic', 'specialty'),
  ('attribute', 'Low-Linolenic', 'specialty'),
  ('attribute', 'High Total Oil Content', 'specialty'),
  ('attribute', 'Clear / Clear-Hilum', 'specialty'),
  ('attribute', 'Seed Size Uniformity: Large', 'specialty'),
  ('attribute', 'Seed Size Uniformity: Small', 'specialty'),
  ('attribute', 'High Endosperm Hardness (Flint/Durum)', 'specialty'),
  ('attribute', 'Soft Endosperm', 'specialty'),
  ('attribute', 'High Popping/Puffing Expansion Volume', 'specialty'),
  ('attribute', 'Low-Lipoxygenase', 'specialty'),
  ('attribute', 'Malting Quality / High Diastatic Power', 'specialty'),
  ('attribute', 'Tannins: Low', 'specialty'),
  ('attribute', 'Tannins: High', 'specialty'),
  ('attribute', 'Pre-Harvest Sprouting Resistant', 'specialty')
on conflict (type, label) do update set segment = excluded.segment;
