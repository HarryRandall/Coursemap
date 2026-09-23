import { Button } from "@coursemap/ui/primitives/button";
import Link from "next/link";
import { ErrorPageLayout } from "@/ui/common/error-page-layout";
import { ErrorState } from "@/ui/common/error-state";
import { redirect } from "next/navigation";
import { getAuthViewer } from "@/lib/auth/viewer";
import { loadOnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { hasPrimaryPlan } from "@/lib/coursemap/state";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const viewer = await getAuthViewer();
  if (!viewer) redirect("/login?next=%2Fonboarding");
  if (await hasPrimaryPlan(viewer)) redirect("/dashboard");

  let catalogue;
  try {
    catalogue = await loadOnboardingCatalogue();
  } catch {
    return (
      <ErrorPageLayout>
        <ErrorState
          title="We couldn't load your degree choices"
          description="The planning catalogue is temporarily unavailable. Try again, or head home and choose your degree later."
        >
          <Button asChild>
            <Link href="/onboarding">Try again</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to home</Link>
          </Button>
        </ErrorState>
      </ErrorPageLayout>
    );
  }

  return (
    <OnboardingForm
      catalogue={catalogue}
      currentYear={new Date().getFullYear()}
      email={viewer.email ?? ""}
    />
  );
}
