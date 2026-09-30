"use client";

import { Plus } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import type {
  CourseListSuggestion,
  WaitingCourseList,
} from "@/lib/catalogue/course-lists";
import { CourseListDialog } from "@/ui/admin/course-lists/course-list-dialog";

/** Tags the year's degree rules count that no list supplies yet. */
export function CourseListsWaiting({
  canEdit,
  suggestions,
  waiting,
  year,
}: {
  canEdit: boolean;
  suggestions: CourseListSuggestion[];
  waiting: WaitingCourseList[];
  year: number;
}) {
  if (waiting.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Waiting for a list</CardTitle>
        <CardDescription>
          These degree rules count no courses until a list with the same name is
          published for {year}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {waiting.map((tag) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-2"
              key={tag.name}
            >
              <div className="min-w-0">
                <p className="font-medium">{tag.name}</p>
                <p className="text-sm text-muted-foreground">
                  Used by {tag.structureCodes.join(", ") || "a degree rule"}
                </p>
              </div>
              {canEdit ? (
                <CourseListDialog
                  initial={
                    suggestions.find(
                      (suggestion) =>
                        suggestion.template.name.toLowerCase() ===
                        tag.name.toLowerCase(),
                    )?.template ?? {
                      name: tag.name,
                      sourceUrl: null,
                      codes: [],
                    }
                  }
                  trigger={
                    <Button size="sm" type="button" variant="outline">
                      <Plus aria-hidden="true" size={14} />
                      Create
                    </Button>
                  }
                  year={year}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
