import { Card } from "@coursemap/ui/primitives/card";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { TabsLoading } from "@/ui/common/tabs-loading";
import { AppShell } from "@/ui/shell";

export default function StructureLoading() {
  return (
    <AppShell
      loading
      tabs={<TabsLoading widths={["w-16", "w-24", "w-20"]} className="gap-4" />}
    >
      <div aria-busy="true" className="space-y-4">
        <span className="sr-only">Loading programme</span>
        <div className="space-y-3 pb-5">
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
          <div className="space-y-4">
            {[0, 1].map((index) => (
              <Card key={index} className="min-w-0 gap-5 p-5">
                <Skeleton className="h-4 w-36" />
                <div className="space-y-3">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </Card>
            ))}
          </div>
          <Card className="min-w-0 gap-5 p-5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-32 w-full" />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
