import { Badge } from "../ui";
import { useAppNav } from "../AppNavContext";
import { useVerification } from "../profile/VerificationPrompt";

/** Status cell for a draft listing in My Listings: says outright that it isn't on the
 * Marketplace, and — when missing business verification is what's stopping it from being
 * published — says so with a link to fix it, instead of a bare grey "draft". */
export default function DraftBadge({ audience }: { audience: "buyers" | "sellers" }) {
  const { verified } = useVerification();
  const { goToDashboardTab } = useAppNav();
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge tone="slate">Draft — not visible to {audience}</Badge>
      {!verified && (
        <button type="button" className="text-left text-[11px] font-medium text-amber-700 hover:underline"
          // The row it sits in toggles open on click — this link shouldn't also do that.
          onClick={(e) => { e.stopPropagation(); goToDashboardTab("profile"); }}>
          Complete business verification to publish →
        </button>
      )}
    </div>
  );
}
