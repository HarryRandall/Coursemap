"use client";

import { useRouter } from "next/navigation";
import { ExternalLink, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import {
  deleteCourseListAction,
  publishCourseListAction,
} from "@/lib/admin/course-lists-actions";
import {
  courseListChanges,
  type AdminCourseList,
} from "@/lib/catalogue/course-lists";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { showToast } from "@/ui/common/toast";
import { CourseListDialog } from "@/ui/admin/course-lists/course-list-dialog";

function CodeList({ codes, label }: { codes: string[]; label: string }) {
  if (codes.length === 0) return null;
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-mono">{codes.join(", ")}</span>
    </p>
  );
}

export function CourseListCard({
  canEdit,
  list,
  year,
}: {
  canEdit: boolean;
  list: AdminCourseList;
  year: number;
}) {
  const router = useRouter();
  const { added, removed } = courseListChanges(list);
  const hasChanges =
    list.publishedAt === null || added.length > 0 || removed.length > 0;

  async function run(action: () => ReturnType<typeof publishCourseListAction>) {
    const result = await action();
    if (!result.ok) throw new Error(result.message);
    showToast(result.message);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {list.name}
          {list.publishedAt === null ? (
            <Badge variant="warning-light">Not published</Badge>
          ) : hasChanges ? (
            <Badge variant="info-light">Unpublished changes</Badge>
          ) : (
            <Badge variant="success-light">Published</Badge>
          )}
        </CardTitle>
        {canEdit ? (
          <CardAction className="flex gap-1">
            <CourseListDialog
              list={list}
              trigger={
                <Button
                  aria-label={`Edit ${list.name}`}
                  size="icon"
                  variant="ghost"
                >
                  <Pencil aria-hidden="true" size={15} />
                </Button>
              }
              year={year}
            />
            <ConfirmDialog
              confirmLabel="Delete list"
              description={`Degree rules stop counting ${list.name} for ${year}. This cannot be undone.`}
              destructive
              onConfirm={() => run(() => deleteCourseListAction(year, list.id))}
              title={`Delete ${list.name}?`}
              trigger={
                <Button
                  aria-label={`Delete ${list.name}`}
                  size="icon"
                  variant="ghost"
                >
                  <Trash2 aria-hidden="true" size={15} />
                </Button>
              }
            />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-2">
        <p className="text-sm text-muted-foreground">
          {list.draftCodes.length}{" "}
          {list.draftCodes.length === 1 ? "course" : "courses"}
          {list.sourceUrl ? (
            <>
              {" · "}
              <a
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                href={list.sourceUrl}
                rel="noreferrer"
                target="_blank"
              >
                Source
                <ExternalLink aria-hidden="true" size={12} />
              </a>
            </>
          ) : null}
        </p>
        {list.publishedAt === null ? (
          <CodeList codes={list.draftCodes} label="Courses" />
        ) : (
          <>
            <CodeList codes={added} label="Adds" />
            <CodeList codes={removed} label="Removes" />
          </>
        )}
        {list.unlistedCodes.length > 0 ? (
          <p className="flex items-start gap-1.5 text-sm text-warning">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              size={14}
            />
            <span>
              Not in the {year} course listing:{" "}
              <span className="font-mono">{list.unlistedCodes.join(", ")}</span>
            </span>
          </p>
        ) : null}
        {canEdit && hasChanges ? (
          <div>
            <ConfirmDialog
              confirmLabel="Publish"
              description={`Degree rules will count these ${list.draftCodes.length} courses as ${list.name} in ${year}.`}
              onConfirm={() =>
                run(() => publishCourseListAction(year, list.id))
              }
              title={`Publish ${list.name}?`}
              trigger={<Button size="sm">Publish</Button>}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
