import { useEffect, useState } from "react";
import { api } from "../api";
import { useDashboardTab } from "../AppNavContext";
import { IconCircle } from "../ui";
import { ChartBarIcon, GavelIcon, WheatIcon } from "../icons";
import type { Offer } from "../types";
import OfferForm from "../listings/OfferForm";
import ListingComposer from "../listings/ListingComposer";
import MyOffersTable from "../listings/MyOffersTable";
import BidBrowseTable from "../listings/BidBrowseTable";
import ResponsesPanel from "../listings/ResponsesPanel";
import ContractsTable from "../listings/ContractsTable";
import ProductionData from "../listings/ProductionData";
import MyStatsRow from "../listings/MyStatsRow";
import ProgramAffiliation from "./ProgramAffiliation";
import PendingApprovalOffers from "./PendingApprovalOffers";
import GrainInventory from "./GrainInventory";
import ProfileEditor from "../profile/ProfileEditor";
import ProfileHomeCard from "../profile/ProfileHomeCard";
import ServiceProviderDirectory from "../services/ServiceProviderDirectory";
import MyServiceRequests from "../services/MyServiceRequests";

type Tab = "home" | "offers" | "inventory" | "bids" | "responses" | "contracts" | "production" | "program" | "services" | "profile";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "offers", label: "My Listings" },
  { id: "inventory", label: "Inventory" },
  { id: "bids", label: "Buyer Listings" },
  { id: "responses", label: "Responses" },
  { id: "contracts", label: "Agreements" },
  { id: "production", label: "Production Data" },
  { id: "program", label: "Program" },
  { id: "services", label: "Service Providers" },
  { id: "profile", label: "Profile" },
];

export default function GrowerDashboard({ accountName }: { accountName?: string | null }) {
  const [tab, setTab] = useDashboardTab(TABS);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [responseCount, setResponseCount] = useState(0);
  // Bumped whenever an offer is created or withdrawn in this tab session, so the co-mounted
  // GrainInventory card (which only fetches once on mount) knows to refetch its "Remaining"
  // figures instead of showing a stale pre-publish/pre-withdraw number.
  const [inventoryRefreshSignal, setInventoryRefreshSignal] = useState(0);

  const refreshOffers = () => {
    api.myOffers().then((r) => setOffers(r.offers)).catch(() => setOffers([]));
    setInventoryRefreshSignal((n) => n + 1);
  };
  useEffect(() => {
    refreshOffers();
    api.myResponses().then((r) => setResponseCount(r.made_by_me.length)).catch(() => {});
  }, []);

  const published = offers.filter((o) => o.status === "published");
  const listingsByUom = published.reduce<Record<string, number>>((acc, o) => {
    if (o.expected_volume != null) acc[o.uom] = (acc[o.uom] || 0) + o.expected_volume;
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
          <p className="mt-1 text-sm text-slate-600">Manage your grain, bids, and production data all in one place.</p>
          <ProfileHomeCard onOpenProfile={() => setTab("profile")} />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <button onClick={() => setTab("offers")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="green"><WheatIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Offer your grain</div>
              <div className="text-xs text-slate-600">List your available grain and set your terms.</div>
            </button>
            <button onClick={() => setTab("bids")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="gold"><GavelIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Explore open bids</div>
              <div className="text-xs text-slate-600">View bids from buyers and find the right fit.</div>
            </button>
            <button onClick={() => setTab("offers")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="green"><ChartBarIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">My Listings Overview</div>
              <div className="mt-1 flex gap-6 text-sm">
                <div><div className="text-lg font-bold text-slate-900">{published.length}</div><div className="text-xs text-slate-500">Published offers</div></div>
                <div><div className="text-lg font-bold text-slate-900">{responseCount}</div><div className="text-xs text-slate-500">Bids responded to</div></div>
              </div>
            </button>
          </div>
          <div className="mt-6">
            <MyStatsRow listingsByUom={listingsByUom} />
          </div>
        </div>
      )}

      {tab === "offers" && (
        <div className="space-y-6">
          <GrainInventory refreshSignal={inventoryRefreshSignal} />
          <PendingApprovalOffers />
          <div className="card p-5">
            <h2 className="text-base font-semibold text-slate-900">Your Listings</h2>
            <MyOffersTable offers={offers} onChanged={() => setInventoryRefreshSignal((n) => n + 1)} />
          </div>
          <ListingComposer side="offer" grainForm={<OfferForm onCreated={refreshOffers} />} onCreated={refreshOffers} />
        </div>
      )}

      {tab === "inventory" && <GrainInventory />}

      {tab === "bids" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Browse Buyer Listings</h1>
          <BidBrowseTable />
        </div>
      )}

      {tab === "responses" && <ResponsesPanel />}

      {tab === "contracts" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Agreements</h1>
          <ContractsTable />
        </div>
      )}

      {tab === "production" && <ProductionData />}

      {tab === "program" && <ProgramAffiliation />}

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
