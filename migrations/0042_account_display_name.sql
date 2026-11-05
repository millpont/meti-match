-- The top-right header name is sourced from the Auth0 login's userinfo.name, cached on the
-- session at login, and never re-synced -- editing bio/contact fields via PUT /api/profile has
-- no effect on it (confirmed: EDITABLE_FIELDS in profile_routes.py never included a name field).
-- This gives every account an explicit, user-editable display name the header can prefer instead.
alter table accounts add column if not exists display_name text;
