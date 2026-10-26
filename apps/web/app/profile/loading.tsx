import { Card } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { AppShell } from "@/ui/shell";
import { TabsLoading } from "@/ui/common/tabs-loading";

/** The profile's account tab in outline: the identity card, then its settings. */
export default function ProfileLoading() {
  return (
    <AppShell loading tabs={<TabsLoading widths={["w-16", "w-28"]} />}>
      <div aria-busy="true" className="w-full space-y-4">
        <span className="sr-only">Loading profile and study details</span>
        <Card className="@container min-w-0 gap-0 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="size-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <div className="mt-6 grid gap-x-4 gap-y-5 @lg:grid-cols-2 @4xl:grid-cols-4">
            {[0, 1, 2, 3].map((field) => (
              <div key={field} className="space-y-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="min-w-0 gap-3 p-5">
            <Skeleton className="h-4 w-16" />
            <div className="flex gap-1.5">
              <Skeleton className="size-8" />
              <Skeleton className="size-8" />
              <Skeleton className="size-8" />
            </div>
          </Card>
          <Card className="min-w-0 gap-3 p-5">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-48 max-w-full" />
            <Skeleton className="h-8 w-28" />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
