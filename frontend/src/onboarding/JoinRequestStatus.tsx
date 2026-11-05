import type { JoinRequest } from "../types";

/** Shown instead of the onboarding wizard while a "join an existing company" request is
 * awaiting a decision, or just after one was declined — see Onboarding.tsx, which polls
 * /api/me so an approval elsewhere is picked up here without a re-login. */
export default function JoinRequestStatus({
  request, onStartOver,
}: {
  request: JoinRequest;
  onStartOver: () => void;
}) {
  const roleLabel = request.role.replace(/_/g, " ");

  if (request.status === "declined") {
    return (
      <div className="mx-auto max-w-md px-6 py-12 text-center">
        <h1 className="text-xl font-bold text-slate-900">Request declined</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your request to join <span className="font-medium">{request.account_name}</span> as{" "}
          {roleLabel} was declined.
        </p>
        <button type="button" className="btn-primary mt-6 px-6" onClick={onStartOver}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-6 py-12 text-center">
      <h1 className="text-xl font-bold text-slate-900">Request pending</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your request to join <span className="font-medium">{request.account_name}</span> as{" "}
        {roleLabel} is awaiting approval from {request.role === "program_operator" ? "that program's admin" : "a company admin"}.
      </p>
      <p className="mt-4 text-xs text-slate-400">This page checks automatically — no need to refresh.</p>
    </div>
  );
}
