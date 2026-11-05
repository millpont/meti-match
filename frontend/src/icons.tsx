// Minimal line icons for dashboard tiles — not pixel-perfect icongraphy, just enough shape and
// color to bring the (currently white/green-only) dashboards closer to the mockup's alternating
// green/gold icon treatment.
import type { SVGProps } from "react";

const common = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
};

export function WheatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M12 3v18" />
      <path d="M12 6c-2 0-3.5 1-3.5 2.5S10 11 12 11" />
      <path d="M12 6c2 0 3.5 1 3.5 2.5S14 11 12 11" />
      <path d="M12 10c-2 0-3.5 1-3.5 2.5S10 15 12 15" />
      <path d="M12 10c2 0 3.5 1 3.5 2.5S14 15 12 15" />
      <path d="M12 14c-1.5 0-2.5.8-2.5 2S10.5 18 12 18" />
      <path d="M12 14c1.5 0 2.5.8 2.5 2S13.5 18 12 18" />
    </svg>
  );
}

export function ChartBarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

export function TrendUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 6h6v6" />
    </svg>
  );
}

export function GavelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M14 4l6 6" />
      <path d="M9 9l6 6" />
      <path d="M4 20l7-7" />
      <path d="M13 5l6-3 3 3-3 6" />
    </svg>
  );
}

export function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z" />
    </svg>
  );
}

export function ClipboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <rect x="9" y="2.5" width="6" height="3" rx="1" />
      <path d="M9 11h6M9 15h6" />
    </svg>
  );
}

export function UsersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.2c2.6.4 4.5 2.7 4.5 5.3" />
    </svg>
  );
}

/** A down-pointing chevron for expand/collapse accordion headers — rotate 180deg via className
 * when the section is open, so the same icon doubles as both states. */
export function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} className="h-4 w-4" {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function LeafIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M5 19c7-1 13-7 14-14-7 1-13 7-14 14Z" />
      <path d="M5 19c2-4 5-7 9-9" />
    </svg>
  );
}

export function BellIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...common} {...props}>
      <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}
