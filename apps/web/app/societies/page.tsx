import { Suspense } from "react";
import { loadSocieties } from "@/lib/societies-data";
import { upcomingSocietyEvents } from "@/lib/society-events";
import { AppShell } from "@/ui/shell/app-shell";
import { SocietiesDirectory } from "@/ui/societies/societies-directory";

export const dynamic = "force-dynamic";

export default async function SocietiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { societies, events } = await loadSocieties();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value]) {
      query.append(key, item);
    }
  }
  return (
    <AppShell fill>
      <h1 className="sr-only">Societies</h1>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading societies...</p>
        }
      >
        <SocietiesDirectory
          initialQuery={query.toString()}
          societies={societies}
          events={upcomingSocietyEvents(events, new Date())}
        />
      </Suspense>
    </AppShell>
  );
}
