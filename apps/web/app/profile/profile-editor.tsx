"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarClock,
  GraduationCap,
  LogOut,
  Save,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@coursemap/ui/primitives/field";
import { Input } from "@coursemap/ui/primitives/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import { useCoursemap, type Profile } from "@/app/providers";
import { StructureMultiSelect } from "@/ui/profile/structure-multi-select";
import { AppShell } from "@/ui/shell";
import { GeneratedAvatar } from "@/ui/common/generated-avatar";
import { SelectField } from "@/ui/common/select-field";
import type { OnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { nominalProgrammeDuration } from "@/lib/coursemap/plan-timeline";
import { normaliseStudentNumber } from "@/lib/coursemap/student-number";

const sections = [
  { value: "about", label: "About you", icon: UserRound },
  { value: "study", label: "Course of study", icon: GraduationCap },
  { value: "account", label: "Account", icon: CalendarClock },
] as const;

type SectionValue = (typeof sections)[number]["value"];

function sectionFromParam(value: string | null): SectionValue {
  return sections.some((section) => section.value === value)
    ? (value as SectionValue)
    : "about";
}

const studyLoads = [
  { value: "Full time", label: "Full time" },
  { value: "Part time", label: "Part time" },
] as const;

function structureLabel(item: { code: string; name: string }) {
  return `${item.name} (${item.code})`;
}

export function ProfileEditor({
  catalogue,
}: {
  catalogue: OnboardingCatalogue;
}) {
  const { notify, ready, state, updateProfile } = useCoursemap();
  const searchParams = useSearchParams();
  const section = sectionFromParam(searchParams.get("tab"));
  const [draft, setDraft] = useState<Profile>(state.profile);
  const [saving, setSaving] = useState(false);

  // The server-backed profile arrives after hydration; adopt it once ready and
  // whenever a save lands so the form never shows stale values.
  useEffect(() => {
    if (!ready) return;
    window.queueMicrotask(() => setDraft(state.profile));
  }, [ready, state.profile]);

  const selectSection = (value: string) => {
    const url = new URL(window.location.href);
    if (value === "about") url.searchParams.delete("tab");
    else url.searchParams.set("tab", value);
    window.history.pushState(null, "", url.pathname + url.search + url.hash);
  };

  const patch = (changes: Partial<Profile>) =>
    setDraft((current) => ({ ...current, ...changes }));

  /* ---------------------------------------------------------------- */
  /* Catalogue-derived options                                         */
  /* ---------------------------------------------------------------- */

  const catalogueYears = catalogue.catalogueYears.map((item) => item.year);
  const degrees = useMemo(
    () =>
      catalogue.degrees.filter(
        (item) => item.catalogueYear === draft.catalogueYear,
      ),
    [catalogue.degrees, draft.catalogueYear],
  );
  const degree = useMemo(
    () => degrees.find((item) => item.code === draft.degreeCode),
    [degrees, draft.degreeCode],
  );
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
  const commencementYears = useMemo(() => {
    if (planningDuration === null) return [];
    const selectedYear =
      draft.catalogueYear || catalogueYears[0] || new Date().getFullYear();
    return Array.from(
      { length: planningDuration },
      (_, index) => selectedYear - index,
    );
  }, [catalogueYears, draft.catalogueYear, planningDuration]);

  /* ---------------------------------------------------------------- */
  /* Validation and save                                               */
  /* ---------------------------------------------------------------- */

  const studentNumber = normaliseStudentNumber(draft.studentId);
  const studentNumberError =
    studentNumber === null
      ? "Use the format u1234567, or leave it blank."
      : null;
  const nameError = !draft.name.trim() ? "Add your name." : null;
  const dirty =
    ready && JSON.stringify(draft) !== JSON.stringify(state.profile);
  const canSave =
    ready &&
    !saving &&
    !nameError &&
    !studentNumberError &&
    Boolean(draft.degreeCode) &&
    planningDuration !== null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (nameError || !draft.degreeCode) {
      notify("Add your name and degree before saving", "warning");
      return;
    }
    if (studentNumberError) {
      notify(studentNumberError, "warning");
      return;
    }
    if (planningDuration === null) {
      notify(
        "Planning is not available for this programme yet. Your current plan is unchanged.",
        "warning",
      );
      return;
    }
    setSaving(true);
    const result = await updateProfile({
      ...draft,
      studentId: studentNumber ?? "",
    });
    setSaving(false);
    notify(result.message, result.ok ? "success" : "error");
  }

  const major = majors.find((item) => item.code === draft.majorCode);

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
        <form className="mx-auto w-full" onSubmit={save} noValidate>
          <h1 className="sr-only">Profile and study details</h1>

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0">
              {/* -------------------------------------------------- */}
              {/* About you                                          */}
              {/* -------------------------------------------------- */}
              <TabsContent value="about">
                <Card>
                  <CardHeader className="border-b border-border/60">
                    <CardTitle>
                      <h2>About you</h2>
                    </CardTitle>
                    <CardDescription>
                      Shown on your plan and to administrators who help you.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
                    <Field className="gap-2 sm:col-span-2">
                      <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                      <Input
                        aria-invalid={Boolean(nameError && dirty) || undefined}
                        autoComplete="name"
                        id="profile-name"
                        onChange={(event) =>
                          patch({ name: event.target.value })
                        }
                        value={draft.name}
                      />
                      {nameError && dirty ? (
                        <FieldError>{nameError}</FieldError>
                      ) : null}
                    </Field>
                    <Field className="gap-2">
                      <FieldLabel htmlFor="profile-student-number">
                        Student number
                      </FieldLabel>
                      <Input
                        aria-invalid={Boolean(studentNumberError) || undefined}
                        autoComplete="off"
                        id="profile-student-number"
                        inputMode="text"
                        onChange={(event) =>
                          patch({ studentId: event.target.value })
                        }
                        placeholder="u1234567"
                        value={draft.studentId}
                      />
                      {studentNumberError ? (
                        <FieldError>{studentNumberError}</FieldError>
                      ) : (
                        <FieldDescription>Optional.</FieldDescription>
                      )}
                    </Field>
                    <SelectField
                      items={studyLoads}
                      label="Study load"
                      onValueChange={(studyLoad) => patch({ studyLoad })}
                      searchable={false}
                      value={draft.studyLoad}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* -------------------------------------------------- */}
              {/* Course of study                                     */}
              {/* -------------------------------------------------- */}
              <TabsContent value="study">
                <Card>
                  <CardHeader className="border-b border-border/60">
                    <CardTitle>
                      <h2>Course of study</h2>
                    </CardTitle>
                    <CardDescription>
                      Changing the degree resets the major, minors and
                      specialisations.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
                    <SelectField
                      items={catalogueYears.map((year) => ({
                        value: year,
                        label: `${year} catalogue`,
                      }))}
                      label="Catalogue year"
                      description="Your requirements follow the catalogue year you started under."
                      onValueChange={(catalogueYear) => {
                        const nextDegree = catalogue.degrees.find(
                          (item) => item.catalogueYear === catalogueYear,
                        );
                        patch({
                          catalogueYear,
                          degreeCode: nextDegree?.code ?? "",
                          majorCode: "",
                          minorCodes: [],
                          specialisationCodes: [],
                        });
                      }}
                      searchable={false}
                      value={draft.catalogueYear}
                    />
                    <SelectField
                      items={degrees.map((item) => ({
                        value: item.code,
                        label: structureLabel(item),
                      }))}
                      label="Degree"
                      onValueChange={(degreeCode) =>
                        patch({
                          degreeCode,
                          majorCode: "",
                          minorCodes: [],
                          specialisationCodes: [],
                        })
                      }
                      value={draft.degreeCode}
                    />
                    <SelectField
                      description="Optional."
                      disabled={majors.length === 0}
                      items={[
                        { value: "", label: "Choose later" },
                        ...majors.map((item) => ({
                          value: item.code,
                          label: structureLabel(item),
                        })),
                      ]}
                      label="Major"
                      onValueChange={(majorCode) => patch({ majorCode })}
                      value={draft.majorCode}
                    />
                    <SelectField
                      disabled={planningDuration === null}
                      items={commencementYears.map((year) => ({
                        value: year,
                        label: String(year),
                      }))}
                      label="When did you start this degree?"
                      onValueChange={(commencementYear) =>
                        patch({ commencementYear })
                      }
                      searchable={false}
                      value={draft.commencementYear}
                    />
                    {minors.length > 0 ? (
                      <StructureMultiSelect
                        className="sm:col-span-2"
                        hint="Optional. Select every minor included in this plan."
                        label="Minors"
                        onChange={(minorCodes) => patch({ minorCodes })}
                        options={minors}
                        value={draft.minorCodes}
                      />
                    ) : null}
                    {specialisations.length > 0 ? (
                      <StructureMultiSelect
                        className="sm:col-span-2"
                        hint="Optional. Select every specialisation included in this plan."
                        label="Specialisations"
                        onChange={(specialisationCodes) =>
                          patch({ specialisationCodes })
                        }
                        options={specialisations}
                        value={draft.specialisationCodes}
                      />
                    ) : null}
                    {degree && planningDuration === null ? (
                      <Alert className="sm:col-span-2" variant="warning">
                        <TriangleAlert aria-hidden="true" />
                        <AlertDescription>
                          Planning is not available for this programme yet. Your
                          current plan is unchanged.
                        </AlertDescription>
                      </Alert>
                    ) : null}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* -------------------------------------------------- */}
              {/* Account                                             */}
              {/* -------------------------------------------------- */}
              <TabsContent value="account">
                <Card>
                  <CardHeader className="border-b border-border/60">
                    <CardTitle>
                      <h2>Account</h2>
                    </CardTitle>
                    <CardDescription>
                      {"Signed in with email and password."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
                    <Field className="gap-2 sm:col-span-2">
                      <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                      <Input
                        id="profile-email"
                        readOnly
                        value={state.profile.email || "Not available"}
                      />
                      <FieldDescription>
                        Your sign-in email cannot be changed here.
                      </FieldDescription>
                    </Field>
                    <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                      {
                        // Associated with the standalone logout form below so
                        // it never submits the profile form it sits inside.
                        <Button
                          form="profile-logout"
                          type="submit"
                          variant="outline"
                        >
                          <LogOut aria-hidden="true" size={15} />
                          Sign out
                        </Button>
                      }
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>

            {/* ---------------------------------------------------- */}
            {/* Summary rail                                           */}
            {/* ---------------------------------------------------- */}
            <aside
              aria-label="Profile summary"
              className="space-y-4 lg:sticky lg:top-6"
            >
              <Card>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-3">
                    <GeneratedAvatar
                      className="size-12 text-sm"
                      email={state.profile.email}
                      name={draft.name}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-foreground">
                        {draft.name.trim() || "Your name"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {studentNumber ||
                          state.profile.email ||
                          "No student number"}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-5 space-y-3 text-sm">
                    <SummaryRow label="Degree">
                      {degree ? structureLabel(degree) : "Not selected"}
                    </SummaryRow>
                    <SummaryRow label="Major">
                      {major ? major.name : "Choose later"}
                    </SummaryRow>
                    {draft.minorCodes.length > 0 ? (
                      <SummaryRow label="Minors">
                        {minors
                          .filter((item) =>
                            draft.minorCodes.includes(item.code),
                          )
                          .map((item) => item.name)
                          .join(", ")}
                      </SummaryRow>
                    ) : null}
                    {draft.specialisationCodes.length > 0 ? (
                      <SummaryRow label="Specialisations">
                        {specialisations
                          .filter((item) =>
                            draft.specialisationCodes.includes(item.code),
                          )
                          .map((item) => item.name)
                          .join(", ")}
                      </SummaryRow>
                    ) : null}
                    <SummaryRow label="Rules year">
                      {draft.catalogueYear} catalogue
                    </SummaryRow>
                    <SummaryRow label="Started">
                      {draft.commencementYear} · {draft.studyLoad}
                    </SummaryRow>
                    <SummaryRow label="Timeline">
                      {planningDuration === null
                        ? "Not available"
                        : `${planningDuration} year${planningDuration === 1 ? "" : "s"}${
                            degree?.units ? ` · ${degree.units} units` : ""
                          }`}
                    </SummaryRow>
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href="/plan">Open plan</Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href="/requirements">Requirements</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </aside>
          </div>

          {/* ------------------------------------------------------ */}
          {/* Save bar: pinned to the viewport while there is a change */}
          {/* ------------------------------------------------------ */}
          {dirty ? (
            <div
              className="sticky bottom-4 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/80"
              role="status"
            >
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="warning-light">Unsaved changes</Badge>
                <span className="hidden text-muted-foreground sm:inline">
                  Changes apply to your plan timeline and requirements.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  disabled={saving}
                  onClick={() => setDraft(state.profile)}
                  type="button"
                  variant="ghost"
                >
                  Discard
                </Button>
                <Button disabled={!canSave} type="submit">
                  <Save aria-hidden="true" size={15} />
                  {saving ? "Saving…" : "Save details"}
                </Button>
              </div>
            </div>
          ) : null}
        </form>
        {
          <form
            action="/auth/logout"
            hidden
            id="profile-logout"
            method="post"
          />
        }
      </AppShell>
    </Tabs>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-foreground">
        {children}
      </dd>
    </div>
  );
}
