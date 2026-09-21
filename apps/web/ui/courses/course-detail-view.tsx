"use client";
import { badgeVariantForTone } from "@/lib/ui";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from "@coursemap/ui/primitives/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@coursemap/ui/primitives/empty";
import {
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@coursemap/ui/primitives/tabs";
import Link from "next/link";
import {
  BookOpen,
  Banknote,
  CalendarClock,
  ArrowUpRight,
  ClipboardCheck,
  GitBranch,
  GraduationCap,
  Library,
  MapPin,
  MessageSquareText,
  Plus,
} from "lucide-react";
import { Hint } from "@/ui/common/hint";
import { PrereqGraph } from "@/ui/prereq-graph";
import type { CourseDetails } from "@/lib/coursemap/course-types";
import { requirementCourseStatus } from "@/lib/coursemap/requirement-display";
import type { Attempt } from "@/lib/coursemap/types";
import {
  evaluateRequisiteExpression,
  type CompletedRequisiteCourse,
  parseRequisiteSummary,
} from "@/lib/coursemap/requisite-summary";
import {
  feeValue,
  formatDate,
  formatUpdatedAt,
  humanise,
  sessionLabel,
  unitValueLabel,
} from "@/ui/courses/course-detail-format";
import { CourseReferenceText } from "@/ui/courses/course-reference";
import {
  RequisiteExpressionSummary,
  RequisiteProgressSummary,
  RequisiteRuleSummary,
} from "@/ui/courses/requisite-summary";

export const courseDetailTabs = [
  { id: "overview", label: "Overview", icon: BookOpen },
  { id: "requisites", label: "Requisites", icon: GitBranch },
  { id: "offerings", label: "Offerings", icon: CalendarClock },
  { id: "student-review", label: "Student review", icon: MessageSquareText },
] as const;
export type CourseTab = (typeof courseDetailTabs)[number]["id"];
export function courseTabFromSearch(value: string | null): CourseTab {
  return courseDetailTabs.some((tab) => tab.id === value)
    ? (value as CourseTab)
    : "overview";
}

/**
 * The tab strip is shared so the admin preview shows exactly the tabs a
 * student sees, in the same order and with the same labels.
 */
/**
 * The tab strip is shared so the admin preview shows exactly the tabs a
 * student sees, in the same order and with the same labels.
 */
export function CourseDetailTabsList() {
  return (
    <TabsList variant="line">
      {courseDetailTabs.map(({ id, label, icon: Icon }) => (
        <TabsTrigger key={id} value={id}>
          <Icon size={15} aria-hidden="true" className="hidden sm:block" />
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
const NO_ATTEMPTS: readonly Attempt[] = [];

/**
 * The student-facing body of a course page. The student route and the admin
 * import review both render this component, so a draft preview cannot drift
 * away from what a student will actually see.
 */
export function CourseDetailView({
  attempts = NO_ATTEMPTS,
  course,
  onAddToPlan,
  requisiteCompletion,
}: {
  /** The reader's own plan, so the graph can mark what they have done. */
  attempts?: readonly Attempt[];
  course: CourseDetails;
  onAddToPlan?: () => void;
  requisiteCompletion: {
    completedCourses: CompletedRequisiteCourse[];
    enrolledProgrammeCodes?: string[];
    isAuthenticated: boolean;
  };
}) {
  const availableCourseCodes = new Set(course.availableCourseCodes);
  const structuredRule = course.prerequisiteRule?.expression ?? null;
  const relationalRule = course.prerequisiteRule?.relationalExpression ?? null;
  const statusByCode = new Map(
    [...new Set(attempts.map((attempt) => attempt.courseCode))].flatMap(
      (attemptCode) => {
        const status = requirementCourseStatus(attemptCode, attempts);
        return status ? [[attemptCode, status] as const] : [];
      },
    ),
  );
  const requisiteSummary =
    structuredRule ?? parseRequisiteSummary(course.prerequisiteText);
  const requisiteProgress = structuredRule
    ? evaluateRequisiteExpression(
        structuredRule,
        requisiteCompletion.completedCourses,
        requisiteCompletion.enrolledProgrammeCodes ?? [],
      )
    : null;
  const hasPrerequisiteWording =
    course.prerequisiteText.trim().length > 0 &&
    !/^No prerequisites listed\.?$/iu.test(course.prerequisiteText.trim());

  return (
    <div className="w-full">
      <header className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="mt-1 text-2xl leading-tight font-bold tracking-tight text-foreground sm:text-3xl">
            {course.name}
          </h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant={"outline"}>{course.year}</Badge>
            <Badge variant={"outline"}>{unitValueLabel(course)}</Badge>
            {Array.from(new Set(course.sessions)).map((session) => (
              <Hint key={session} label={session}>
                <Badge tabIndex={0} variant="outline">
                  {sessionLabel(session)}
                </Badge>
              </Hint>
            ))}
            <Badge variant="outline">{course.delivery}</Badge>
            {course.offeringStatus !== "offered" ? (
              <Badge variant="warning-light">
                {course.offeringStatus === "not_offered"
                  ? "Not offered"
                  : "Offering unconfirmed"}
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {Array.from(
              new Set([course.school, course.college].filter(Boolean)),
            ).join(" · ")}
          </p>
        </div>
        <Button
          className="w-full shrink-0 sm:w-auto"
          disabled={!onAddToPlan}
          onClick={onAddToPlan}
          variant="default"
          type="button"
        >
          <Plus size={16} aria-hidden="true" />
          Add to plan
        </Button>
      </header>

      <TabsContent value="overview">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{"About this course"}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 border-t border-border/60 pt-5">
                {course.introduction &&
                course.introduction !== course.description ? (
                  <p className="max-w-4xl text-sm leading-relaxed font-medium text-foreground/90">
                    {course.introduction}
                  </p>
                ) : null}
                <p className="max-w-4xl text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">
                  {course.description}
                </p>
              </CardContent>
            </Card>

            {course.learningOutcomes.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>{"Learning outcomes"}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="border-t border-border/60 pt-5">
                  <ol className="space-y-3">
                    {course.learningOutcomes.map((outcome) => (
                      <li
                        key={outcome.position}
                        className="flex gap-3 text-[13px] leading-relaxed text-foreground/80"
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                          {outcome.position}
                        </span>
                        <span>{outcome.body}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ) : null}

            {course.assessments.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>{"Assessment"}</h2>
                  </CardTitle>
                  {Boolean(
                    "Weights and hurdle requirements come straight from the imported ANU record.",
                  ) && (
                    <CardDescription>
                      {
                        "Weights and hurdle requirements come straight from the imported ANU record."
                      }
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="border-t border-border/60 p-0">
                  <div className="divide-y divide-border/60">
                    {course.assessments.map((assessment) => (
                      <div
                        key={assessment.position}
                        className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                      >
                        <div>
                          <p className="text-[13px] font-semibold text-foreground">
                            {assessment.title}
                          </p>
                          {assessment.dueText ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {assessment.dueText}
                            </p>
                          ) : null}
                          {assessment.learningOutcomePositions.length ? (
                            <p className="mt-1 text-[11px] text-muted-foreground/80">
                              Learning outcomes{" "}
                              {assessment.learningOutcomePositions.join(", ")}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-start gap-2">
                          {assessment.weight !== null ? (
                            <Badge variant={"outline"}>
                              {assessment.weight}%
                            </Badge>
                          ) : null}
                          {assessment.hurdle ? (
                            <Badge variant={"warning-light"}>Hurdle</Badge>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {course.workloadText || course.prescribedTexts ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>{"Study expectations"}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-5 border-t border-border/60 pt-5 md:grid-cols-2">
                  {course.workloadText ? (
                    <section>
                      <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <GraduationCap size={15} aria-hidden="true" /> Workload
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
                        {course.workloadText}
                        {course.workloadHours !== null
                          ? ` (${course.workloadHours} hours)`
                          : ""}
                      </p>
                    </section>
                  ) : null}
                  {course.prescribedTexts ? (
                    <section>
                      <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground">
                        <Library size={15} aria-hidden="true" /> Prescribed
                        texts
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
                        {course.prescribedTexts}
                      </p>
                    </section>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {course.relatedCourses.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>{"Related courses"}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 border-t border-border/60 pt-5 sm:grid-cols-2">
                  {course.relatedCourses.map((related) => (
                    <Link
                      key={`${related.kind}:${related.code}`}
                      href={`/courses/${course.year}/${related.code.toLowerCase()}`}
                      className="group relative rounded-lg border border-border p-3 pr-10 transition-colors hover:border-primary/25 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <ArrowUpRight
                        aria-hidden="true"
                        size={16}
                        className="absolute top-3 right-3 text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      />
                      <p className="font-mono text-[11px] font-semibold text-primary">
                        {related.code}
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-foreground">
                        {related.title ?? "Related ANU course"}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {humanise(related.kind)}
                      </p>
                    </Link>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <h2>{"Course essentials"}</h2>
                </CardTitle>
              </CardHeader>
              <CardContent className="border-t border-border/60 pt-5">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {[
                    ["Academic year", String(course.year)],
                    ["Course subject", course.subject],
                    ["Subject name", course.subjectName ?? "Not listed"],
                    ["Academic career", course.academicCareer ?? "Not listed"],
                    ["School", course.school],
                    ["College", course.college ?? "Not listed"],
                    ["Convener", course.convener],
                    ["Delivery", course.delivery],
                    ["Unit value", unitValueLabel(course)],
                    ["EFTSL", course.eftsl?.toString() ?? "Not listed"],
                    [
                      "Last source update",
                      formatUpdatedAt(course.sourceUpdatedAt),
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <dt className="text-[10px] font-semibold tracking-wider text-muted-foreground/80 uppercase">
                        {label}
                      </dt>
                      <dd className="mt-0.5 text-[12px] leading-relaxed font-medium break-words text-foreground/80">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
              <CardFooter>
                <a
                  href={course.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[13px] font-semibold text-primary hover:text-primary/80"
                >
                  View the ANU course source
                </a>
              </CardFooter>
            </Card>

            {course.fees.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>{"Fees"}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="border-t border-border/60 p-0">
                  <dl className="divide-y divide-border/60">
                    {course.fees.map((fee, index) => (
                      <div
                        key={`${fee.audience}:${fee.feeType}:${index}`}
                        className="px-5 py-4"
                      >
                        <dt className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                          <Banknote size={15} aria-hidden="true" />
                          {fee.sourceLabel ?? humanise(fee.feeType)}
                        </dt>
                        <dd className="mt-1 text-xs text-muted-foreground">
                          {humanise(fee.audience)}
                          {fee.feeYear ? ` · ${fee.feeYear}` : ""}
                          {fee.basis !== "unknown"
                            ? ` · ${humanise(fee.basis)} basis`
                            : ""}
                        </dd>
                        <dd className="mt-1.5 text-[13px] font-semibold text-foreground/90">
                          {feeValue(fee)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ) : null}

            {course.areasOfInterest.length || course.attributes.length ? (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h2>{"Areas and attributes"}</h2>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 border-t border-border/60 pt-5">
                  {course.areasOfInterest.length ? (
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        Areas of interest
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {course.areasOfInterest.map((area) => (
                          <Badge key={area} variant={"outline"}>
                            {area}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {course.attributes.length ? (
                    <div>
                      <h3 className="text-xs font-semibold text-foreground">
                        Course attributes
                      </h3>
                      <dl className="mt-2 grid gap-2">
                        {course.attributes.map((attribute, index) => (
                          <div
                            key={`${attribute.kind}:${attribute.value}:${index}`}
                            className="rounded-lg border border-border p-3"
                          >
                            <dt className="text-[10px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
                              {humanise(attribute.kind)}
                            </dt>
                            <dd className="mt-1 text-xs text-foreground/80">
                              {attribute.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="requisites" className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{"Prerequisite chain and unlocks"}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="border-t border-border/60 px-0 pt-5 pb-0">
            <PrereqGraph
              academicYear={course.year}
              availableCourseCodes={availableCourseCodes}
              code={course.code}
              expression={relationalRule}
              hasPrerequisiteWording={hasPrerequisiteWording}
              prerequisiteEdges={course.prerequisiteEdges}
              showStudentState={
                requisiteCompletion.isAuthenticated || attempts.length > 0
              }
              statusByCode={statusByCode}
              unlocksAreKnown={course.unlocksAreKnown}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col gap-3 sm:flex-row">
            <CardTitle>
              <h2>{"Requisites and compatibility"}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 border-t border-border/60 pt-5 text-[13px] leading-relaxed text-foreground/80">
            {requisiteProgress && requisiteCompletion.isAuthenticated ? (
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Prerequisites against your completed courses
                </h3>
                <div className="mt-2">
                  <RequisiteProgressSummary
                    academicYear={course.year}
                    progress={requisiteProgress}
                    availableCourseCodes={availableCourseCodes}
                  />
                </div>
              </div>
            ) : relationalRule ? (
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Prerequisite requirements
                </h3>
                <div className="mt-2">
                  <RequisiteRuleSummary
                    academicYear={course.year}
                    expression={relationalRule}
                    availableCourseCodes={availableCourseCodes}
                  />
                </div>
              </div>
            ) : requisiteSummary ? (
              <div>
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Coursemap summary
                </h3>
                <div className="mt-2">
                  <RequisiteExpressionSummary
                    academicYear={course.year}
                    expression={requisiteSummary}
                    availableCourseCodes={availableCourseCodes}
                  />
                </div>
              </div>
            ) : null}
            <div>
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Prerequisites as published
              </h3>
              <p className="mt-2 whitespace-pre-line">
                <CourseReferenceText
                  academicYear={course.year}
                  text={course.prerequisiteText}
                  availableCourseCodes={availableCourseCodes}
                />
              </p>
            </div>
            {course.corequisiteText ? (
              <div className="border-t border-border/60 pt-5">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Corequisites
                </h3>
                <p className="mt-2 whitespace-pre-line">
                  <CourseReferenceText
                    academicYear={course.year}
                    text={course.corequisiteText}
                    availableCourseCodes={availableCourseCodes}
                  />
                </p>
              </div>
            ) : null}
            {course.inherentRequirements ? (
              <div className="border-t border-border/60 pt-5">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Inherent requirements
                </h3>
                <p className="mt-2 whitespace-pre-line">
                  {course.inherentRequirements}
                </p>
              </div>
            ) : null}
            {course.assumedKnowledgeText ? (
              <div className="border-t border-border/60 pt-5">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Assumed knowledge
                </h3>
                <p className="mt-2 whitespace-pre-line">
                  {course.assumedKnowledgeText}
                </p>
              </div>
            ) : null}
            {course.permissionText ? (
              <div className="border-t border-border/60 pt-5">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Permission
                </h3>
                <p className="mt-2 whitespace-pre-line">
                  {course.permissionText}
                </p>
              </div>
            ) : null}
            {course.incompatibilityText ? (
              <div className="border-t border-border/60 pt-5">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Incompatibilities
                </h3>
                <p className="mt-2 whitespace-pre-line">
                  <CourseReferenceText
                    academicYear={course.year}
                    text={course.incompatibilityText}
                    availableCourseCodes={availableCourseCodes}
                  />
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="offerings" className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{"Available study periods"}</h2>
            </CardTitle>
            {Boolean(
              "Imported from ANU class information. Confirm enrolment dates in the official source.",
            ) && (
              <CardDescription>
                {
                  "Imported from ANU class information. Confirm enrolment dates in the official source."
                }
              </CardDescription>
            )}
            {Boolean(
              <Badge
                variant={
                  badgeVariantForTone[
                    course.offeringStatus === "offered" ? "success" : "neutral"
                  ]
                }
              >
                {course.offeringStatus === "offered"
                  ? `Offered in ${course.year}`
                  : course.offeringStatus === "not_offered"
                    ? `Not offered in ${course.year}`
                    : "Offering status unknown"}
              </Badge>,
            ) && (
              <CardAction>
                {
                  <Badge
                    variant={
                      badgeVariantForTone[
                        course.offeringStatus === "offered"
                          ? "success"
                          : "neutral"
                      ]
                    }
                  >
                    {course.offeringStatus === "offered"
                      ? `Offered in ${course.year}`
                      : course.offeringStatus === "not_offered"
                        ? `Not offered in ${course.year}`
                        : "Offering status unknown"}
                  </Badge>
                }
              </CardAction>
            )}
          </CardHeader>
          {course.offerings.length ? (
            <CardContent className="border-t border-border/60 p-0">
              <div className="divide-y divide-border/60">
                {course.offerings.map((offering, index) => {
                  const startsOn = formatDate(offering.startsOn);
                  const endsOn = formatDate(offering.endsOn);
                  const enrolClosesOn = formatDate(offering.enrolClosesOn);
                  const censusOn = formatDate(offering.censusOn);
                  return (
                    <section
                      key={`${offering.periodCode}:${offering.classNumber ?? index}`}
                      className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,auto)]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-[13px] font-semibold text-foreground">
                            {offering.periodName}
                          </h3>
                          {offering.classNumber ? (
                            <Badge variant={"outline"}>
                              Class {offering.classNumber}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {offering.deliveryMode ? (
                            <span>{offering.deliveryMode}</span>
                          ) : null}
                          {offering.location ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin size={12} aria-hidden="true" />
                              {offering.location}
                            </span>
                          ) : null}
                          {startsOn || endsOn ? (
                            <span>
                              {startsOn ?? "Start not listed"}
                              {endsOn ? ` to ${endsOn}` : ""}
                            </span>
                          ) : null}
                        </div>
                        {offering.classSummaryUrl ? (
                          <a
                            href={offering.classSummaryUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex text-xs font-semibold text-primary hover:text-primary/80"
                          >
                            Open ANU class summary
                          </a>
                        ) : null}
                      </div>
                      {enrolClosesOn || censusOn ? (
                        <dl className="grid grid-cols-2 gap-3 text-xs">
                          {enrolClosesOn ? (
                            <div>
                              <dt className="text-muted-foreground/80">
                                Last enrolment
                              </dt>
                              <dd className="mt-0.5 font-medium text-foreground/80">
                                {enrolClosesOn}
                              </dd>
                            </div>
                          ) : null}
                          {censusOn ? (
                            <div>
                              <dt className="text-muted-foreground/80">
                                Census date
                              </dt>
                              <dd className="mt-0.5 font-medium text-foreground/80">
                                {censusOn}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </CardContent>
          ) : (
            <CardContent className="border-t border-border/60 p-0">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CalendarClock aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    No course offering is listed for this year.
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            </CardContent>
          )}
        </Card>
      </TabsContent>

      <TabsContent value="student-review" className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{"Student experience and self-review"}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 border-t border-border/60 pt-5">
            <Alert className="rounded-xl p-4" variant={"default"}>
              <MessageSquareText aria-hidden="true" />
              <AlertTitle className="text-[13px]">
                No course-specific ratings are shown yet
              </AlertTitle>
              <AlertDescription className="text-[13px] text-muted-foreground">
                No student ratings are available for this course.
              </AlertDescription>
            </Alert>
            <div>
              <h3 className="text-[13px] font-semibold text-foreground">
                A useful self-review after taking the course
              </h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {[
                  [
                    "Workload",
                    "Were the weekly study hours manageable for the unit value?",
                  ],
                  [
                    "Assessment",
                    "Did the assessment types build the skills the course promised?",
                  ],
                  [
                    "Teaching",
                    "Were lectures, tutorials and feedback helpful when you needed them?",
                  ],
                ].map(([title, description]) => (
                  <div
                    key={title}
                    className="rounded-xl border border-border p-4"
                  >
                    <ClipboardCheck
                      size={17}
                      className="text-primary"
                      aria-hidden="true"
                    />
                    <h4 className="mt-2 text-[13px] font-semibold text-foreground/90">
                      {title}
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </div>
  );
}
