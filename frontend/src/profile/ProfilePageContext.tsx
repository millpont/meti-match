import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

interface ProfilePageContextValue {
  viewingAccountId: string | null;
  openProfile: (accountId: string) => void;
  closeProfile: () => void;
}

const ProfilePageContext = createContext<ProfilePageContextValue | null>(null);

/** Holds which account's full profile page (if any) is currently being viewed — mounted once at
 * the app root so any component with an account id (SupplyOfferCard, BidCard, the eventual
 * Service Provider directory, etc.) can open it without prop-drilling through every dashboard.
 * There's no router in this app, so "opening a page" just swaps App.tsx's main content — see
 * PublicProfilePage.tsx. */
export function ProfilePageProvider({ children }: { children: ReactNode }) {
  const [viewingAccountId, setViewingAccountId] = useState<string | null>(null);
  const value = useMemo(
    () => ({
      viewingAccountId,
      openProfile: (accountId: string) => setViewingAccountId(accountId),
      closeProfile: () => setViewingAccountId(null),
    }),
    [viewingAccountId],
  );
  return <ProfilePageContext.Provider value={value}>{children}</ProfilePageContext.Provider>;
}

export function useProfilePage(): ProfilePageContextValue {
  const ctx = useContext(ProfilePageContext);
  if (!ctx) throw new Error("useProfilePage must be used within a ProfilePageProvider");
  return ctx;
}
