import { Card } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { AppShell } from "@/ui/shell";
import { TabsLoading } from "@/ui/common/tabs-loading";

/** The profile's personal details and photo cards in outline. */
export default function ProfileLoading() {
  return (
    <AppShell loading tabs={<TabsLoading widths={["w-16", "w-24", "w-14"]} />}>
      <div aria-busy="true" className="w-full">
        <span className="sr-only">Loading profile and study details</span>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card className="min-w-0 gap-0 p-0">
            <Skeleton className="m-5 h-4 w-32" />
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="grid gap-3 border-t border-border px-5 py-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-8"
              >
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-40 max-w-full" />
                </div>
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </Card>
          <div className="space-y-6">
            <Card className="items-center gap-3 p-6">
              <Skeleton className="size-20 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-8 w-28" />
            </Card>
            <Card className="gap-4 p-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
