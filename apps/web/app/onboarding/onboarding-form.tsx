"use client";

import { Alert, AlertDescription } from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@coursemap/ui/primitives/field";
import { Input } from "@coursemap/ui/primitives/input";
import { ArrowLeft, ArrowRight, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { BrandMark } from "@/ui/brand-mark";
import { SelectField } from "@/ui/common/select-field";
import {
  ChoiceCards,
  type ChoiceCardOption,
} from "@/ui/onboarding/choice-cards";
import { OnboardingProgress } from "@/ui/onboarding/onboarding-progress";
import { OnboardingSummary } from "@/ui/onboarding/onboarding-summary";
import { StructureMultiSelect } from "@/ui/profile/structure-multi-select";
import { saveProfileAndPlan } from "@/lib/coursemap/actions";
import {
  commencementYearOptions,
  rulesYearForCommencement,
} from "@/lib/coursemap/commencement";
import type { OnboardingCatalogue } from "@/lib/coursemap/onboarding-catalogue";
import { nominalProgrammeDuration } from "@/lib/coursemap/plan-timeline";
import { normaliseStudentNumber } from "@/lib/coursemap/student-number";

type OnboardingFormProps = {
  catalogue: OnboardingCatalogue;
  currentYear: number;
  email: string;
};

const steps = [
  { id: "about", label: "About you", title: "What should we call you?" },
  { id: "start", label: "Start year", title: "When did you start at ANU?" },
  { id: "degree", label: "Degree", title: "What are you studying?" },
  { id: "pace", label: "Study load", title: "How much are you taking on?" },
] as const;

type StepId = (typeof steps)[number]["id"];
type StudyLoad = "Full time" | "Part time";

const STUDY_LOADS: readonly ChoiceCardOption<StudyLoad>[] = [
  {
    value: "Full time",
    label: "Full time",
    description: "3 or 4 courses a semester",
  },
  {
    value: "Part time",
    label: "Part time",
    description: "1 or 2 courses a semester",
  },
];

/**
 * First-run flow that creates the student's primary plan. It is optional:
 * students can skip to the dashboard and set up a plan from their profile.
 */
export function OnboardingForm({
  catalogue,
  currentYear,
  email,
}: OnboardingFormProps) {
  const router = useRouter();
  const nameId = useId();
  const studentNumberId = useId();
  const messageId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const movedStep = useRef(false);

  const [stepId, setStepId] = useState<StepId>("about");
  const [name, setName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [commencementYear, setCommencementYear] = useState<number | null>(null);
  const [rulesYearOverride, setRulesYearOverride] = useState<number | null>(
    null,
  );
  const [degreeCode, setDegreeCode] = useState("");
  const [majorCode, setMajorCode] = useState("");
  const [minorCodes, setMinorCodes] = useState<string[]>([]);
  const [specialisationCodes, setSpecialisationCodes] = useState<string[]>([]);
  const [studyLoad, setStudyLoad] = useState<StudyLoad>("Full time");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const publishedYears = useMemo(
    () => catalogue.catalogueYears.map((item) => item.year),
    [catalogue.catalogueYears],
  );
  const suggestedRulesYear =
    commencementYear === null
      ? null
      : rulesYearForCommencement(commencementYear, publishedYears);
  const catalogueYear = rulesYearOverride ?? suggestedRulesYear;

  // The lists are short, so filtering on render is cheaper than memoising.
  const degrees = catalogue.degrees.filter(
    (item) => item.catalogueYear === catalogueYear,
  );
  const degree = degrees.find((item) => item.code === degreeCode);
  const offered = (codes: readonly string[] | undefined) => {
    const set = new Set(codes ?? []);
    return (item: { code: string; catalogueYear: number }) =>
      item.catalogueYear === catalogueYear && set.has(item.code);
  };
  const majors = catalogue.majors.filter(offered(degree?.majorCodes));
  const minors = catalogue.minors.filter(offered(degree?.minorCodes));
  const specialisations = catalogue.specialisations.filter(
    offered(degree?.specialisationCodes),
  );
  const major = majors.find((item) => item.code === majorCode);
  const planningAvailable =
    nominalProgrammeDuration(
      degree
        ? { duration: degree.durationYears, units: degree.units }
        : undefined,
    ) !== null;
  const studentNumberInvalid = normaliseStudentNumber(studentNumber) === null;

  const stepIndex = steps.findIndex((item) => item.id === stepId);
  const step = steps[stepIndex];
  const unavailable = publishedYears.length === 0;

  // Moving between steps replaces the form, so focus follows the new heading
  // and screen readers hear which step they are on.
  useEffect(() => {
    if (movedStep.current) headingRef.current?.focus();
  }, [stepId]);

  /** Changing the rules year or degree invalidates every structure beneath it. */
  const resetStructures = () => {
    setMajorCode("");
    setMinorCodes([]);
    setSpecialisationCodes([]);
  };

  const selectCommencementYear = (year: number) => {
    setCommencementYear(year);
    setRulesYearOverride(null);
    setDegreeCode("");
    resetStructures();
  };

  const selectRulesYear = (year: number) => {
    setRulesYearOverride(year);
    setDegreeCode("");
    resetStructures();
  };

  const selectDegree = (code: string) => {
    setDegreeCode(code);
    resetStructures();
  };

  const moveTo = (next: StepId) => {
    movedStep.current = true;
    setMessage(null);
    setStepId(next);
  };

  /** Returns what is missing from the current step, or null when it is complete. */
  const validate = () => {
    if (stepId === "about") {
      if (!name.trim()) return "Add your name so your plan has an owner.";
      if (studentNumberInvalid) {
        return "Enter a student number in the format u1234567, or leave it blank.";
      }
    }
    if (stepId === "start" && commencementYear === null) {
      return "Choose the year you started.";
    }
    if (stepId === "degree") {
      if (!degree) return "Choose your degree to continue.";
      if (!planningAvailable) {
        return "Planning is not available for this degree yet. Skip for now and come back later.";
      }
    }
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const problem = validate();
    if (problem) {
      setMessage(problem);
      if (stepId === "about") nameRef.current?.focus();
      return;
    }
    if (stepId !== "pace") {
      moveTo(steps[stepIndex + 1].id);
      return;
    }
    if (!degree || catalogueYear === null || commencementYear === null) return;

    setSubmitting(true);
    setMessage(null);
    const result = await saveProfileAndPlan({
      name: name.trim(),
      studentId: studentNumber,
      email,
      catalogueYear,
      commencementYear,
      degreeCode,
      majorCode,
      minorCodes,
      specialisationCodes,
      studyLoad,
      extensionYears: 0,
    });
    if (!result.ok) {
      setSubmitting(false);
      setMessage(result.message);
      return;
    }
    // Stay in the submitting state until the plan page replaces this one.
    router.replace("/plan");
    router.refresh();
  };

  const namesOf = (
    options: readonly { code: string; name: string }[],
    codes: readonly string[],
  ) =>
    options
      .filter((item) => codes.includes(item.code))
      .map((item) => item.name)
      .join(", ");

  const summaryRows = [
    { label: "Name", value: name.trim() },
    {
      label: "Started",
      value:
        commencementYear === null
          ? ""
          : catalogueYear === null || catalogueYear === commencementYear
            ? String(commencementYear)
            : `${commencementYear} · ${catalogueYear} rules`,
    },
    { label: "Degree", value: degree?.name ?? "" },
    { label: "Major", value: major?.name ?? "" },
    ...(minorCodes.length > 0
      ? [{ label: "Minors", value: namesOf(minors, minorCodes) }]
      : []),
    ...(specialisationCodes.length > 0
      ? [
          {
            label: "Specialisations",
            value: namesOf(specialisations, specialisationCodes),
          },
        ]
      : []),
    { label: "Study load", value: stepId === "pace" ? studyLoad : "" },
  ];

  return (
    <main className="landing-mesh min-h-dvh px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-9" />
          <strong className="brand-wordmark text-lg">coursemap</strong>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard">Skip for now</Link>
        </Button>
      </div>

      <div className="mx-auto mt-8 grid w-full max-w-5xl gap-6 sm:mt-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
        <div className="mx-auto w-full max-w-xl rounded-3xl border bg-card p-6 shadow-sm sm:p-9">
          <h1 className="sr-only">Set up your plan</h1>
          {unavailable ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                No degrees are available to plan yet. Skip for now and set up
                your plan from your profile later.
              </AlertDescription>
            </Alert>
          ) : (
            <form noValidate onSubmit={submit}>
              <OnboardingProgress
                current={stepIndex + 1}
                label={step.label}
                total={steps.length}
              />

              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-8 text-2xl font-bold tracking-tight outline-none sm:text-3xl"
              >
                {step.title}
              </h2>

              <div className="mt-6 space-y-5">
                {stepId === "about" ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                      <Input
                        ref={nameRef}
                        aria-describedby={message ? messageId : undefined}
                        aria-invalid={
                          message && !name.trim() ? true : undefined
                        }
                        autoComplete="name"
                        autoFocus
                        id={nameId}
                        onChange={(event) => setName(event.target.value)}
                        value={name}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={studentNumberId}>
                        Student number{" "}
                        <span className="font-normal text-muted-foreground">
                          (optional)
                        </span>
                      </FieldLabel>
                      <Input
                        aria-invalid={
                          message && studentNumberInvalid ? true : undefined
                        }
                        autoComplete="off"
                        id={studentNumberId}
                        onChange={(event) =>
                          setStudentNumber(event.target.value)
                        }
                        placeholder="u1234567"
                        value={studentNumber}
                      />
                    </Field>
                  </>
                ) : null}

                {stepId === "start" ? (
                  <>
                    <ChoiceCards
                      columns={3}
                      label="Year you started"
                      onValueChange={selectCommencementYear}
                      options={commencementYearOptions(currentYear).map(
                        (year) => ({
                          value: year,
                          label: String(year),
                          description:
                            year === currentYear ? "Starting now" : undefined,
                        }),
                      )}
                      value={commencementYear}
                    />
                    {commencementYear !== null && catalogueYear !== null ? (
                      <div className="space-y-4 rounded-xl bg-muted/50 p-4 text-sm">
                        <p className="flex gap-2">
                          <Info
                            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <span>
                            {suggestedRulesYear === commencementYear
                              ? `Your plan follows the ${commencementYear} degree rules, from the year you started.`
                              : `Coursemap doesn't have the ${commencementYear} degree rules yet, so your plan uses ${suggestedRulesYear}.`}
                          </span>
                        </p>
                        {publishedYears.length > 1 ? (
                          <SelectField
                            description="Change this only if you moved to a newer set of rules."
                            items={publishedYears.map((year) => ({
                              value: year,
                              label: `${year} rules`,
                            }))}
                            label="Degree rules"
                            onValueChange={selectRulesYear}
                            searchable={false}
                            value={catalogueYear}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {stepId === "degree" ? (
                  <>
                    <SelectField
                      items={degrees.map((item) => ({
                        value: item.code,
                        label: `${item.name} (${item.code})`,
                      }))}
                      label="Degree"
                      onValueChange={selectDegree}
                      placeholder="Search degrees"
                      value={degreeCode}
                    />
                    {majors.length > 0 ? (
                      <SelectField
                        description="Optional. You can choose later."
                        items={[
                          { value: "", label: "Choose later" },
                          ...majors.map((item) => ({
                            value: item.code,
                            label: `${item.name} (${item.code})`,
                          })),
                        ]}
                        label="Major"
                        onValueChange={setMajorCode}
                        value={majorCode}
                      />
                    ) : null}
                    {minors.length > 0 ? (
                      <StructureMultiSelect
                        hint="Optional. Choose any you plan to complete."
                        label="Minors"
                        onChange={setMinorCodes}
                        options={minors}
                        value={minorCodes}
                      />
                    ) : null}
                    {specialisations.length > 0 ? (
                      <StructureMultiSelect
                        hint="Optional. Choose any you plan to complete."
                        label="Specialisations"
                        onChange={setSpecialisationCodes}
                        options={specialisations}
                        value={specialisationCodes}
                      />
                    ) : null}
                  </>
                ) : null}

                {stepId === "pace" ? (
                  <>
                    <ChoiceCards
                      label="Study load"
                      onValueChange={setStudyLoad}
                      options={STUDY_LOADS}
                      value={studyLoad}
                    />
                    <OnboardingSummary
                      className="lg:hidden"
                      rows={summaryRows}
                    />
                    <FieldDescription>
                      You can change any of this later from your profile.
                    </FieldDescription>
                  </>
                ) : null}
              </div>

              {message ? (
                <Alert
                  className="mt-5"
                  id={messageId}
                  role="alert"
                  variant="warning"
                >
                  <TriangleAlert aria-hidden="true" />
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}

              <div className="mt-8 flex items-center justify-between gap-3">
                {stepIndex > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => moveTo(steps[stepIndex - 1].id)}
                    disabled={submitting}
                  >
                    <ArrowLeft aria-hidden="true" />
                    Back
                  </Button>
                ) : (
                  <span />
                )}
                {stepId === "pace" ? (
                  <Button type="submit" aria-disabled={submitting || undefined}>
                    {submitting ? "Creating your plan…" : "Create my plan"}
                  </Button>
                ) : (
                  <Button type="submit">
                    Continue
                    <ArrowRight aria-hidden="true" />
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-8 space-y-3">
            <OnboardingSummary rows={summaryRows} />
            <p className="px-1 text-xs text-muted-foreground">
              Signed in as {email || "your account"}. Only you can see your
              plan.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
