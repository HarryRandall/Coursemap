import type { CSSProperties, ReactNode } from "react";
import {
  CalendarClock,
  CheckCircle2,
  MapPin,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";

type Accent = {
  /** Centre of the chip, as shares of the hero text area. */
  x: number;
  y: number;
  icon: ReactNode;
  label: string;
  detail: string;
};

/**
 * Pairs that step in towards the middle as they go down, the arms of a V
 * that closes beside the buttons, above the dashboard.
 */
const ACCENTS: readonly Accent[] = [
  {
    x: 0.07,
    y: 0.12,
    icon: <CheckCircle2 size={13} className="text-success" />,
    label: "COMP2100",
    detail: "Prerequisites met",
  },
  {
    x: 0.93,
    y: 0.12,
    icon: <CalendarClock size={13} className="text-amber-500" />,
    label: "Census date",
    detail: "Counted down",
  },
  {
    x: 0.1,
    y: 0.46,
    icon: <Star size={13} className="fill-amber-400 text-amber-500" />,
    label: "ECON1101",
    detail: "Starred",
  },
  {
    x: 0.9,
    y: 0.46,
    icon: <Users size={13} className="text-primary" />,
    label: "Film Society",
    detail: "Fri 7 pm",
  },
  {
    x: 0.14,
    y: 0.76,
    icon: <MapPin size={13} className="text-primary" />,
    label: "Room 2.14",
    detail: "Level 2",
  },
  {
    x: 0.86,
    y: 0.76,
    icon: <TrendingUp size={13} className="text-primary" />,
    label: "Major",
    detail: "30 / 48 units",
  },
];

/**
 * Small pieces of the product either side of the hero text, arranged in a V
 * that narrows towards the dashboard. Decorative; wide screens only.
 */
export function LandingHeroAccents() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden lg:block"
    >
      {ACCENTS.map((accent, index) => (
        <div
          key={accent.label}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${accent.x * 100}%`, top: `${accent.y * 100}%` }}
        >
          <div
            className="enter-pop"
            style={
              { "--enter-delay": `${450 + index * 90}ms` } as CSSProperties
            }
          >
            <div
              className="flex animate-[landing-float_6s_ease-in-out_infinite] items-center gap-2 rounded-md border border-border bg-background/90 px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur-sm"
              style={{ animationDelay: `${index * -1.1}s` }}
            >
              {accent.icon}
              <span className="font-medium whitespace-nowrap text-foreground">
                {accent.label}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">
                {accent.detail}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
