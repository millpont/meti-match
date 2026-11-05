import { useEffect, useState } from "react";
import { api } from "../api";
import { useDashboardTab } from "../AppNavContext";
import { IconCircle } from "../ui";
import { ClipboardIcon, GavelIcon, GlobeIcon } from "../icons";
import type { Bid } from "../types";
import { fromAcres } from "../units";
import RequirementsForm from "./RequirementsForm";
import SupplySearch from "./SupplySearch";
import CreateRfqForm from "./CreateRfqForm";
import MyBidsTable from "./MyBidsTable";
import PendingApprovalBids from "./PendingApprovalBids";
import PendingRepresentationRequests from "./PendingRepresentationRequests";
import ResponsesPanel from "../listings/ResponsesPanel";
import ContractsTable from "../listings/ContractsTable";
import MyStatsRow from "../listings/MyStatsRow";
import ProfileEditor from "../profile/ProfileEditor";
import ProfileHomeCard from "../profile/ProfileHomeCard";
import ServiceProviderDirectory from "../services/ServiceProviderDirectory";
import MyServiceRequests from "../services/MyServiceRequests";

type Tab = "home" | "requirements" | "supply" | "bids" | "responses" | "contracts" | "services" | "profile";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "requirements", label: "Requirements" },
  { id: "supply", label: "Grower Listings" },
  { id: "bids", label: "My Listings" },
  { id: "responses", label: "Responses" },
  { id: "contracts", label: "Agreements" },
  { id: "services", label: "Service Providers" },
  { id: "profile", label: "Profile" },
];

export default function BuyerDashboard({ accountName }: { accountName?: string | null }) {
  const [tab, setTab] = useDashboardTab(TABS);
  const [showRfq, setShowRfq] = useState(false);
  const [rfqNotice, setRfqNotice] = useState<string | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);

  const refreshBids = () => api.myBids().then((r) => setBids(r.bids)).catch(() => setBids([]));
  useEffect(() => { refreshBids(); }, []);

  const listingsByUom = bids.filter((b) => b.status === "open").reduce<Record<string, number>>((acc, b) => {
    const isAcresBid = b.bid_type === "acres_for_contracting";
    const unit = isAcresBid ? (b.area_unit || "acres") : "MT";
    const quantity = isAcresBid && b.quantity != null ? fromAcres(b.quantity, b.area_unit || "acres") : b.quantity;
    if (quantity != null) acc[unit] = (acc[unit] || 0) + quantity;
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-brand-edge">
        {TABS.map((t) => (
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

      {tab === "home" && (
        <div>
          <h1 className="text-xl font-bold text-slate-900">Welcome back{accountName ? `, ${accountName}` : ""}</h1>
          <p className="mt-1 text-sm text-slate-600">Your gateway to grain supply.</p>
          <ProfileHomeCard onOpenProfile={() => setTab("profile")} />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <button onClick={() => setTab("requirements")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="gold"><ClipboardIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Establish your requirements</div>
              <div className="text-xs text-slate-600">Define the grain, volumes, attributes and practices you need.</div>
            </button>
            <button onClick={() => setTab("supply")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="green"><GlobeIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Explore existing offers</div>
              <div className="text-xs text-slate-600">Browse matching supply offers.</div>
            </button>
            <button onClick={() => setTab("bids")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="gold"><GavelIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Place a bid</div>
              <div className="text-xs text-slate-600">Bid for available grain, acres, or volumes.</div>
            </button>
          </div>
          <div className="mt-6">
            <MyStatsRow listingsByUom={listingsByUom} />
          </div>
        </div>
      )}

      {tab === "requirements" && <RequirementsForm />}
      {tab === "supply" && <SupplySearch />}
      {tab === "bids" && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-bold text-slate-900">My Listings</h1>
            <button className="btn-primary" onClick={() => setShowRfq((s) => !s)}>
              {showRfq ? "Close" : "+ Place New Bid"}
            </button>
          </div>
          {rfqNotice && <p className="mb-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{rfqNotice}</p>}
          <div className="card mb-6 p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Your Listings</h2>
            <MyBidsTable bids={bids} />
          </div>
          <div className="mb-6 space-y-6">
            <PendingRepresentationRequests />
            <PendingApprovalBids />
          </div>
          {showRfq && (
            <div className="mb-6">
              <CreateRfqForm onCreated={(n) => { setShowRfq(false); setRfqNotice(n ?? null); refreshBids(); }} />
            </div>
          )}
        </div>
      )}

      {tab === "responses" && <ResponsesPanel />}

      {tab === "contracts" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Agreements</h1>
          <ContractsTable />
        </div>
      )}

      {tab === "services" && (
        <div className="space-y-6">
          <h1 className="text-xl font-bold text-slate-900">Service Providers</h1>
          <MyServiceRequests />
          <ServiceProviderDirectory />
        </div>
      )}

      {tab === "profile" && <ProfileEditor />}
    </div>
  );
}
