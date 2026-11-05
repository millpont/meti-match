import { useState } from "react";
import { api } from "../api";
import { Badge } from "../ui";
import { useTaxonomyTerms } from "../useTaxonomyTerms";
import type { Enrollment, EnrollmentStatus } from "../types";

export default function GrowersTable({ enrollments, onChanged, onNotice }: {
  enrollments: Enrollment[];
  onChanged: () => void;
  /** Confirmation text for the action just taken, shown by the dashboard above the table. */
  onNotice?: (notice: string) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const practices = useTaxonomyTerms("practice");

  const setStatus = async (e: Enrollment, next: EnrollmentStatus) => {
    setBusyId(e.id);
    try {
      await api.updateEnrollment(e.id, { status: next });
      if (next === "active") onNotice?.(`${nameOf(e)} is now enrolled in your program — they've been notified.`);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (e: Enrollment) => {
    setBusyId(e.id);
    try {
      await api.deleteEnrollment(e.id);
      onNotice?.(e.status === "invited" ? `Invitation to ${nameOf(e)} cancelled.` : e.status === "pending"
        ? `Declined ${nameOf(e)}'s request to join.` : `${nameOf(e)} removed from your program.`);
      onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const nameOf = (e: Enrollment) => e.grower_name_freeform || e.grower_account_name || "The grower";

  if (enrollments.length === 0) {
    return <p className="text-sm text-slate-500">No growers enrolled yet — invite a registered grower or register a new one below.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-2 pr-4">Grower Name</th>
            <th className="pb-2 pr-4">Email</th>
            <th className="pb-2 pr-4">Farms</th>
            <th className="pb-2 pr-4">Acres Enrolled</th>
            <th className="pb-2 pr-4">Primary Practices</th>
            <th className="pb-2 pr-4">Enrollment Date</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {enrollments.map((e) => {
            const selfRequested = !e.grower_name_freeform && !!e.grower_account_name;
            return (
              <tr key={e.id} className="border-t border-brand-edge">
                <td className="py-2 pr-4 font-medium text-slate-800">
                  {e.grower_name_freeform || e.grower_account_name || "—"}
                  {selfRequested && <span className="ml-1.5 text-[11px] font-normal text-slate-400">(requested)</span>}
                </td>
                <td className="py-2 pr-4 text-slate-600">{e.grower_email || "—"}</td>
                <td className="py-2 pr-4 text-slate-600">{e.farms_count ?? "—"}</td>
                <td className="py-2 pr-4 text-slate-600">{e.acres_enrolled ?? "—"}</td>
                <td className="py-2 pr-4 text-slate-600">
                  {e.primary_practices.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {e.primary_practices.map((p) => <Badge key={p} tone="blue" title={practices.titles[p]}>{p}</Badge>)}
                    </div>
                  ) : "—"}
                </td>
                <td className="py-2 pr-4 text-slate-500">{e.enrollment_date}</td>
                <td className="py-2 pr-4">
                  {e.status === "invited" ? (
                    <Badge tone="blue">invited — awaiting grower</Badge>
                  ) : e.status === "pending" ? (
                    <button
                      className="text-xs font-medium text-brand-green hover:underline"
                      disabled={busyId === e.id}
                      onClick={() => setStatus(e, "active")}
                    >
                      <Badge tone="amber">pending</Badge> Approve
                    </button>
                  ) : (
                    <button disabled={busyId === e.id} onClick={() => setStatus(e, "pending")}>
                      <Badge tone="green">active</Badge>
                    </button>
                  )}
                </td>
                <td className="py-2 text-right">
                  <button
                    className="text-xs text-slate-400 hover:text-red-600"
                    disabled={busyId === e.id}
                    onClick={() => remove(e)}
                  >
                    {e.status === "invited" ? "Cancel invite" : e.status === "pending" ? "Decline" : "Remove"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
