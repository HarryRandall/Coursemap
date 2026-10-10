"use client";
import {
  ENROLMENT_MODES,
  enrolmentModeLabel,
  validEnrolmentMode,
} from "@/lib/academic/enrolment-mode";

import { useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Camera,
  GraduationCap,
  KeyRound,
  LogIn,
  LogOut,
  MonitorSmartphone,
  Settings2,
  Trash2,
  TriangleAlert,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import { Input } from "@coursemap/ui/primitives/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { cn } from "@/lib/cn";
import { useCoursemap, type Profile } from "@/app/providers";
import { ComingSoon } from "@/ui/profile/coming-soon";
import { Segmented } from "@/ui/profile/segmented";
import { SettingsRow, SettingsSection } from "@/ui/profile/settings-section";
import { StructureCardGrid } from "@/ui/profile/structure-card-grid";
import { DegreePickerDialog } from "@/ui/profile/degree-picker-dialog";
import { DownloadPlanButton } from "@/ui/profile/download-plan-button";
import { AppShell } from "@/ui/shell";
import { AccountAppearance } from "@/ui/shell/account-appearance";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { GeneratedAvatar } from "@/ui/common/generated-avatar";
import { OptionPicker } from "@/ui/common/option-picker";
import type { OnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { CATALOGUE_KIND_LABELS } from "@/lib/coursemap/catalogue-kinds";
import { rulesYearForCommencement } from "@/lib/coursemap/commencement";
import { nominalProgrammeDuration } from "@/lib/coursemap/plan-timeline";
import { normaliseStudentNumber } from "@/lib/coursemap/student-number";

const sections = [
  { value: "about", label: "About you", icon: UserRound },
  { value: "study", label: "Course of study", icon: GraduationCap },
  { value: "account", label: "Account", icon: Settings2 },
] as const;

type SectionValue = (typeof sections)[number]["value"];

function sectionFromParam(value: string | null): SectionValue {
  return sections.some((section) => section.value === value)
    ? (value as SectionValue)
    : "about";
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
  const [draft, setDraft] = useState<Profile>(state.profile);
  const [saving, setSaving] = useState(false);
  const [choosingDegree, setChoosingDegree] = useState(false);
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;

  const selectSection = (value: string) => {
    const url = new URL(window.location.href);
    if (value === "about") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
  };

  const patch = (changes: Partial<Profile>) =>
    setDraft((current) => ({ ...current, ...changes }));

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
  const majors = catalogue.majors.filter(offered(degree?.majorCodes));
  const minors = catalogue.minors.filter(offered(degree?.minorCodes));
  const specialisations = catalogue.specialisations.filter(
    offered(degree?.specialisationCodes),
  );
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
    ? { message: "Add your name in About you to save.", section: "about" }
    : studentNumberError
      ? { message: studentNumberError, section: "about" }
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
    const result = await updateProfile({
      ...draft,
      studentId: studentNumber ?? "",
    });
    if (result.ok) {
      setDraft((current) =>
        current.studentId === draft.studentId
          ? { ...current, studentId: studentNumber ?? "" }
          : current,
      );
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
        <form className="w-full" onSubmit={save} noValidate>
          <h1 className="sr-only">Profile and study details</h1>

          <TabsContent value="about" className="space-y-6">
            <SettingsSection title="Personal details">
              <div className="flex flex-wrap items-center gap-4 px-5 py-5">
                <GeneratedAvatar
                  className="size-16 text-lg"
                  email={state.profile.email}
                  name={draft.name}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">
                    {draft.preferredName?.trim() ||
                      draft.name.trim() ||
                      "Your name"}
                    {draft.pronouns?.trim() ? (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {draft.pronouns.trim()}
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {guest
                      ? "Guest · saved in this browser"
                      : studentNumber || state.profile.email}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Button type="button" variant="outline" size="sm" disabled>
                    <Camera aria-hidden="true" />
                    Upload photo
                  </Button>
                  <ComingSoon />
                </div>
              </div>
              <SettingsRow
                label="Name"
                description="Shown on your plan and to advisers who help you."
                htmlFor={id("name")}
              >
                <Input
                  aria-invalid={Boolean(nameError && dirty) || undefined}
                  autoComplete="name"
                  id={id("name")}
                  onChange={(event) => patch({ name: event.target.value })}
                  value={draft.name}
                />
                {nameError && dirty ? (
                  <p className="text-xs text-destructive">{nameError}</p>
                ) : null}
              </SettingsRow>
              <SettingsRow
                label="Preferred name"
                description="What Coursemap calls you, if not your full name."
                htmlFor={id("preferred-name")}
              >
                <Input
                  autoComplete="nickname"
                  id={id("preferred-name")}
                  maxLength={80}
                  onChange={(event) =>
                    patch({ preferredName: event.target.value })
                  }
                  value={draft.preferredName ?? ""}
                />
              </SettingsRow>
              <SettingsRow
                label="Pronouns"
                description="Shown to advisers who help you."
                htmlFor={id("pronouns")}
              >
                <Input
                  id={id("pronouns")}
                  maxLength={40}
                  onChange={(event) => patch({ pronouns: event.target.value })}
                  placeholder="e.g. she/her"
                  value={draft.pronouns ?? ""}
                />
              </SettingsRow>
              <SettingsRow
                label="Student number"
                description="Optional."
                htmlFor={id("student-number")}
              >
                <Input
                  aria-invalid={Boolean(studentNumberError) || undefined}
                  autoComplete="off"
                  id={id("student-number")}
                  onChange={(event) => patch({ studentId: event.target.value })}
                  placeholder="u1234567"
                  value={draft.studentId}
                />
                {studentNumberError ? (
                  <p className="text-xs text-destructive">
                    {studentNumberError}
                  </p>
                ) : null}
              </SettingsRow>
              <SettingsRow label="Email">
                <p className="truncate text-[13px] text-foreground">
                  {guest
                    ? "No account yet"
                    : state.profile.email || "Not available"}
                </p>
              </SettingsRow>
            </SettingsSection>
            <SettingsSection title="At ANU">
              <SettingsRow
                label="Expected to finish"
                description="From when you started and your degree's length."
              >
                <p className="text-[13px] text-foreground">
                  {graduationYear === null
                    ? "Choose a degree first"
                    : `End of ${graduationYear}`}
                </p>
              </SettingsRow>
              <SettingsRow label="Residential college">
                <Input disabled aria-label="Residential college" />
                <ComingSoon />
              </SettingsRow>
            </SettingsSection>
          </TabsContent>

          <TabsContent value="study" className="space-y-6">
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Your degree
                  </p>
                  <h2 className="text-xl leading-tight font-semibold text-foreground">
                    {degree?.name ?? "Choose your degree"}
                  </h2>
                  {degree ? null : (
                    <p className="max-w-xl text-[13px] leading-relaxed text-muted-foreground">
                      Your requirements, planner and progress all follow the
                      degree you choose.
                    </p>
                  )}
                  {degree ? (
                    <p className="font-mono text-xs text-muted-foreground">
                      {degree.code}
                      {planningDuration !== null
                        ? ` · ${planningDuration} ${planningDuration === 1 ? "year" : "years"}`
                        : ""}
                      {degree.units ? ` · ${degree.units} units` : ""}
                    </p>
                  ) : null}
                  {degree?.description ? (
                    <p className="line-clamp-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
                      {degree.description}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant={degree ? "outline" : "default"}
                      onClick={() => setChoosingDegree(true)}
                    >
                      {degree ? (
                        "Change degree"
                      ) : (
                        <>
                          <GraduationCap aria-hidden="true" />
                          Choose a degree
                        </>
                      )}
                    </Button>
                    {degree ? (
                      <Button asChild variant="ghost">
                        <Link
                          href={`/${CATALOGUE_KIND_LABELS.programme.segment}/${degree.catalogueYear}/${encodeURIComponent(degree.code.toLowerCase())}`}
                        >
                          Explore degree
                          <ArrowUpRight aria-hidden="true" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-2 lg:items-end">
                  <label
                    htmlFor={id("commencement")}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Started
                  </label>
                  <OptionPicker
                    className="w-full lg:w-40"
                    id={id("commencement")}
                    items={startYears.map((year) => ({
                      value: String(year),
                      label: String(year),
                    }))}
                    onValueChange={(value) => changeStartYear(Number(value))}
                    searchable={false}
                    value={String(draft.commencementYear)}
                  />
                  {draft.catalogueYear !== draft.commencementYear ? (
                    <p className="max-w-56 text-[11px] leading-relaxed text-muted-foreground lg:text-right">
                      {draft.commencementYear} rules aren&apos;t in Coursemap
                      yet, so your plan uses {draft.catalogueYear}.
                    </p>
                  ) : null}
                </div>
              </div>
              {degree && planningDuration === null ? (
                <div className="px-5 pb-5">
                  <Alert variant="warning">
                    <TriangleAlert aria-hidden="true" />
                    <AlertDescription>
                      Planning is not available for this programme yet. Your
                      current plan is unchanged.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : null}
            </section>

            {majors.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Major{" "}
                  <span className="font-normal text-muted-foreground">
                    · optional, pick one
                  </span>
                </h2>
                <StructureCardGrid
                  kind="major"
                  options={majors}
                  selected={draft.majorCode ? [draft.majorCode] : []}
                  multiple={false}
                  onChange={([majorCode = ""]) => patch({ majorCode })}
                />
              </section>
            ) : null}
            {minors.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Minors{" "}
                  <span className="font-normal text-muted-foreground">
                    · optional, pick any
                  </span>
                </h2>
                <StructureCardGrid
                  kind="minor"
                  options={minors}
                  selected={draft.minorCodes}
                  multiple
                  onChange={(minorCodes) => patch({ minorCodes })}
                />
              </section>
            ) : null}
            {specialisations.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-foreground">
                  Specialisations{" "}
                  <span className="font-normal text-muted-foreground">
                    · optional, pick any
                  </span>
                </h2>
                <StructureCardGrid
                  kind="specialisation"
                  options={specialisations}
                  selected={draft.specialisationCodes}
                  multiple
                  onChange={(specialisationCodes) =>
                    patch({ specialisationCodes })
                  }
                />
              </section>
            ) : null}

            <SettingsSection title="Study pattern">
              <SettingsRow label="Study load">
                <Segmented
                  label="Study load"
                  options={[
                    { value: "Full time", label: "Full time" },
                    { value: "Part time", label: "Part time" },
                  ]}
                  value={draft.studyLoad}
                  onChange={(studyLoad) => patch({ studyLoad })}
                />
              </SettingsRow>
              <SettingsRow
                label="Enrolment mode"
                description="Some rules differ for double degrees."
              >
                <Segmented
                  label="Enrolment mode"
                  options={[
                    { value: "unknown", label: "Not specified" },
                    ...ENROLMENT_MODES.map((value) => ({
                      value,
                      label: enrolmentModeLabel(value),
                    })),
                  ]}
                  value={draft.enrolmentMode ?? "unknown"}
                  onChange={(value) =>
                    patch({
                      enrolmentMode: validEnrolmentMode(value) ? value : null,
                    })
                  }
                />
              </SettingsRow>
            </SettingsSection>
            {choosingDegree ? (
              <DegreePickerDialog
                degrees={degrees}
                selectedCode={draft.degreeCode}
                onSelect={(degreeCode) => {
                  if (degreeCode !== draft.degreeCode)
                    patch({ degreeCode, ...resetStructures });
                }}
                onClose={() => setChoosingDegree(false)}
              />
            ) : null}
          </TabsContent>

          <TabsContent value="account">
            <div className="space-y-6">
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
              ) : (
                <SettingsSection title="Sign-in and security">
                  <SettingsRow
                    label="Email"
                    description="Your sign-in email cannot be changed here."
                  >
                    <p className="truncate text-[13px] text-foreground">
                      {state.profile.email || "Not available"}
                    </p>
                  </SettingsRow>
                  <SettingsRow
                    label="Sign-in methods"
                    description="Link Google or Microsoft to sign in with them."
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Email and password</Badge>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                      >
                        Link Google
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled
                      >
                        Link Microsoft
                      </Button>
                    </div>
                    <ComingSoon />
                  </SettingsRow>
                  <SettingsRow label="Password">
                    <Button type="button" variant="outline" disabled>
                      <KeyRound aria-hidden="true" />
                      Change password
                    </Button>
                    <ComingSoon />
                  </SettingsRow>
                  <SettingsRow label="Sessions">
                    <div className="flex flex-wrap items-center gap-2">
                      {
                        // Associated with the standalone logout form below so
                        // it never submits the profile form it sits inside.
                        <Button
                          form="profile-logout"
                          type="submit"
                          variant="outline"
                        >
                          <LogOut aria-hidden="true" />
                          Sign out
                        </Button>
                      }
                      <Button type="button" variant="ghost" disabled>
                        <MonitorSmartphone aria-hidden="true" />
                        Sign out everywhere
                      </Button>
                    </div>
                    <ComingSoon />
                  </SettingsRow>
                </SettingsSection>
              )}

              <>
                {/* Guests follow the system theme, like every signed-out page. */}
                {guest ? null : (
                  <SettingsSection title="Appearance">
                    <SettingsRow
                      label="Theme"
                      description="Light, dark or your system's."
                    >
                      <AccountAppearance />
                    </SettingsRow>
                  </SettingsSection>
                )}
                <SettingsSection title="Your data">
                  <SettingsRow
                    label="Download"
                    description="Your profile, courses and choices as a file."
                  >
                    <DownloadPlanButton />
                  </SettingsRow>
                </SettingsSection>
                <SettingsSection
                  title="Danger zone"
                  className="border-destructive/40"
                >
                  {guest ? (
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
                  ) : (
                    <SettingsRow
                      label="Delete account"
                      description="Removes your account, plan and recorded results for good."
                    >
                      <Button type="button" variant="destructive" disabled>
                        <Trash2 aria-hidden="true" />
                        Delete account
                      </Button>
                      <ComingSoon />
                    </SettingsRow>
                  )}
                </SettingsSection>
              </>
            </div>
          </TabsContent>

          {dirty ? (
            <div
              className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/80"
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
                  onClick={() => setDraft(state.profile)}
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
