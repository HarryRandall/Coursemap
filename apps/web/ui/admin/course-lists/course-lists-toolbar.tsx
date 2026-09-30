"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { YearPicker } from "@/ui/common/year-picker";
import { CourseListDialog } from "@/ui/admin/course-lists/course-list-dialog";

export function CourseListsToolbar({
  canEdit,
  year,
  years,
}: {
  canEdit: boolean;
  year: number;
  years: number[];
}) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <YearPicker
        onChange={(next) => {
          if (next !== "all")
            router.push(`/admin/course-lists/${next}`, { scroll: false });
        }}
        value={year}
        years={years}
      />
      {canEdit ? (
        <CourseListDialog
          trigger={
            <Button type="button" variant="outline">
              <Plus aria-hidden="true" size={15} />
              New list
            </Button>
          }
          year={year}
        />
      ) : null}
    </div>
  );
}
