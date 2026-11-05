import { useEffect, useState } from "react";
import { api } from "../api";
import { useDashboardTab } from "../AppNavContext";
import { IconCircle } from "../ui";
import { ChartBarIcon, ClipboardIcon, GavelIcon, UsersIcon } from "../icons";
import type { Bid } from "../types";
import { fromAcres } from "../units";
import MyRepresentations from "./MyRepresentations";
import CreateRfqForm from "../buyer/CreateRfqForm";
import MyBidsTable from "../buyer/MyBidsTable";
import ResponsesPanel from "../listings/ResponsesPanel";
import ContractsTable from "../listings/ContractsTable";
import MyStatsRow from "../listings/MyStatsRow";
import ProfileEditor from "../profile/ProfileEditor";
import ProfileHomeCard from "../profile/ProfileHomeCard";
import PendingServiceRequests from "./PendingServiceRequests";
import { bidUnit } from "../listings/environmental";

type Tab = "home" | "buyers" | "bids" | "responses" | "contracts" | "service_requests" | "profile";

const TRADER_TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "buyers", label: "Buyers" },
  { id: "bids", label: "My Listings" },
  { id: "responses", label: "Responses" },
  { id: "contracts", label: "Agreements" },
  { id: "service_requests", label: "Service Requests" },
  { id: "profile", label: "Profile" },
];

// A Service Provider who isn't a Trader only does technical services — no bids, listings,
// responses, agreements or contract volume.
const SERVICES_TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "service_requests", label: "Service Requests" },
  { id: "profile", label: "Profile" },
];

/** A Service Provider. By default a technical-services provider (service requests only). One who
 * has opted in as a Trader also contracts (bids) on behalf of represented international buyers,
 * with their approval, and manages the execution of those buyers' agreements. See
 * representations_routes.py / bids_routes.py's on_behalf_of_buyer_account_id. */
export default function ServiceProviderDashboard({ accountName, isTrader }: { accountName?: string | null; isTrader: boolean }) {
  const tabs = isTrader ? TRADER_TABS : SERVICES_TABS;
  const [tab, setTab] = useDashboardTab(tabs);
  const [pendingRequestCount, setPendingRequestCount] = useState<number | null>(null);
  const [showRfq, setShowRfq] = useState(false);
  const [bids, setBids] = useState<Bid[]>([]);
  const [buyerCount, setBuyerCount] = useState(0);

  const refreshBids = () => api.myBids().then((r) => setBids(r.bids)).catch(() => setBids([]));
  const refreshRepresentations = () =>
    api.myRepresentations().then((r) => setBuyerCount(r.representations.filter((x) => x.status === "active").length)).catch(() => {});

  useEffect(() => {
    if (isTrader) {
      refreshBids();
      refreshRepresentations();
    } else {
      api.pendingServiceRequests("pending").then((r) => setPendingRequestCount(r.requests.length)).catch(() => setPendingRequestCount(0));
    }
  }, [isTrader]);

  const listingsByUom = bids.filter((b) => b.status === "open").reduce<Record<string, number>>((acc, b) => {
    const isAcresBid = b.bid_type === "acres_for_contracting";
    const unit = bidUnit(b);
    const quantity = isAcresBid && b.quantity != null ? fromAcres(b.quantity, b.area_unit || "acres") : b.quantity;
    if (quantity != null) acc[unit] = (acc[unit] || 0) + quantity;
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-brand-edge">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id ? "text-brand-green" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-green" />}
          </button>
        ))}
      </div>

      {tab === "home" && !isTrader && (
        <div>
          <h1 className="text-xl font-bold text-slate-900">Welcome back{accountName ? `, ${accountName}` : ""}</h1>
          <p className="mt-1 text-sm text-slate-600">Respond to service requests from growers, operators and buyers.</p>
          <ProfileHomeCard onOpenProfile={() => setTab("profile")} />
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <button onClick={() => setTab("service_requests")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="green"><ClipboardIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Service requests</div>
              <div className="text-xs text-slate-600">
                {pendingRequestCount == null ? "Loading…" : pendingRequestCount === 0
                  ? "No requests waiting on you."
                  : `${pendingRequestCount} waiting for your response.`}
              </div>
            </button>
            <button onClick={() => setTab("profile")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="gold"><UsersIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Your services</div>
              <div className="text-xs text-slate-600">Set the services you offer and the states you cover so the right people find you.</div>
            </button>
          </div>
        </div>
      )}

      {tab === "home" && isTrader && (
        <div>
          <h1 className="text-xl font-bold text-slate-900">Welcome back{accountName ? `, ${accountName}` : ""}</h1>
          <p className="mt-1 text-sm text-slate-600">Contract on behalf of the buyers you represent, and manage their agreements.</p>
          <ProfileHomeCard onOpenProfile={() => setTab("profile")} />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <button onClick={() => setTab("buyers")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="gold"><UsersIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Represent a buyer</div>
              <div className="text-xs text-slate-600">Request to represent an international buyer.</div>
            </button>
            <button onClick={() => setTab("bids")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="green"><GavelIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Place a bid</div>
              <div className="text-xs text-slate-600">Contract on behalf of a represented buyer, with their approval.</div>
            </button>
            <button onClick={() => setTab("bids")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="green"><ChartBarIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Overview</div>
              <div className="mt-1 flex gap-6 text-sm">
                <div><div className="text-lg font-bold text-slate-900">{buyerCount}</div><div className="text-xs text-slate-500">Represented buyers</div></div>
                <div><div className="text-lg font-bold text-slate-900">{bids.length}</div><div className="text-xs text-slate-500">Bids placed</div></div>
              </div>
            </button>
          </div>
          <div className="mt-6">
            <MyStatsRow
              note="Your represented buyers' agreements, last 30 days vs. the prior 30-day window."
              listingsByUom={listingsByUom}
            />
          </div>
        </div>
      )}

      {tab === "buyers" && <MyRepresentations />}

      {tab === "bids" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-slate-900">My Listings</h1>
            <button className="btn-primary" onClick={() => setShowRfq((s) => !s)}>
              {showRfq ? "Close" : "+ Place New Bid"}
            </button>
          </div>
          {showRfq && (
            <div className="mb-6">
              <CreateRfqForm forServiceProvider onCreated={() => { setShowRfq(false); refreshBids(); }} />
            </div>
          )}
          <div className="card mb-6 p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Your Bids</h2>
            <MyBidsTable bids={bids} />
          </div>
        </div>
      )}

      {tab === "responses" && <ResponsesPanel />}

      {tab === "contracts" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Agreements</h1>
          <ContractsTable />
        </div>
      )}

      {tab === "service_requests" && <PendingServiceRequests />}

      {tab === "profile" && <ProfileEditor />}
    </div>
  );
}
