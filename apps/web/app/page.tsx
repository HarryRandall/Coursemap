import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Skeleton } from "@coursemap/ui/primitives/skeleton";
import { LandingCampus } from "@/ui/landing/landing-campus";
import { LandingFeatureGrid } from "@/ui/landing/landing-feature-grid";
import { LandingFooter } from "@/ui/landing/landing-footer";
import { LandingHeader } from "@/ui/landing/landing-header";
import { LandingHelp } from "@/ui/landing/landing-help";
import { LandingHero } from "@/ui/landing/landing-hero";
import { LandingLiveKeyDates } from "@/ui/landing/landing-live-key-dates";
import { LandingLiveSocieties } from "@/ui/landing/landing-live-societies";
import { LandingPlanner } from "@/ui/landing/landing-planner";
import { LandingRequirements } from "@/ui/landing/landing-requirements";
import { SHOWCASE_COURSES } from "@/ui/landing/landing-showcase-courses";
import { getAuthViewer } from "@/lib/auth/viewer";
import { canberraToday } from "@/lib/coursemap/landing-data";

export default async function Home() {
  // Signed-in students go straight to the app; onboarding is offered from the
  // dashboard empty state rather than forced here.
  if (await getAuthViewer()) {
    redirect("/dashboard");
  }
  const today = canberraToday();

  // Only the sign-in check runs before the page is sent; the live calendar
  // and societies stream into their places as they load.
  return (
    <main className="landing-surface min-h-dvh bg-background">
      <LandingHeader />
      <LandingHero today={today} />
      <LandingRequirements courses={SHOWCASE_COURSES} />
      <LandingPlanner />
      <LandingFeatureGrid />
      <LandingCampus
        societies={
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <LandingLiveSocieties />
          </Suspense>
        }
        keyDates={
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <LandingLiveKeyDates today={today} />
          </Suspense>
        }
      />
      <LandingFooter />
      <LandingHelp />
    </main>
  );
}

export const dynamic = "force-dynamic";
