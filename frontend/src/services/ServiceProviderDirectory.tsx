import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, EmptyState, MultiSelectDropdown, Spinner } from "../ui";
import { US_STATES } from "../constants";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import ProfileLink from "../profile/ProfileLink";
import type { ServiceProviderListing } from "../types";
import RequestServiceModal from "./RequestServiceModal";

/** Browse Service Providers and request a service from one. Available to Grower/Buyer/Operator
 * dashboards (see service_requests_routes.py's REQUESTER_ROLES). */
export default function ServiceProviderDirectory() {
  const [serviceCategories, setServiceCategories] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [providers, setProviders] = useState<ServiceProviderListing[] | null>(null);
  const [requestedTo, setRequestedTo] = useState<Set<string>>(new Set());
  const [requestingProvider, setRequestingProvider] = useState<ServiceProviderListing | null>(null);
  const categories = useTaxonomyTerms("service_category");

  const search = () => {
    api.serviceProviders({ serviceCategories, states }).then((r) => setProviders(r.providers)).catch(() => setProviders([]));
  };

  const hasFilters = serviceCategories.length > 0 || states.length > 0;

  const clearFilters = () => {
    setServiceCategories([]);
    setStates([]);
    api.serviceProviders({}).then((r) => setProviders(r.providers)).catch(() => setProviders([]));
  };

  useEffect(() => {
    search();
    api.myServiceRequests()
      .then((r) => setRequestedTo(new Set(r.requests.filter((x) => x.status !== "declined").map((x) => x.service_provider_account_id))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirmRequest = () => {
    if (!requestingProvider) return;
    setRequestedTo((s) => new Set(s).add(requestingProvider.account_id));
    setRequestingProvider(null);
  };

  return (
    <div>
      <div className="card mb-4 p-4">
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
          <MultiSelectDropdown label="Service" options={categories.labels} titles={categories.titles} selected={serviceCategories} onChange={setServiceCategories} />
          <MultiSelectDropdown label="State" options={US_STATES} selected={states} onChange={setStates} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button className="btn-primary" onClick={search}>Apply Filters</button>
          {hasFilters && <button className="btn-ghost" onClick={clearFilters}>Clear Filters</button>}
        </div>
      </div>

      {!providers ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : providers.length === 0 ? (
        <EmptyState title="No matching service providers" hint="Try adjusting your filters, or check back soon." />
      ) : (
        <div className="space-y-3">
          {providers.map((p) => {
            const requested = requestedTo.has(p.account_id);
            return (
              <div key={p.account_id} className="card flex flex-wrap items-start gap-4 p-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-brand-bg">
                  {p.photo_url && <img src={p.photo_url} alt={p.name} className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-[200px] flex-1">
                  <div className="font-semibold text-slate-900">{p.name}</div>
                  {p.bio && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{p.bio}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {p.services_offered.map((s) => <Badge key={s} tone="blue" title={categories.titles[s]}>{s}</Badge>)}
                    {p.states_covered.length > 0 && <Badge tone="slate">{p.states_covered.join(", ")}</Badge>}
                  </div>
                  <div className="mt-2">
                    <ProfileLink accountId={p.account_id} name={p.name} />
                  </div>
                </div>
                <div className="min-w-[110px] text-xs">
                  <div className="text-slate-500">Completed</div>
                  <div className="text-sm text-slate-800">{p.reputation.completed_contracts} agreements</div>
                  {p.reputation.on_time_rate != null && (
                    <div className="mt-1 text-slate-500">{Math.round(p.reputation.on_time_rate * 100)}% on time</div>
                  )}
                </div>
                <div className="flex items-center self-center">
                  <button
                    type="button"
                    className="btn shrink-0 bg-brand-gold text-white hover:brightness-95"
                    disabled={requested}
                    onClick={() => setRequestingProvider(p)}
                  >
                    {requested ? "Requested" : "Request Service"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {requestingProvider && (
        <RequestServiceModal
          provider={requestingProvider}
          onSent={confirmRequest}
          onCancel={() => setRequestingProvider(null)}
        />
      )}
    </div>
  );
}
