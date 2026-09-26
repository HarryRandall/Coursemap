import {
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  MapPin,
  PenLine,
  TreePalm,
} from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { badgeVariantForTone } from "@/lib/ui";
import {
  UNIVERSITY_CALENDAR_CATEGORIES,
  type UniversityCalendarCategory,
} from "@/lib/coursemap/university-calendar";

export const categoryIcons = {
  teaching: BookOpen,
  examinations: PenLine,
  enrolment: ClipboardCheck,
  graduation: GraduationCap,
  holiday: TreePalm,
  campus: MapPin,
};

export const categoryTones = {
  teaching: "brand",
  examinations: "danger",
  enrolment: "warning",
  graduation: "success",
  holiday: "info",
  campus: "neutral",
} as const;

export function CategoryBadge({
  category,
}: {
  category: UniversityCalendarCategory;
}) {
  const Icon = categoryIcons[category];
  return (
    <Badge variant={badgeVariantForTone[categoryTones[category]]}>
      <Icon size={12} aria-hidden="true" />
      {
        UNIVERSITY_CALENDAR_CATEGORIES.find((item) => item.value === category)
          ?.label
      }
    </Badge>
  );
}

/** Formats an ISO day without letting the viewer's time zone shift it. */
export function calendarDateLabel(
  date: string,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("en-AU", {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
