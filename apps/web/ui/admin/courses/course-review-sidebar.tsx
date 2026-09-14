"use client";

import {
  Check,
  Circle,
  CircleAlert,
  GitPullRequest,
  ListChecks,
} from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { courseReviewSections } from "@/lib/coursemap/course-review-sections";
import { cn } from "@/lib/cn";
import styles from "./course-workspace.module.css";

export const reviewSectionKeys = [
  ...courseReviewSections.map((section) => section.key),
  "requisites",
];

export function CourseReviewSidebar({
  active,
  onSelect,
  disabled,
  checked = [],
  flagged = [],
  reviewing = false,
  hasData = true,
}: {
  active: string;
  onSelect: (section: string) => void;
  disabled: boolean;
  checked?: string[];
  flagged?: string[];
  reviewing?: boolean;
  hasData?: boolean;
}) {
  const sections = [
    ...courseReviewSections.map((section) => ({
      key: section.key,
      title: section.title,
      icon: ListChecks,
    })),
    { key: "requisites", title: "Requisites", icon: GitPullRequest },
  ];
  return (
    <nav aria-label="Course sections" className={styles.sidebar}>
      {hasData ? (
        <div className="space-y-1">
          {sections.map((section) => (
            <Button
              key={section.key}
              type="button"
              variant="ghost"
              disabled={disabled && active !== section.key}
              onClick={() => onSelect(section.key)}
              aria-current={active === section.key ? "page" : undefined}
              className={cn(
                "w-full justify-start gap-2 text-left",
                active === section.key && "bg-primary/10 text-primary",
              )}
            >
              {reviewing ? (
                checked.includes(section.key) ? (
                  <Check
                    className="size-4 shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                ) : flagged.includes(section.key) ? (
                  <CircleAlert
                    className="size-4 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )
              ) : null}
              <span className="truncate">{section.title}</span>
              {reviewing ? (
                <span className="sr-only">
                  {checked.includes(section.key)
                    ? ", checked"
                    : flagged.includes(section.key)
                      ? ", needs manual review"
                      : ", source verified"}
                </span>
              ) : null}
            </Button>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
