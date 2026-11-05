import { useEffect, useState } from "react";
import { api } from "../api";
import { useDashboardTab } from "../AppNavContext";
import { IconCircle } from "../ui";
import { ChartBarIcon, UsersIcon, WheatIcon } from "../icons";
import type { Enrollment, Offer } from "../types";
import { formatNumber } from "../format";
import RegisterGrowerForm from "./RegisterGrowerForm";
import InviteGrowerCard from "./InviteGrowerCard";
import GrowersTable from "./GrowersTable";
import OfferForm from "../listings/OfferForm";
import MyOffersTable from "../listings/MyOffersTable";
import BidBrowseTable from "../listings/BidBrowseTable";
import ResponsesPanel from "../listings/ResponsesPanel";
import ContractsTable from "../listings/ContractsTable";
import ProductionData from "../listings/ProductionData";
import MyStatsRow from "../listings/MyStatsRow";
import GrainInventory from "../grower/GrainInventory";
import GrowersInventoryRollup from "./GrowersInventoryRollup";
import ProfileEditor from "../profile/ProfileEditor";
import ProfileHomeCard from "../profile/ProfileHomeCard";
import ServiceProviderDirectory from "../services/ServiceProviderDirectory";
import MyServiceRequests from "../services/MyServiceRequests";

type Tab = "home" | "growers" | "offers" | "inventory" | "bids" | "responses" | "contracts" | "production" | "services" | "profile";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "My Program" },
  { id: "growers", label: "Enrolled Growers" },
  { id: "offers", label: "My Listings" },
  { id: "inventory", label: "Inventory" },
  { id: "bids", label: "Buyer Listings" },
  { id: "responses", label: "Responses" },
  { id: "contracts", label: "Agreements" },
  { id: "production", label: "Production Data" },
  { id: "services", label: "Service Providers" },
  { id: "profile", label: "Profile" },
];

export default function OperatorDashboard({ accountName }: { accountName?: string | null }) {
  const [tab, setTab] = useDashboardTab(TABS);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [programPublishedOffers, setProgramPublishedOffers] = useState(0);
  const [offers, setOffers] = useState<Offer[]>([]);
  // Confirmation for the last enrollment action (invite sent, grower registered, request
  // approved…) — previously these all happened silently.
  const [enrollmentNotice, setEnrollmentNotice] = useState<string | null>(null);

  const refreshEnrollments = () => api.myEnrollments().then((r) => {
    setEnrollments(r.enrollments);
    setProgramPublishedOffers(r.program_rollup.published_offers_count);
  }).catch(() => setEnrollments([]));
  const refreshOffers = () => api.myOffers().then((r) => setOffers(r.offers)).catch(() => setOffers([]));

  useEffect(() => {
    refreshEnrollments();
    refreshOffers();
  }, []);

  const activeGrowers = enrollments.filter((e) => e.status === "active");
  const totalAcres = enrollments.reduce((sum, e) => sum + (e.acres_enrolled ?? 0), 0);
  const listingsByUom = offers.filter((o) => o.status === "published").reduce<Record<string, number>>((acc, o) => {
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
          <p className="mt-1 text-sm text-slate-600">Manage your enrolled growers and offer grain on their behalf.</p>
          <ProfileHomeCard onOpenProfile={() => setTab("profile")} />
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <button onClick={() => setTab("growers")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="gold"><UsersIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Enroll a grower</div>
              <div className="text-xs text-slate-600">Add a grower to your program.</div>
            </button>
            <button onClick={() => setTab("offers")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="green"><WheatIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Offer aggregated grain</div>
              <div className="text-xs text-slate-600">List grain from your program or your own production.</div>
            </button>
            <button onClick={() => setTab("growers")} className="card flex flex-col items-start gap-2 p-5 text-left transition-colors hover:border-brand-green">
              <IconCircle tone="green"><ChartBarIcon /></IconCircle>
              <div className="text-sm font-semibold text-slate-900">Program Overview</div>
              <div className="mt-1 flex gap-6 text-sm">
                <div><div className="text-lg font-bold text-slate-900">{activeGrowers.length}</div><div className="text-xs text-slate-500">Active growers</div></div>
                <div><div className="text-lg font-bold text-slate-900">{formatNumber(totalAcres)}</div><div className="text-xs text-slate-500">Acres enrolled</div></div>
                <div><div className="text-lg font-bold text-slate-900">{programPublishedOffers}</div><div className="text-xs text-slate-500">Published offers</div></div>
              </div>
              <div className="mt-1 text-[11px] text-slate-400">Includes your active growers' own offers</div>
            </button>
          </div>
          <div className="mt-6">
            <MyStatsRow
              note="Includes your active enrolled growers' contracts, last 30 days vs. the prior 30-day window."
              listingsByUom={listingsByUom}
            />
          </div>
        </div>
      )}

      {tab === "growers" && (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Grower Enrollment</h1>
            <p className="mt-1 text-sm text-slate-600">
              Bring growers into your program here. Once they're enrolled, create listings for them — or
              aggregate several — from the My Listings tab.
            </p>
          </div>
          {enrollmentNotice && (
            <div className="flex items-start justify-between gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <span>{enrollmentNotice}</span>
              <button type="button" className="shrink-0 text-xs font-medium hover:underline" onClick={() => setEnrollmentNotice(null)}>Dismiss</button>
            </div>
          )}
          <div className="card p-5">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Enrolled Growers</h2>
            <GrowersTable enrollments={enrollments} onChanged={refreshEnrollments} onNotice={setEnrollmentNotice} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <InviteGrowerCard onInvited={(n) => { setEnrollmentNotice(n); refreshEnrollments(); }} />
            <RegisterGrowerForm onCreated={(n) => { setEnrollmentNotice(n); refreshEnrollments(); }} />
          </div>
        </div>
      )}

      {tab === "offers" && (
        <div className="space-y-6">
          <OfferForm onCreated={refreshOffers} forOperator />
          <div className="card p-5">
            <h2 className="text-base font-semibold text-slate-900">Your Listings</h2>
            <MyOffersTable offers={offers} />
          </div>
        </div>
      )}

      {tab === "inventory" && (
        <div className="space-y-6">
          <GrainInventory />
          <GrowersInventoryRollup />
        </div>
      )}

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

      {tab === "production" && <ProductionData forOperator />}

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
