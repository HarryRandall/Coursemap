import { PlanningCatalogueError } from "@/ui/plan/planning-catalogue-error";
import { loadOnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { ProfileEditor } from "./profile-editor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  let catalogue;
  try {
    catalogue = await loadOnboardingCatalogue();
  } catch {
    return <PlanningCatalogueError pageTitle="Profile" retryHref="/profile" />;
  }
  return <ProfileEditor catalogue={catalogue} />;
}
