import type { SeltAdminSummary } from "@/lib/selt/admin";
import { SELT_ADMIN_PATH } from "@/lib/selt/admin-format";
import { KpiTile } from "@/ui/common/kpi-tile";
import { ShareRing } from "@/ui/common/share-ring";

export function SeltSummaryTiles({ summary }: { summary: SeltAdminSummary }) {
  const share = summary.publishedCourses
    ? summary.coveredCourses / summary.publishedCourses
    : null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        href={`${SELT_ADMIN_PATH}?status=published`}
        label="Course coverage"
        value={share === null ? "–" : `${Math.round(share * 100)}%`}
        detail={`${summary.coveredCourses} of ${summary.publishedCourses} courses`}
        visual={
          <ShareRing
            size={48}
            thickness={5}
            values={[{ share, tone: "primary" }]}
            label={`SELT reports published for ${summary.coveredCourses} of ${summary.publishedCourses} courses`}
          />
        }
      />
      <KpiTile
        href={`${SELT_ADMIN_PATH}?status=ready`}
        label="Ready to publish"
        value={summary.ready}
        detail="All checks passed"
      />
      <KpiTile
        href={`${SELT_ADMIN_PATH}?status=blocked`}
        label="Blocked"
        value={summary.blocked}
        detail="Extraction warnings to fix"
      />
      <KpiTile
        href={`${SELT_ADMIN_PATH}?status=published`}
        label="Published reports"
        value={summary.published}
        detail="Visible to students"
      />
    </div>
  );
}
