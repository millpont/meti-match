import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, authUrl } from "./api";
import type { Me } from "./types";
import { Spinner } from "./ui";
import metiLogo from "./assets/meti-logo.png";
import Onboarding from "./onboarding/Onboarding";
import Home from "./components/Home";
import GrowerDashboard from "./grower/GrowerDashboard";
import BuyerDashboard from "./buyer/BuyerDashboard";
import OperatorDashboard from "./operator/OperatorDashboard";
import ServiceProviderDashboard from "./service_provider/ServiceProviderDashboard";
import MarketplaceHub from "./marketplace/MarketplaceHub";
import AdminDashboard from "./admin/AdminDashboard";
import NotificationBell from "./NotificationBell";
import RoleSwitcher from "./RoleSwitcher";
import CompanyAdminBell from "./CompanyAdminBell";
import { ProfilePageProvider, useProfilePage } from "./profile/ProfilePageContext";
import PublicProfilePage from "./profile/PublicProfilePage";
import AccountDocumentsPanel from "./profile/AccountDocumentsPanel";
import DirectoryPage from "./directory/DirectoryPage";
import { AppNavProvider, ME_CHANGED_EVENT, useAppNav } from "./AppNavContext";
import { VerificationProvider } from "./profile/VerificationPrompt";

/** Top-level navigation. There's no router in this app — this state picks what `main` renders
 * (see ProfilePageContext for the other axis, which hijacks it to show a profile page). */
type TopNav = "dashboard" | "marketplace" | "directory";

const PENDING_POLL_MS = 8_000;

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [topNav, setTopNav] = useState<TopNav>("dashboard");
  // Set when the Directory deep-links into the Marketplace filtered to one organization.
  const [marketplaceOrganization, setMarketplaceOrganization] = useState<string | null>(null);

  const refetchMe = useCallback(() => api.me().then(setMe).catch(() => setMe({ authenticated: false })), []);
  useEffect(() => { refetchMe(); }, []);
  useEffect(() => {
    window.addEventListener(ME_CHANGED_EVENT, refetchMe);
    return () => window.removeEventListener(ME_CHANGED_EVENT, refetchMe);
  }, [refetchMe]);

  const awaitingApproval = !!me?.account_approval_required && me?.approval_status === "pending";
  // Poll while waiting so a superadmin's approval lands without the user re-logging in — same
  // approach Onboarding uses for company join requests.
  useEffect(() => {
    if (!awaitingApproval) return;
    const t = setInterval(refetchMe, PENDING_POLL_MS);
    return () => clearInterval(t);
  }, [awaitingApproval]);

  if (!me) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!me.authenticated) return <Landing />;
  if (me.db_unavailable) return <ServiceDown />;
  if (me.frozen) return <Suspended reason={me.frozen_reason} />;
  // Dormant unless a superadmin has turned approval on (config.ACCOUNT_APPROVAL_REQUIRED, off by
  // default) — with the flag off approval_status is always "approved" and this never renders.
  if (me.account_approval_required && me.approval_status === "pending") {
    return <PendingApproval note={me.approval_note} />;
  }
  if (me.account_approval_required && me.approval_status === "declined") {
    return <ApprovalDeclined note={me.approval_note} />;
  }

  const openOrganizationListings = (accountId: string) => {
    setMarketplaceOrganization(accountId);
    setTopNav("marketplace");
  };

  return (
    <ProfilePageProvider>
      <DashboardNav onShowDashboard={() => { setTopNav("dashboard"); setMarketplaceOrganization(null); }}>
        <VerificationProvider verified={me.business_verified !== false} onChanged={refetchMe}>
          <AuthenticatedApp
            me={me}
            refetchMe={refetchMe}
            topNav={topNav}
            setTopNav={(next) => { setTopNav(next); if (next !== "marketplace") setMarketplaceOrganization(null); }}
            marketplaceOrganization={marketplaceOrganization}
            onViewOrganizationListings={openOrganizationListings}
          />
        </VerificationProvider>
      </DashboardNav>
    </ProfilePageProvider>
  );
}

/** Bridges AppNavProvider to the two things that can hide the dashboard: the top-nav selection
 * and an open profile page. Lives inside ProfilePageProvider so it can close the latter. */
function DashboardNav({ onShowDashboard, children }: { onShowDashboard: () => void; children: ReactNode }) {
  const { closeProfile } = useProfilePage();
  // Stable identity so AppNavProvider's goToDashboardTab (and anything memoized on it) doesn't
  // churn every render; the latest callbacks are read through the closure at call time.
  const onLeaveToDashboard = useCallback(() => { closeProfile(); onShowDashboard(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [closeProfile]);
  return <AppNavProvider onLeaveToDashboard={onLeaveToDashboard}>{children}</AppNavProvider>;
}

function AuthenticatedApp({
  me, refetchMe, topNav, setTopNav, marketplaceOrganization, onViewOrganizationListings,
}: {
  me: Me;
  refetchMe: () => void;
  topNav: TopNav;
  setTopNav: (next: TopNav) => void;
  marketplaceOrganization: string | null;
  onViewOrganizationListings: (accountId: string) => void;
}) {
  const { viewingAccountId, closeProfile } = useProfilePage();
  const { dashboardTab, goToDashboardTab } = useAppNav();
  // Shown across the dashboard (not just at the moment a publish is refused) so an unverified
  // account always knows its listings aren't reaching anyone. Hidden on the Profile tab itself,
  // where the verification section is right there.
  // A Service Provider who isn't a Trader only does technical services — no listing boards.
  const servicesOnly = me.role === "service_provider" && !me.is_trader && !me.is_superadmin;
  const showUnverifiedBanner = !!me.role && !me.is_superadmin && me.business_verified === false
    && !viewingAccountId && topNav === "dashboard" && dashboardTab !== "profile";

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-brand-green">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img
              src={metiLogo}
              alt="METI"
              className="h-10 w-auto shrink-0 brightness-0 invert"
            />
            <div className="hidden h-9 w-px bg-white/20 sm:block" />
            <div className="hidden sm:block">
              <div className="text-sm font-bold tracking-tight text-white">METI Match</div>
              <div className="text-[11px] text-white/70">by Millpont</div>
            </div>
            {me.role && (
              <div className="ml-2 flex items-center gap-1">
                {([
                  { id: "dashboard" as TopNav, label: me.is_superadmin ? "Admin" : "My Dashboard" },
                  { id: "marketplace" as TopNav, label: "Marketplace" },
                  { id: "directory" as TopNav, label: "Directory" },
                ]).filter((item) => !(servicesOnly && item.id === "marketplace")).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    // Also close any open profile page — it hijacks `main` regardless of topNav, so
                    // without this the nav looked dead while a profile was showing.
                    onClick={() => { closeProfile(); setTopNav(item.id); }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      topNav === item.id ? "bg-white text-brand-green" : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium text-white">
                {me.display_name || me.profile?.name || me.profile?.email}
              </div>
              {me.account_name && (
                <div className="text-[11px] text-white/70">{me.account_name}</div>
              )}
            </div>
            {me.is_superadmin && (
              <span className="chip bg-white/15 text-white">Admin</span>
            )}
            {me.role && !me.is_superadmin && me.role_switching_enabled && <RoleSwitcher me={me} onChanged={refetchMe} />}
            {me.role && me.is_company_admin && !me.is_superadmin && <CompanyAdminBell />}
            {me.role && <NotificationBell role={me.role} />}
            <a
              href={authUrl("logout")}
              className="inline-flex items-center rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
            >
              Log out
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {showUnverifiedBanner && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>
              {servicesOnly ? (
                <>
                  <span className="font-semibold">Complete business verification to accept service requests.</span>{" "}
                  Add a business identifier and one company document in My Profile.
                </>
              ) : (
                <>
                  <span className="font-semibold">Your listings won't be visible until you complete business verification.</span>{" "}
                  You can save drafts in the meantime — add a business identifier and one company document to publish or respond to listings.
                </>
              )}
            </span>
            <button type="button" className="btn-primary shrink-0 !px-3 !py-1.5 text-xs" onClick={() => goToDashboardTab("profile")}>
              Go to My Profile
            </button>
          </div>
        )}
        {viewingAccountId ? (
          <PublicProfilePage accountId={viewingAccountId} onBack={closeProfile} />
        ) : !me.role ? (
          <Onboarding
            onDone={refetchMe}
            defaultEmail={me.profile?.email}
            emailVerified={me.profile?.email_verified}
            pendingJoinRequest={me.pending_join_request}
            claimableAccount={me.claimable_account}
          />
        ) : topNav === "directory" ? (
          <DirectoryPage onViewOrganizationListings={servicesOnly ? undefined : onViewOrganizationListings} />
        ) : topNav === "marketplace" && !servicesOnly ? (
          <MarketplaceHub initialOrganization={marketplaceOrganization} />
        ) : me.is_superadmin ? (
          // Checked before role-specific dashboards: the SUPERADMIN_ACCOUNT_ID bootstrap grants
          // admin access on top of whatever role that account already has (see auth.py). Checked
          // AFTER the nav branches above so a superadmin can still reach the Marketplace and
          // Directory — previously this short-circuited before either was reachable.
          <AdminDashboard approvalEnabled={me.account_approval_required} />
        ) : me.role === "grower" ? (
          <GrowerDashboard accountName={me.account_name} />
        ) : me.role === "international_buyer" ? (
          <BuyerDashboard accountName={me.account_name} />
        ) : me.role === "program_operator" ? (
          <OperatorDashboard accountName={me.account_name} />
        ) : me.role === "service_provider" ? (
          <ServiceProviderDashboard accountName={me.account_name} isTrader={!!me.is_trader} />
        ) : (
          <Home role={me.role} accountName={me.account_name} />
        )}
      </main>
    </div>
  );
}

function Landing() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 bg-brand-green px-6 text-center">
      <img src={metiLogo} alt="METI" className="h-16 w-auto max-w-[80vw] brightness-0 invert" />
      <div>
        <h1 className="text-2xl font-bold text-white">METI Match</h1>
        <p className="mt-2 max-w-lg text-white/70">
          A METI marketplace by Millpont connecting growers, program
          operators, and international buyers around attribute-specific corn, sorghum, and barley —
          from supply signals to facilitated introductions.
        </p>
      </div>
      <a href={authUrl("login")} className="btn bg-brand-gold text-white hover:brightness-95 px-6 py-2.5">
        Log in to continue
      </a>
    </div>
  );
}

/** Shown while a newly-registered account waits for superadmin approval. Only reachable when
 * config.ACCOUNT_APPROVAL_REQUIRED is on (off by default). Offers the company-documentation
 * uploader, since attaching it is what gets an account approved faster — that endpoint is
 * deliberately reachable while pending (see backend auth.py). */
function PendingApproval({ note }: { note?: string | null }) {
  return (
    <div className="mx-auto max-w-lg px-6 py-12 text-center">
      <h1 className="text-xl font-bold text-slate-900">Account pending approval</h1>
      <p className="mt-2 text-slate-600">
        Your registration is with a marketplace administrator for review. You'll get access as soon
        as it's approved — this page updates on its own, no need to log back in.
      </p>
      {note && (
        <p className="mt-3 rounded-lg bg-brand-bg px-4 py-2 text-sm text-slate-600">
          <span className="font-medium">Note: </span>{note}
        </p>
      )}
      <div className="mt-6 text-left">
        <div className="card p-5">
          <AccountDocumentsPanel />
        </div>
      </div>
      <a href={authUrl("logout")} className="btn-ghost mt-4 text-xs">Log out</a>
    </div>
  );
}

function ApprovalDeclined({ note }: { note?: string | null }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold text-slate-900">Registration declined</h1>
      <p className="max-w-md text-slate-600">
        A marketplace administrator declined this registration. Contact support if you believe this
        is a mistake.
      </p>
      {note && (
        <p className="max-w-md rounded-lg bg-brand-bg px-4 py-2 text-sm text-slate-600">
          <span className="font-medium">Reason: </span>{note}
        </p>
      )}
      <a href={authUrl("logout")} className="btn-ghost mt-1 text-xs">Log out</a>
    </div>
  );
}

function Suspended({ reason }: { reason?: string | null }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold text-slate-900">Account suspended</h1>
      <p className="max-w-md text-slate-600">
        Your account has been suspended by a marketplace administrator. Contact support if you
        believe this is a mistake.
      </p>
      {reason && (
        <p className="max-w-md rounded-lg bg-brand-bg px-4 py-2 text-sm text-slate-600">
          <span className="font-medium">Reason: </span>{reason}
        </p>
      )}
      <a href={authUrl("logout")} className="btn-ghost mt-1 text-xs">Log out</a>
    </div>
  );
}

function ServiceDown() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-bold text-slate-900">Can’t reach the service</h1>
      <p className="max-w-md text-slate-600">
        You’re signed in, but the server can’t reach the database right now. This is a temporary
        configuration issue, not your account. Try again in a moment.
      </p>
      <button className="btn-primary mt-2" onClick={() => window.location.reload()}>Retry</button>
      <a href={authUrl("logout")} className="btn-ghost mt-1 text-xs">Log out</a>
    </div>
  );
}
