import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { BrandMark } from "@/ui/brand-mark";

/** Mirrors the onboarding flow: the question on the left and the plan preview on the right. */
export default function OnboardingLoading() {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <span className="sr-only">Loading onboarding</span>
      <div
        aria-busy="true"
        className="flex min-w-0 flex-col px-4 py-5 sm:px-10 sm:py-8"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BrandMark className="size-8" />
            <strong className="brand-wordmark text-lg">coursemap</strong>
          </div>
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center py-10 sm:py-16">
          <Skeleton className="h-1 w-full rounded-full" />
          <Skeleton className="mt-3 h-3 w-24" />
          <Skeleton className="mt-10 h-10 w-80 max-w-full" />
          <div className="mt-8 space-y-5">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index}>
                <Skeleton className="mb-2 h-3 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
          <div className="mt-10 flex justify-end">
            <Skeleton className="h-9 w-28 rounded-md" />
          </div>
        </div>
      </div>
      <div className="hidden items-center justify-center border-l border-border bg-muted/40 px-10 lg:flex">
        <Skeleton className="h-80 w-full max-w-md rounded-lg" />
      </div>
    </main>
  );
}
