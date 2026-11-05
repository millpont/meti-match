// Shared display-number formatting — comma thousands separators everywhere a number is rendered
// (not for <input type="number"> values, which must stay unformatted for native parsing).

export function formatNumber(n: number | null | undefined, maxFractionDigits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const hasFraction = Math.abs(n % 1) > 1e-9;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Thousands-separated display of a raw numeric string as it's being typed ("200000" ->
 * "200,000", "1234.5" -> "1,234.5"). Only the integer part is grouped; the fraction is left
 * exactly as typed so a trailing "." or "0" mid-entry survives. Used by ui.tsx's NumberInput. */
export function groupDigits(raw: string): string {
  if (!raw) return "";
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const dot = body.indexOf(".");
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const fracPart = dot === -1 ? "" : body.slice(dot);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fracPart}`;
}

/** Inverse of groupDigits for whatever the user typed or pasted: drops separators and any
 * stray characters, keeping at most one decimal point (and a leading minus only if allowed). */
export function stripToNumeric(typed: string, allowNegative = false): string {
  let out = "";
  let seenDot = false;
  for (const [i, ch] of [...typed].entries()) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "." && !seenDot) { out += ch; seenDot = true; }
    else if (ch === "-" && allowNegative && i === 0) out += ch;
  }
  return out;
}

/** Crop rotation as "3-crop rotation over 4 years" — either half alone still reads sensibly. */
export function rotationLabel(crops: number | null | undefined, years: number | null | undefined): string | null {
  if (crops != null && years != null) return `${crops}-crop rotation over ${years} years`;
  if (years != null) return `${years}-year rotation`;
  if (crops != null) return `${crops}-crop rotation`;
  return null;
}

const normalizeForSearch = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9@.]+/g, " ").trim();

/** True if a and b are within one insert/delete/substitution of each other. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** Forgiving search score for picker lists ("plant grp", "Plnt", "group plant" all find
 * "PLANT Group"): every query word has to hit some word in `fields` — as a prefix, a substring,
 * or (for words of 4+ letters) within a one-letter typo. Higher is better; null = no match. An
 * empty query matches everything with score 0. */
export function smartMatchScore(query: string, fields: (string | null | undefined)[]): number | null {
  const terms = normalizeForSearch(query).split(" ").filter(Boolean);
  if (terms.length === 0) return 0;
  const haystack = normalizeForSearch(fields.filter(Boolean).join(" "));
  const words = haystack.split(" ").filter(Boolean);
  let score = 0;
  for (const term of terms) {
    if (words.some((w) => w === term)) score += 3;
    else if (words.some((w) => w.startsWith(term))) score += 2;
    else if (haystack.includes(term)) score += 1;
    else if (term.length >= 4 && words.some((w) => withinOneEdit(w.slice(0, term.length + 1), term) || withinOneEdit(w, term))) score += 0.5;
    else return null;
  }
  return score;
}

/** A readable default name for an uploaded document when the user didn't type one:
 * "Articles_of-Incorporation.pdf" -> "Articles of Incorporation". */
export function documentLabelFromFilename(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, "");
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || filename;
}
