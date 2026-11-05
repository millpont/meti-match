import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { formatNumber, groupDigits, stripToNumeric } from "./format";

export function Badge({ children, tone = "slate", title }: { children: ReactNode; tone?: BadgeTone; title?: string }) {
  return <span className={`chip ${TONES[tone]}`} title={title}>{children}</span>;
}

type BadgeTone = "slate" | "red" | "green" | "amber" | "blue" | "violet";
const TONES: Record<BadgeTone, string> = {
  slate: "bg-slate-100 text-slate-600",
  red: "bg-red-50 text-red-600",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-sky-50 text-sky-700",
  violet: "bg-violet-50 text-violet-700",
};

/** Colored icon circle for dashboard tiles — alternate "green"/"gold" per tile, matching the
 * mockup's alternating icon-circle treatment rather than an all-green wash. */
export function IconCircle({ tone, children }: { tone: "green" | "gold"; children: ReactNode }) {
  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-full ${
        tone === "gold" ? "bg-brand-gold/15 text-brand-gold" : "bg-brand-greenLight text-brand-green"
      }`}
    >
      {children}
    </div>
  );
}

/** True if a timestamp is within the last N days (default 3) — drives the gold "NEW" tag on
 * freshly posted listings, matching the mockup's board cards. */
export function isRecent(isoDate: string, days = 3): boolean {
  const posted = new Date(isoDate).getTime();
  return Date.now() - posted <= days * 24 * 60 * 60 * 1000;
}

export function NewBadge() {
  return <span className="chip bg-brand-gold text-white">NEW</span>;
}

/** True if a timestamp is older than N days (default 30) — drives the "still valid?" nudge on
 * listings nobody has touched in a while. */
export function isStale(isoDate: string, days = 30): boolean {
  const updated = new Date(isoDate).getTime();
  return Date.now() - updated > days * 24 * 60 * 60 * 1000;
}

/** A single stat number with an optional "vs prior 30 days" delta — used by both the admin
 * dashboard (marketplace-wide) and each role dashboard's "my activity" summary. */
export function StatTile({
  label, value, pctChange, prefix,
}: { label: string; value: number; pctChange: number | null; prefix?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{prefix}{formatNumber(value)}</div>
      {pctChange != null && (
        <div className={`mt-1 text-xs font-medium ${pctChange >= 0 ? "text-emerald-700" : "text-red-600"}`}>
          {pctChange >= 0 ? "↑" : "↓"} {Math.abs(pctChange)}% vs prior 30 days
        </div>
      )}
    </div>
  );
}

export function PinIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0">
      <path
        fillRule="evenodd"
        d="M10 2a6 6 0 0 0-6 6c0 4.5 6 10 6 10s6-5.5 6-10a6 6 0 0 0-6-6Zm0 8.25a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-500 border-t-transparent" />
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-12 text-center">
      <p className="text-slate-700 font-medium">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

/** Grouped chip multi-select for taxonomies: leaf items are selected under group headers. */
export function GroupedChipSelect({
  groups,
  selected,
  onChange,
}: {
  groups: { group: string; items: { id: string; label: string }[] }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.group}>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{g.group}</div>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((it) => {
              const on = selected.includes(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => toggle(it.id)}
                  className={`chip border transition-colors ${
                    on ? "bg-brand-greenLight border-brand-green text-brand-green" : "border-brand-edge text-slate-500 hover:border-slate-400"
                  }`}
                >
                  {it.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The explicit "none of these apply" answer for a multi-select (ChipMultiSelect's noneOption).
 * Counts as answered for Production Data completion; never shown as a badge on a listing. */
export const NONE_OPTION = "None";

/** Drop NONE_OPTION from a list headed for display or for pre-filling a listing. */
export const withoutNone = (values: string[]) => values.filter((v) => v !== NONE_OPTION);

/** A compact multi-select rendered as toggleable chips — friendlier than a native multiple select. */
export function ChipMultiSelect({
  options,
  selected,
  onChange,
  selectAll = false,
  titles,
  noneOption = false,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Show a leading "Select all / Clear all" toggle chip. */
  selectAll?: boolean;
  /** Optional label -> definition map, shown as a native hover tooltip on that chip (see
   * useTaxonomyTerms — Superadmin-managed attributes/practices/certifications carry these). */
  titles?: Record<string, string>;
  /** Offer a leading "None" chip, mutually exclusive with every other option — an explicit
   * "none of these apply" answer, distinct from leaving the question blank. Stored as the
   * literal NONE_OPTION value (see backend production_data_routes.NONE_OPTION). */
  noneOption?: boolean;
}) {
  const toggle = (opt: string) => {
    if (opt === NONE_OPTION) return onChange(selected.includes(NONE_OPTION) ? [] : [NONE_OPTION]);
    const rest = selected.filter((s) => s !== NONE_OPTION);
    onChange(rest.includes(opt) ? rest.filter((s) => s !== opt) : [...rest, opt]);
  };
  const allOn = options.length > 0 && options.every((o) => selected.includes(o));
  const shown = noneOption ? [NONE_OPTION, ...options.filter((o) => o !== NONE_OPTION)] : options;
  return (
    <div className="flex flex-wrap gap-1.5">
      {selectAll && (
        <button
          type="button"
          onClick={() => onChange(allOn ? [] : [...options])}
          className="chip border border-brand-green/60 font-medium text-brand-green hover:bg-brand-greenLight"
        >
          {allOn ? "Clear all" : "Select all"}
        </button>
      )}
      {shown.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            title={opt === NONE_OPTION ? "None of these apply" : titles?.[opt]}
            className={`chip border transition-colors ${
              on
                ? "bg-brand-greenLight border-brand-green text-brand-green"
                : "border-brand-edge text-slate-500 hover:border-slate-400"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

/** A closed-by-default multi-select — same semantics as ChipMultiSelect (toggle any number of
 * options), but collapsed into one compact dropdown button instead of showing every option
 * inline. Meant for filter panels (several of these side by side add up fast); ChipMultiSelect
 * stays the better fit for a form field the user is actively filling out one at a time. */
export function MultiSelectDropdown({
  label, options, selected, onChange, titles, labels,
}: {
  label: string;
  /** The option VALUES — what goes over the wire. */
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Hover-tooltip text per option value (taxonomy definitions). */
  titles?: Record<string, string>;
  /** Display text per option value, when the value isn't itself human-readable — e.g. the
   * Organization filter, whose values are account ids shown as company names (account names
   * aren't unique, so the name can't be the value). Falls back to the value itself. */
  labels?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const toggle = (opt: string) =>
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);

  const display = (opt: string) => labels?.[opt] ?? opt;
  const summary = selected.length === 0
    ? "Any"
    : selected.length <= 2 ? selected.map(display).join(", ") : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <label className="label">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="field flex w-full items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${selected.length ? "text-slate-800" : "text-slate-400"}`}>{summary}</span>
        <span className="shrink-0 text-slate-400">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-max min-w-full overflow-y-auto rounded-lg border border-brand-edge bg-white p-1.5 shadow-lg">
          {options.length === 0 && <p className="px-2 py-1 text-xs text-slate-400 whitespace-nowrap">No options</p>}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 block w-full rounded px-2 py-1 text-left text-xs font-medium text-brand-green hover:bg-brand-bg"
            >
              Clear
            </button>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              title={titles?.[opt]}
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap rounded px-2 py-1.5 text-sm hover:bg-brand-bg"
            >
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              <span className="text-slate-700">{display(opt)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** A blocking confirm/cancel modal — e.g. OfferForm's "Review & Publish" step ("Please confirm
 * all data is accurate before publishing"). `busy` disables both buttons and shows a
 * confirming-in-progress label instead of re-rendering the caller's own submit state. */
export function ConfirmDialog({
  title, message, confirmLabel = "Confirm", busy, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A numeric text field that shows thousands separators while typing ("200000" renders as
 * "200,000") — a native <input type="number"> can't display them. `value`/`onChange` deal in the
 * raw unseparated string, so callers keep storing and submitting exactly what they did before.
 * The caret is restored by digit count, since inserting a comma would otherwise push it along. */
export function NumberInput({
  value, onChange, allowNegative, className = "field", ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: string | number | null | undefined;
  onChange: (raw: string) => void;
  allowNegative?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // How many digit/dot characters sat left of the caret at the last edit — re-applied after
  // the re-render re-inserts separators.
  const caretDigits = useRef<number | null>(null);
  const display = groupDigits(value == null ? "" : String(value));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caretDigits.current == null || document.activeElement !== el) return;
    let seen = 0;
    let pos = 0;
    while (pos < display.length && seen < caretDigits.current) {
      if (display[pos] !== ",") seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    caretDigits.current = null;
  }, [display]);

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode="decimal"
      className={className}
      value={display}
      onChange={(e) => {
        const caret = e.target.selectionStart ?? e.target.value.length;
        caretDigits.current = stripToNumeric(e.target.value.slice(0, caret), allowNegative).length;
        onChange(stripToNumeric(e.target.value, allowNegative));
      }}
    />
  );
}

/** "End is before start" message for a start/end date pair, or null if fine (or incomplete).
 * ISO yyyy-mm-dd strings compare correctly as plain strings. */
export function dateRangeError(start: string, end: string, label: string): string | null {
  return start && end && end < start ? `${label} end date can't be before its start date` : null;
}

/** A start/end date pair kept together on one row under one label (Delivery Window, Harvest
 * Window) rather than two separately-labeled fields stacked in a grid. End can't be picked before
 * start — the picker's `min` blocks it, and a typed/older value gets an inline error. */
export function DateRangeField({
  label, start, end, onStartChange, onEndChange, required, className,
}: {
  label: string;
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  required?: boolean;
  className?: string;
}) {
  const error = dateRangeError(start, end, label);
  return (
    <div className={className}>
      <label className="label">{label}{required ? " *" : ""}</label>
      <div className="flex items-center gap-2">
        <input type="date" className="field" aria-label={`${label} start`} value={start}
          max={end || undefined} onChange={(e) => onStartChange(e.target.value)} />
        <span className="shrink-0 text-sm text-slate-400">to</span>
        <input type="date" className="field" aria-label={`${label} end`} value={end}
          min={start || undefined} onChange={(e) => onEndChange(e.target.value)} />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** ConfirmDialog's bigger sibling for "review before publishing": shows arbitrary content (the
 * listing rendered exactly as the marketplace will show it, plus anything the card omits) above
 * the confirm/cancel row. Scrolls inside the viewport for long listings. */
export function ReviewDialog({
  title, message, children, confirmLabel = "Confirm", busy, onConfirm, onCancel,
}: {
  title: string;
  message?: string;
  children: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
        <div className="border-b border-brand-edge p-5">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {message && <p className="mt-1 text-sm text-slate-600">{message}</p>}
        </div>
        <div className="flex-1 overflow-y-auto bg-brand-bg/50 p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t border-brand-edge p-4">
          <button type="button" className="btn-ghost" disabled={busy} onClick={onCancel}>Back to editing</button>
          <button type="button" className="btn-primary" disabled={busy} onClick={onConfirm}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Label/value rows for the review dialog — the fields a listing card doesn't itself show. Rows
 * with an empty value are dropped so the summary only lists what was actually filled in. */
export function SummaryRows({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== "" && v != null && v !== false);
  if (shown.length === 0) return null;
  return (
    <dl className="card mt-3 grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
      {shown.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="shrink-0 text-slate-500">{k}:</dt>
          <dd className="text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
