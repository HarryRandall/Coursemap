import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { BrandMark } from "@/ui/brand-mark";

/** Mirrors the onboarding flow: brand header, the question card and the plan summary. */
export default function OnboardingLoading() {
  return (
    <main className="landing-mesh min-h-dvh px-4 py-6 sm:px-6 sm:py-8">
      <span className="sr-only">Loading onboarding</span>
      <div
        aria-busy="true"
        className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4"
      >
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-9" />
          <strong className="brand-wordmark text-lg">coursemap</strong>
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      <div className="mx-auto mt-8 grid w-full max-w-5xl gap-6 sm:mt-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
        <div className="mx-auto w-full max-w-xl rounded-3xl border bg-card p-6 shadow-sm sm:p-9">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-1.5 w-full rounded-full" />
          <Skeleton className="mt-8 h-8 w-72 max-w-full" />
          <div className="mt-6 space-y-5">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index}>
                <Skeleton className="mb-2 h-3 w-24" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
          <div className="mt-8 flex justify-end">
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
        <Skeleton className="hidden h-72 rounded-2xl lg:block" />
      </div>
    </main>
  );
}
