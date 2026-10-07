import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { TabsLoading } from "@/ui/common/tabs-loading";

/**
 * The requirements page in outline, for loading. Behind an empty tab only
 * the rule cards are drawn, because the page's own header is already there.
 */
export function RequirementsSkeleton({
  rulesOnly = false,
}: {
  rulesOnly?: boolean;
}) {
  return (
    <div className="space-y-5">
      {rulesOnly ? null : (
        <>
          <div className="space-y-6 rounded-2xl border border-border bg-card p-8">
            <Skeleton className="h-4 w-56 max-w-full" />
            <div className="flex flex-wrap items-center gap-6">
              <Skeleton className="size-28 rounded-full" />
              <div className="min-w-0 space-y-3">
                <Skeleton className="h-9 w-64 max-w-full" />
                <Skeleton className="h-4 w-56 max-w-full" />
              </div>
            </div>
          </div>
          <TabsLoading widths={["w-12", "w-12", "w-12", "w-24"]} />
        </>
      )}
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="space-y-3 rounded-xl border border-border bg-card p-5"
        >
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-56 max-w-full" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-3 w-40 max-w-full" />
        </div>
      ))}
    </div>
  );
}
