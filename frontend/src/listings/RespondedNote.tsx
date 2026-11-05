import { useAppNav } from "../AppNavContext";

/** Shown under a marketplace card once the viewer has contacted/responded to it — the button
 * flipping to "Contacted" alone left people unsure anything had actually happened. */
export default function RespondedNote({ verb }: { verb: "contact" | "response" }) {
  const { goToDashboardTab } = useAppNav();
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-greenLight/60 px-3 py-2 text-sm text-slate-700">
      <span>
        {verb === "contact"
          ? "The lister has been notified of your request to contact them and may be in touch. Follow the conversation in your Responses tab."
          : "Your response has been sent and the lister notified. Follow the conversation in your Responses tab."}
      </span>
      <button type="button" className="text-xs font-semibold text-brand-green hover:underline" onClick={() => goToDashboardTab("responses")}>
        Go to Responses →
      </button>
    </div>
  );
}
