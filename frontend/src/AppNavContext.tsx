import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/** Dispatched on window when something changes what /api/me reports (e.g. a Service Provider
 * toggling Trader in Profile) — App refetches me so dashboards and nav update immediately. */
export const ME_CHANGED_EVENT = "grains:me-changed";

/** Something a navigation can ask the destination tab to bring into view once it renders —
 * e.g. a notification about a response opens that response's thread, not just the tab. */
export type NavFocus = { kind: "response"; id: string };

interface AppNavValue {
  /** The active role dashboard's tab id. Lifted here (rather than each dashboard's own state)
   * so anything — the notification bell, a "go to Agreements" button, the verification popup —
   * can switch tabs without prop-drilling through the dashboard. */
  dashboardTab: string;
  setDashboardTab: (tab: string) => void;
  /** Leave whatever's showing (Marketplace, Directory, a profile page) and open a dashboard tab. */
  goToDashboardTab: (tab: string, focus?: NavFocus) => void;
  focus: NavFocus | null;
  clearFocus: () => void;
}

const AppNavContext = createContext<AppNavValue | null>(null);

export function AppNavProvider({ onLeaveToDashboard, children }: {
  /** Called on every goToDashboardTab — App uses it to select the dashboard top-nav item and
   * close any open profile page, both of which otherwise hide the dashboard entirely. */
  onLeaveToDashboard: () => void;
  children: ReactNode;
}) {
  const [dashboardTab, setDashboardTab] = useState("home");
  const [focus, setFocus] = useState<NavFocus | null>(null);
  const goToDashboardTab = useCallback((tab: string, nextFocus?: NavFocus) => {
    onLeaveToDashboard();
    setDashboardTab(tab);
    setFocus(nextFocus ?? null);
  }, [onLeaveToDashboard]);
  const value = useMemo(() => ({
    dashboardTab, setDashboardTab, goToDashboardTab, focus, clearFocus: () => setFocus(null),
  }), [dashboardTab, goToDashboardTab, focus]);
  return <AppNavContext.Provider value={value}>{children}</AppNavContext.Provider>;
}

export function useAppNav(): AppNavValue {
  const ctx = useContext(AppNavContext);
  if (!ctx) throw new Error("useAppNav must be used within an AppNavProvider");
  return ctx;
}

/** A dashboard's [tab, setTab], backed by the app-wide nav state. A tab id this dashboard doesn't
 * have (e.g. left over from another role before a role switch) falls back to its first tab. */
export function useDashboardTab<T extends string>(tabs: readonly { id: T }[]): [T, (tab: T) => void] {
  const { dashboardTab, setDashboardTab } = useAppNav();
  const valid = tabs.some((t) => t.id === dashboardTab);
  const fallback = tabs[0]?.id as T;
  return [valid ? (dashboardTab as T) : fallback, setDashboardTab];
}
