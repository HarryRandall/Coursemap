"use client";
import {
  DEFAULT_FEE_STATUS,
  FEE_STATUSES,
  feeStatusShortLabel,
  validFeeStatus,
} from "@/lib/academic/fee-status";
import { enrolmentModeForProgramme } from "@/lib/academic/enrolment-mode";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  GraduationCap,
  Plane,
  LogIn,
  Trash2,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { Field, FieldError, FieldLabel } from "@coursemap/ui/primitives/field";
import { Input } from "@coursemap/ui/primitives/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { cn } from "@/lib/cn";
import { useCoursemap, type Profile } from "@/app/providers";
import { Segmented } from "@/ui/profile/segmented";
import { SettingsRow, SettingsSection } from "@/ui/profile/settings-section";
import { CourseOfStudyCard } from "@/ui/profile/course-of-study-card";
import { ComingSoon } from "@/ui/profile/coming-soon";
import { DownloadPlanButton } from "@/ui/profile/download-plan-button";
import { NotificationSettings } from "@/ui/profile/notification-settings";
import { SecuritySettings } from "@/ui/profile/security-settings";
import { AppShell } from "@/ui/shell";
import { AccountAppearance } from "@/ui/shell/account-appearance";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { GeneratedAvatar } from "@/ui/common/generated-avatar";
import type { OnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { rulesYearForCommencement } from "@/lib/coursemap/commencement";
import { nominalProgrammeDuration } from "@/lib/coursemap/plan-timeline";
import { normaliseStudentNumber } from "@/lib/coursemap/student-number";
import { reconcileProfileDraft } from "@/lib/coursemap/profile-draft";

const sections = [
  { value: "account", label: "Account", icon: UserRound },
  { value: "study", label: "Course of study", icon: GraduationCap },
] as const;

type SectionValue = (typeof sections)[number]["value"];

/** Older links still name the personal details tab "about"; it is the account tab now. */
function sectionFromParam(value: string | null): SectionValue {
  return value === "study" ? "study" : "account";
}

/** How many past start years the profile offers besides the latest. */
const START_YEARS = 8;

export function ProfileEditorForm({
  catalogue,
}: {
  catalogue: OnboardingCatalogue;
}) {
  const { guest, leaveGuestMode, notify, ready, state, updateProfile } =
    useCoursemap();
  const searchParams = useSearchParams();
  const section = sectionFromParam(searchParams.get("tab"));
  const [form, setForm] = useState({
    profile: state.profile,
    draft: state.profile,
  });
  const { draft } = form;
  if (form.profile !== state.profile) {
    setForm({
      profile: state.profile,
      draft: reconcileProfileDraft(draft, form.profile, state.profile),
    });
  }
  const [saving, setSaving] = useState(false);
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;

  const selectSection = (value: string) => {
    const url = new URL(window.location.href);
    if (value === "account") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
  };

  const patch = (changes: Partial<Profile>) =>
    setForm((current) => ({
      ...current,
      draft: { ...current.draft, ...changes },
    }));

  const catalogueYears = catalogue.catalogueYears.map((item) => item.year);
  const latestYear = Math.max(new Date().getFullYear(), ...catalogueYears);
  const startYears = Array.from(
    { length: START_YEARS + 1 },
    (_, index) => latestYear - index,
  );
  const degrees = catalogue.degrees.filter(
    (item) => item.catalogueYear === draft.catalogueYear,
  );
  const degree = degrees.find((item) => item.code === draft.degreeCode);
  // Only structures the chosen degree publishes for the chosen year are
  // offered. The lists are short, so filtering on render is cheaper than memo.
  const offered = (codes: readonly string[] | undefined) => {
    const set = new Set(codes ?? []);
    return (item: { code: string; catalogueYear: number }) =>
      item.catalogueYear === draft.catalogueYear && set.has(item.code);
  };
  const structureOptions = {
    major: catalogue.majors.filter(offered(degree?.majorCodes)),
    minor: catalogue.minors.filter(offered(degree?.minorCodes)),
    specialisation: catalogue.specialisations.filter(
      offered(degree?.specialisationCodes),
    ),
  };
  const planningDuration = nominalProgrammeDuration(
    degree
      ? { duration: degree.durationYears, units: degree.units }
      : undefined,
  );
  const graduationYear =
    planningDuration === null
      ? null
      : draft.commencementYear + planningDuration - 1 + draft.extensionYears;

  const resetStructures = {
    majorCode: "",
    minorCodes: [],
    specialisationCodes: [],
  } satisfies Partial<Profile>;

  /**
   * Students follow the rules of the year they started, so the rules year
   * moves with the start year. A degree the new year does not publish is
   * cleared rather than kept under rules it has no version for.
   */
  const changeStartYear = (commencementYear: number) => {
    const catalogueYear =
      rulesYearForCommencement(commencementYear, catalogueYears) ??
      draft.catalogueYear;
    const kept = catalogue.degrees.some(
      (item) =>
        item.catalogueYear === catalogueYear && item.code === draft.degreeCode,
    );
    patch({
      commencementYear,
      catalogueYear,
      ...(catalogueYear === draft.catalogueYear
        ? {}
        : { degreeCode: kept ? draft.degreeCode : "", ...resetStructures }),
    });
  };

  const studentNumber = normaliseStudentNumber(draft.studentId);
  const studentNumberError =
    studentNumber === null
      ? "Use the format u1234567, or leave it blank."
      : null;
  const nameError = !draft.name.trim() ? "Add your name." : null;
  const dirty =
    ready && JSON.stringify(draft) !== JSON.stringify(state.profile);
  /** What still stops a save, and the tab where it is fixed. */
  const blocker: { message: string; section: SectionValue } | null = nameError
    ? { message: "Add your name in Account to save.", section: "account" }
    : studentNumberError
      ? { message: studentNumberError, section: "account" }
      : !draft.degreeCode
        ? { message: "Choose a degree to save.", section: "study" }
        : planningDuration === null
          ? {
              message:
                "Planning is not available for this programme yet. Your current plan is unchanged.",
              section: "study",
            }
          : null;

  async function save(event: FormEvent) {
    event.preventDefault();
    // Saving stays clickable so it can say what is missing, and opens the
    // tab where it is fixed.
    if (blocker) {
      notify(blocker.message, "warning");
      if (blocker.section !== section) selectSection(blocker.section);
      return;
    }
    setSaving(true);
    const submittedProfile = {
      ...draft,
      studentId: studentNumber ?? "",
      // Inferred from the degree rather than asked, so older profiles pick
      // it up on their next save.
      ...(degree ? { enrolmentMode: enrolmentModeForProgramme(degree) } : {}),
    };
    const result = await updateProfile(submittedProfile);
    if (result.ok) {
      setForm((current) => ({
        profile: submittedProfile,
        draft: reconcileProfileDraft(current.draft, draft, submittedProfile),
      }));
    }
    setSaving(false);
    notify(result.message, result.ok ? "success" : "error");
  }

  const tabs = (
    <TabsList aria-label="Profile sections" variant="line">
      {sections.map(({ value, label, icon: Icon }) => (
        <TabsTrigger key={value} value={value}>
          <Icon aria-hidden="true" className="hidden sm:block" size={15} />
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );

  return (
    <Tabs className="block" onValueChange={selectSection} value={section}>
      <AppShell tabs={tabs}>
        <form className="flex w-full flex-1 flex-col" onSubmit={save} noValidate>
          <h1 className="sr-only">Profile and study details</h1>

          <TabsContent value="account" className="space-y-4">
            <section
              aria-labelledby={id("details")}
              className="rounded-xl border border-border bg-card p-5 sm:p-6"
            >
              <h2 id={id("details")} className="sr-only">
                Personal details
              </h2>
              <div className="flex items-center gap-4">
                <GeneratedAvatar
                  className="size-14 text-lg"
                  email={state.profile.email}
                  name={draft.preferredName?.trim() || draft.name}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-semibold text-foreground">
                    {draft.preferredName?.trim() ||
                      draft.name.trim() ||
                      "Your name"}
                    {draft.pronouns?.trim() ? (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {draft.pronouns.trim()}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[13px] text-muted-foreground">
                    {guest
                      ? "Guest · saved in this browser"
                      : state.profile.email
                        ? `${state.profile.email} · sign-in email`
                        : "Signed in"}
                  </p>
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <ComingSoon />
                  <Button type="button" variant="outline" size="sm" disabled>
                    <Camera aria-hidden="true" />
                    Change photo
                  </Button>
                </div>
              </div>
              <div className="mt-6 grid gap-x-4 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
                <Field data-invalid={Boolean(nameError && dirty) || undefined}>
                  <FieldLabel htmlFor={id("name")}>Name</FieldLabel>
                  <Input
                    aria-invalid={Boolean(nameError && dirty) || undefined}
                    autoComplete="name"
                    id={id("name")}
                    onChange={(event) => patch({ name: event.target.value })}
                    value={draft.name}
                  />
                  {nameError && dirty ? (
                    <FieldError>{nameError}</FieldError>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel htmlFor={id("preferred-name")}>
                    Preferred name
                  </FieldLabel>
                  <Input
                    autoComplete="nickname"
                    id={id("preferred-name")}
                    maxLength={80}
                    onChange={(event) =>
                      patch({ preferredName: event.target.value })
                    }
                    placeholder="What Coursemap calls you"
                    value={draft.preferredName ?? ""}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={id("pronouns")}>Pronouns</FieldLabel>
                  <Input
                    id={id("pronouns")}
                    maxLength={40}
                    onChange={(event) =>
                      patch({ pronouns: event.target.value })
                    }
                    placeholder="she/her"
                    value={draft.pronouns ?? ""}
                  />
                </Field>
                <Field data-invalid={Boolean(studentNumberError) || undefined}>
                  <FieldLabel htmlFor={id("student-number")}>
                    ANU student number
                  </FieldLabel>
                  <Input
                    aria-invalid={Boolean(studentNumberError) || undefined}
                    autoComplete="off"
                    id={id("student-number")}
                    onChange={(event) =>
                      patch({ studentId: event.target.value })
                    }
                    placeholder="Optional"
                    value={draft.studentId}
                  />
                  {studentNumberError ? (
                    <FieldError>{studentNumberError}</FieldError>
                  ) : null}
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor={id("college")}>
                    Residential college <ComingSoon />
                  </FieldLabel>
                  <Input disabled id={id("college")} placeholder="None" />
                </Field>
              </div>
            </section>
            {guest ? (
              <SettingsSection
                title="Guest plan"
                description="Your plan is saved in this browser's cookies, so it is only here."
              >
                <SettingsRow
                  label="Keep it everywhere"
                  description="Create an account and your plan moves into it automatically."
                >
                  <div className="flex flex-wrap gap-2">
                    <Button asChild>
                      <Link href="/signup">
                        <UserPlus aria-hidden="true" />
                        Create an account
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/login">
                        <LogIn aria-hidden="true" />
                        Sign in
                      </Link>
                    </Button>
                  </div>
                </SettingsRow>
              </SettingsSection>
            ) : null}
            {guest ? null : <SecuritySettings logoutFormId="profile-logout" />}
            {guest ? null : <NotificationSettings />}

            <div className="grid gap-4 sm:grid-cols-2">
              {guest ? null : (
                <section className="rounded-xl border border-border bg-card p-5">
                  <h2 className="text-sm font-semibold text-foreground">
                    Theme
                  </h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Light, dark or your system&apos;s.
                  </p>
                  <div className="mt-3">
                    <AccountAppearance />
                  </div>
                </section>
              )}
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  Your data
                </h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Your profile, courses and choices as a file.
                </p>
                <div className="mt-3">
                  <DownloadPlanButton />
                </div>
              </section>
            </div>

            {guest ? (
              <SettingsSection
                title="Danger zone"
                className="border-destructive/40"
              >
                <SettingsRow
                  label="Leave guest mode"
                  description="Deletes the plan saved in this browser."
                >
                  <ConfirmDialog
                    title="Delete your guest plan?"
                    description="Your degree, courses and stars in this browser are removed. This cannot be undone."
                    confirmLabel="Delete plan"
                    destructive
                    onConfirm={leaveGuestMode}
                    trigger={
                      <Button type="button" variant="destructive">
                        <Trash2 aria-hidden="true" />
                        Leave guest mode
                      </Button>
                    }
                  />
                </SettingsRow>
              </SettingsSection>
            ) : (
              <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/40 bg-card p-5">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    Delete account <ComingSoon />
                  </h2>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    Removes your account, plan and results for good.
                  </p>
                </div>
                <Button type="button" variant="destructive" disabled>
                  <Trash2 aria-hidden="true" />
                  Delete account
                </Button>
              </section>
            )}
          </TabsContent>

          <TabsContent value="study" className="space-y-4">
            <CourseOfStudyCard
              degree={degree}
              degrees={degrees}
              options={structureOptions}
              selection={{
                majorCode: draft.majorCode,
                minorCodes: draft.minorCodes,
                specialisationCodes: draft.specialisationCodes,
              }}
              commencementYear={draft.commencementYear}
              startYears={startYears}
              graduationYear={graduationYear}
              planningDuration={planningDuration}
              onStartYearChange={changeStartYear}
              onDegreeChange={(degreeCode) => {
                const next = degrees.find((item) => item.code === degreeCode);
                patch({
                  degreeCode,
                  ...resetStructures,
                  ...(next
                    ? { enrolmentMode: enrolmentModeForProgramme(next) }
                    : {}),
                });
              }}
              onSelectionChange={patch}
            />

            <section aria-labelledby={id("pattern")}>
              <h2 id={id("pattern")} className="sr-only">
                Study pattern
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Study load
                  </p>
                  <Segmented
                    stretch
                    label="Study load"
                    options={[
                      { value: "Full time", label: "Full time" },
                      { value: "Part time", label: "Part time" },
                    ]}
                    value={draft.studyLoad}
                    onChange={(studyLoad) => patch({ studyLoad })}
                  />
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Fee status · prices your tuition estimate
                  </p>
                  <Segmented
                    stretch
                    label="Fee status"
                    options={FEE_STATUSES.map((value) => ({
                      value,
                      label: feeStatusShortLabel(value),
                    }))}
                    value={draft.feeStatus ?? DEFAULT_FEE_STATUS}
                    onChange={(value) =>
                      patch({
                        feeStatus: validFeeStatus(value) ? value : null,
                      })
                    }
                  />
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs text-muted-foreground">
                    Expected to finish
                  </p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {graduationYear
                      ? `End of ${graduationYear}`
                      : "Choose a degree"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Add years in the planner if you need longer.
                  </p>
                </div>
                <div className="rounded-xl border border-dashed border-border bg-card p-5">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    Study abroad <ComingSoon />
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Plan a semester away that counts towards your degree.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled
                    className="mt-3"
                  >
                    <Plane aria-hidden="true" />
                    Add a semester away
                  </Button>
                </div>
              </div>
            </section>
          </TabsContent>

          {dirty ? (
            <div
              data-page-actions
              className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6"
              role="status"
            >
              <p
                className={cn(
                  "text-[13px]",
                  blocker
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground",
                )}
              >
                {blocker?.message ?? "Unsaved changes"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  disabled={saving}
                  onClick={() =>
                    setForm({ profile: state.profile, draft: state.profile })
                  }
                  type="button"
                  variant="ghost"
                >
                  Discard
                </Button>
                <Button disabled={!ready || saving} type="submit">
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </div>
          ) : null}
        </form>
        {guest ? null : (
          <form
            action="/auth/logout"
            hidden
            id="profile-logout"
            method="post"
          />
        )}
      </AppShell>
    </Tabs>
  );
}
