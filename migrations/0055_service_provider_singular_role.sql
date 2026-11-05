-- Service Provider becomes a singular role: registered on its own account, never toggled into
-- from another account (see onboarding_routes.py's ADDABLE_ROLES and switch_role's deny).
--
-- Why: a SECONDARY service_provider role was only ever half-supported. The provider directory
-- (service_requests_routes.py's browse_service_providers) and the "request a service" validation
-- both resolve providers by `accounts.role` — the account's PRIMARY role — so an account holding
-- SP as a secondary role could never actually be found or hired as a provider. The same
-- primary-vs-session role split made the Profile page show the standard profile instead of the
-- Service Provider one when such an account switched in (the reported bug).
--
-- Strips the secondary role from the two accounts that hold it ("Suarez Specialty Grains",
-- primary grower; "Oliver's Grains", primary program_operator). Their service_provider_profiles
-- row is deliberately LEFT IN PLACE — it's inert without the role, and deleting it would throw
-- away data for no benefit. To operate as a service provider, register a separate account.
delete from account_roles
where role = 'service_provider'
  and account_id in (select id from accounts where role <> 'service_provider');
