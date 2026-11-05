import { useState } from "react";
import DashboardOverview from "./DashboardOverview";
import AccountsTable from "./AccountsTable";
import ListingsTable from "./ListingsTable";
import DisputesTable from "./DisputesTable";
import TaxonomyTable from "./TaxonomyTable";
import JoinRequestsTable from "./JoinRequestsTable";
import AttributeRequestsTable from "./AttributeRequestsTable";
import ContractsTable from "../listings/ContractsTable";

type Tab = "dashboard" | "accounts" | "listings" | "contracts" | "disputes" | "join_requests" | "attribute_requests" | "taxonomy";

const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "accounts", label: "Accounts" },
  { id: "listings", label: "Listings" },
  { id: "contracts", label: "Agreements" },
  { id: "disputes", label: "Disputes" },
  { id: "join_requests", label: "Join Requests" },
  { id: "attribute_requests", label: "Attribute Requests" },
  { id: "taxonomy", label: "Attributes & Practices" },
];

export default function AdminDashboard({ approvalEnabled }: { approvalEnabled?: boolean } = {}) {
  const [tab, setTab] = useState<Tab>("dashboard");

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

      {tab === "dashboard" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Marketplace Overview</h1>
          <DashboardOverview />
        </div>
      )}
      {tab === "accounts" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Accounts</h1>
          <AccountsTable approvalEnabled={approvalEnabled} />
        </div>
      )}
      {tab === "listings" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Listings</h1>
          <ListingsTable />
        </div>
      )}
      {tab === "contracts" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Agreements</h1>
          <ContractsTable showDisputeAction={false} />
        </div>
      )}
      {tab === "disputes" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Disputes</h1>
          <DisputesTable />
        </div>
      )}
      {tab === "join_requests" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Join Requests</h1>
          <JoinRequestsTable />
        </div>
      )}
      {tab === "attribute_requests" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Attribute Requests</h1>
          <AttributeRequestsTable />
        </div>
      )}
      {tab === "taxonomy" && (
        <div>
          <h1 className="mb-4 text-xl font-bold text-slate-900">Attributes & Practices</h1>
          <TaxonomyTable />
        </div>
      )}
    </div>
  );
}
