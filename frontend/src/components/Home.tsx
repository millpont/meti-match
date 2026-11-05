import type { AccountRole } from "../types";

// Placeholder landing for an onboarded account. Replaced role-by-role as
// plans/meti-match/05-roadmap.md's phases land (grower/operator/buyer dashboards, then
// admin analytics) — this just confirms onboarding worked and what's coming next.
const COPY: Record<AccountRole, { title: string; next: string }> = {
  grower: { title: "Welcome, Grower", next: "Your grain offers, bids, and production data dashboard is coming in Phase 2." },
  program_operator: { title: "Welcome, Program Operator", next: "Enrolled-grower management and aggregated offers are coming in Phase 4." },
  international_buyer: { title: "Welcome, Buyer", next: "Supply search, bids, and agreements are coming in Phase 3." },
  service_provider: { title: "Welcome, Service Provider", next: "This role's dashboard hasn't been scoped yet." },
  admin: { title: "Welcome, Admin", next: "The marketplace analytics dashboard is coming in Phase 7." },
};

export default function Home({ role, accountName }: { role: AccountRole; accountName?: string | null }) {
  const copy = COPY[role];
  return (
    <div className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-xl font-bold text-slate-900">{copy.title}{accountName ? ` — ${accountName}` : ""}</h1>
      <p className="mt-2 text-sm text-slate-600">{copy.next}</p>
    </div>
  );
}
