import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Badge } from "../ui";
import { formatNumber, smartMatchScore } from "../format";
import type { DiscoverableGrower } from "../types";

const RELATIONSHIP: Record<DiscoverableGrower["relationship"], { label: string; tone: "green" | "blue" | "amber" | "slate" } | null> = {
  available: null,
  in_your_program: { label: "Already in your program", tone: "green" },
  requested_to_join: { label: "Asked to join you — approve above", tone: "amber" },
  invited: { label: "Invited ✓", tone: "blue" },
  in_another_program: { label: "In another program", tone: "slate" },
};

/** Find an already-registered grower and invite them to this program — by typing (forgiving
 * search across farm name, account name and state, or an exact email) or by picking from a
 * dropdown of every eligible grower. Only growers who turned on "Open to Program Enrollment" in
 * their Profile are listed; ones that can't be invited are still shown, labeled with why. */
export default function InviteGrowerCard({ onInvited }: { onInvited: (notice: string) => void }) {
  const [q, setQ] = useState("");
  const [growers, setGrowers] = useState<DiscoverableGrower[] | null>(null);
  const [emailMatch, setEmailMatch] = useState<DiscoverableGrower[] | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.discoverableGrowers("").then((r) => setGrowers(r.growers)).catch(() => setGrowers([]));
  }, []);

  // Emails aren't sent to the browser, so an address is matched server-side (exact only).
  useEffect(() => {
    const query = q.trim();
    if (!query.includes("@")) return setEmailMatch(null);
    const t = setTimeout(() => {
      api.discoverableGrowers(query).then((r) => setEmailMatch(r.growers)).catch(() => setEmailMatch([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const results = useMemo(() => {
    if (emailMatch) return emailMatch;
    if (!growers) return null;
    if (!q.trim()) return growers;
    return growers
      .map((g) => ({ g, score: smartMatchScore(q, [g.farm_name, g.account_name, g.state]) }))
      .filter((x): x is { g: DiscoverableGrower; score: number } => x.score != null)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.g);
  }, [growers, emailMatch, q]);

  const selected = growers?.find((g) => g.grower_account_id === selectedId) ?? null;

  const invite = async (g: DiscoverableGrower) => {
    setBusyId(g.grower_account_id);
    setError(null);
    try {
      await api.inviteGrower(g.grower_account_id);
      const mark = (gs: DiscoverableGrower[] | null) =>
        gs && gs.map((x) => (x.grower_account_id === g.grower_account_id ? { ...x, relationship: "invited" as const } : x));
      setGrowers(mark);
      setEmailMatch(mark);
      setSelectedId("");
      onInvited(
        `Invitation sent to ${g.farm_name || "the grower"}. They'll see it in their Program tab, and you'll get a notification when they respond.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const row = (g: DiscoverableGrower) => {
    const rel = RELATIONSHIP[g.relationship];
    return (
      <div key={g.grower_account_id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
        <div className="min-w-0">
          <div className="truncate font-medium text-slate-800">{g.farm_name || g.account_name}</div>
          <div className="text-xs text-slate-500">
            {[g.state, g.total_acres != null && `${formatNumber(g.total_acres)} acres`].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        {rel ? (
          <span title={g.relationship === "in_another_program" ? "Growers can belong to one program at a time." : undefined}>
            <Badge tone={rel.tone}>{rel.label}</Badge>
          </span>
        ) : (
          <button type="button" className="btn-primary shrink-0 !px-3 !py-1 text-xs" disabled={busyId === g.grower_account_id} onClick={() => invite(g)}>
            {busyId === g.grower_account_id ? "Sending…" : "Invite"}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">Invite a registered grower</h2>
      <p className="mt-0.5 text-sm text-slate-600">
        Growers already on the platform who've marked themselves "Open to Program Enrollment" in their Profile.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <label className="label mt-3">Choose a grower</label>
      <div className="flex gap-2">
        <select className="field" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">{growers == null ? "Loading…" : `Select from ${growers.length} eligible grower${growers.length === 1 ? "" : "s"}…`}</option>
          {(growers ?? []).map((g) => (
            <option key={g.grower_account_id} value={g.grower_account_id} disabled={g.relationship !== "available"}>
              {g.farm_name || g.account_name}{g.state ? ` (${g.state})` : ""}
              {RELATIONSHIP[g.relationship] ? ` — ${RELATIONSHIP[g.relationship]!.label}` : ""}
            </option>
          ))}
        </select>
        <button type="button" className="btn-primary shrink-0" disabled={!selected || busyId != null} onClick={() => selected && invite(selected)}>
          {selected && busyId === selected.grower_account_id ? "Sending…" : "Invite"}
        </button>
      </div>

      <div className="my-3 flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
        <span className="h-px flex-1 bg-brand-edge" />
        or search
        <span className="h-px flex-1 bg-brand-edge" />
      </div>
      <input className="field" placeholder="Farm name, state, or exact email…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="mt-3 max-h-72 divide-y divide-brand-edge overflow-y-auto rounded-lg border border-brand-edge">
        {results == null ? (
          <p className="px-3 py-4 text-sm text-slate-400">{q.includes("@") ? "Looking up that email…" : "Loading…"}</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">
            {q.trim() ? "No matching growers are open to enrollment." : "No growers are open to program enrollment right now."}
            {" "}Not on the platform yet? Register them instead.
          </p>
        ) : results.map(row)}
      </div>
    </div>
  );
}
