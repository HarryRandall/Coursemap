"use client";

import { useSearchParams } from "next/navigation";
import { UNIVERSITY_CALENDAR_CATEGORIES } from "@/lib/coursemap/university-calendar";
import { FilterBar } from "@/ui/common/filter-bar";

export function CalendarFilters({
  includePlanTerms = false,
  hideSearch = false,
  searchPlaceholder = "Search dates, deadlines and events...",
}: {
  includePlanTerms?: boolean;
  hideSearch?: boolean;
  searchPlaceholder?: string;
}) {
  const params = useSearchParams();
  const categories = [
    ...(includePlanTerms ? [{ value: "plan-terms", label: "Plan terms" }] : []),
    ...UNIVERSITY_CALENDAR_CATEGORIES,
  ];
  return (
    <FilterBar
      searchPlaceholder={searchPlaceholder}
      hideSearch={hideSearch}
      normaliseParams={(next) => {
        if (
          next.get("societies") !== "1" &&
          next.get("category") === "societies"
        )
          next.delete("category");
      }}
      filters={[
        {
          key: "category",
          label: "Category",
          allLabel: "All categories",
          options:
            params.get("societies") === "1"
              ? [...categories, { value: "societies", label: "Societies" }]
              : categories,
        },
        {
          key: "societies",
          label: "Society events",
          allLabel: "Off",
          options: [{ value: "1", label: "On" }],
        },
      ]}
    />
  );
}
