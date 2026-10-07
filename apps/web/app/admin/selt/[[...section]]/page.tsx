import { notFound, redirect } from "next/navigation";
import {
  canManageCatalogueOperations,
  canWriteCourses,
} from "@/lib/auth/viewer";
import {
  loadSeltAdminReport,
  loadSeltAdminReports,
  loadSeltAdminSummary,
  loadSeltAdminTokens,
} from "@/lib/selt/admin";
import {
  SELT_ADMIN_PATH,
  parseSeltReportStatus,
} from "@/lib/selt/admin-format";
import { AppShell } from "@/ui/shell";
import { SeltAccess } from "@/ui/admin/selt/selt-access";
import { SeltReportSheet } from "@/ui/admin/selt/selt-report-sheet";
import { SeltReportTable } from "@/ui/admin/selt/selt-report-table";
import { SeltSummaryTiles } from "@/ui/admin/selt/selt-summary-tiles";
import { SeltTabList, SeltTabs } from "@/ui/admin/selt/selt-tabs";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function SeltPage({
  params,
  searchParams,
}: {
  params: Promise<{ section?: string[] }>;
  searchParams: SearchParams;
}) {
  if (!(await canManageCatalogueOperations())) redirect("/admin");
  const { section = [] } = await params;
  if (section.length > 1 || (section[0] && section[0] !== "access")) {
    notFound();
  }
  const current = section[0] === "access" ? "access" : "reports";
  const query = await searchParams;
  const summary = await loadSeltAdminSummary();

  let body;
  if (current === "access") {
    body = (
      <SeltAccess
        tokens={await loadSeltAdminTokens()}
        renderedAt={new Date().toISOString()}
      />
    );
  } else {
    const page = Math.max(1, Number.parseInt(single(query.page), 10) || 1);
    const reportId = single(query.report);
    const [reports, report, canPublish] = await Promise.all([
      loadSeltAdminReports({
        query: single(query.q),
        status: parseSeltReportStatus(single(query.status)),
        page,
      }),
      UUID.test(reportId) ? loadSeltAdminReport(reportId) : null,
      canWriteCourses(),
    ]);
    const closeParams = new URLSearchParams(
      Object.entries({
        q: single(query.q),
        status: single(query.status),
        page: page > 1 ? String(page) : "",
      }).filter(([, value]) => value),
    ).toString();
    body = (
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="shrink-0">
          <SeltSummaryTiles summary={summary} />
        </div>
        <SeltReportTable page={reports} />
        {report ? (
          <SeltReportSheet
            key={report.id}
            report={report}
            canPublish={canPublish}
            closeHref={`${SELT_ADMIN_PATH}${closeParams ? `?${closeParams}` : ""}`}
          />
        ) : null}
      </div>
    );
  }

  return (
    <SeltTabs value={current}>
      <AppShell
        admin
        // Reports hands its remaining height to the table, which scrolls
        // its own rows; the token list scrolls with the page.
        fill={current === "reports"}
        tabs={<SeltTabList waiting={summary.ready + summary.blocked} />}
        currentBreadcrumbLabel="SELT surveys"
      >
        <h1 className="sr-only">SELT surveys</h1>
        {body}
      </AppShell>
    </SeltTabs>
  );
}
