"use client";

import { useCoursemap } from "@/app/providers";
import type { OnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { ProfileEditorForm } from "./profile-editor-form";

export function ProfileEditor({
  catalogue,
}: {
  catalogue: OnboardingCatalogue;
}) {
  const { ready, guest, state } = useCoursemap();
  if (!ready) return null;
  return (
    <ProfileEditorForm
      key={JSON.stringify([guest, state.profile.email, state.planId])}
      catalogue={catalogue}
    />
  );
}
