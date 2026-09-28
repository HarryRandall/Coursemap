import { Suspense } from "react";
import { notFound } from "next/navigation";
import { loadSocieties } from "@/lib/societies-data";
import { upcomingSocietyEvents } from "@/lib/society-events";
import { AppShell } from "@/ui/shell/app-shell";
import { SocietyProfile } from "@/ui/societies/society-profile";

export const dynamic = "force-dynamic";

export default async function SocietyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const initialQuery = new URLSearchParams();
  const tab = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  if (tab) initialQuery.set("tab", tab);
  const { societies, events } = await loadSocieties();
  const society = societies.find((item) => item.slug === slug);
  if (!society) notFound();
  const now = new Date();
  const upcoming = upcomingSocietyEvents(events, now, slug);
  const past = events
    .filter(
      (event) => event.societySlug === slug && new Date(event.endsAt) <= now,
    )
    .sort(
      (a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(),
    );
  return (
    <AppShell fill currentBreadcrumbLabel={society.shortName}>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">Loading club...</p>
        }
      >
        <SocietyProfile
          initialQuery={initialQuery.toString()}
          society={society}
          upcoming={upcoming}
          past={past}
        />
      </Suspense>
    </AppShell>
  );
}
