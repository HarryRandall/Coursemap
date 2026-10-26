import "server-only";

import type { AuthViewer } from "@/lib/auth/viewer";
import { academicPeriodCode } from "@/lib/coursemap/academic-periods";
import { loadCurrentUserPlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import type { PlanCatalogue } from "@/lib/coursemap/plan-catalogue";
import { planRisks } from "@/lib/coursemap/plan-risks";
import { planStructureCodes } from "@/lib/coursemap/plan-structure-codes";
import {
  planTimelineTerms,
  planTimelineYears,
} from "@/lib/coursemap/plan-timeline";
import {
  loadPublishedCourse,
  loadPublishedCourseDirectoryPage,
} from "@/lib/coursemap/published-courses";
import {
  creditedRequirementUnits,
  requirementBucketProgress,
  requirementBucketStatus,
} from "@/lib/coursemap/requirement-progress";
import { loadCoursemapState } from "@/lib/coursemap/state";
import type { AppState } from "@/lib/coursemap/types";
import {
  coursePlanStatus,
  degreeUnitProgress,
  displayCourseForAttempt,
  recommendedCoursesForTerm,
  termLoad,
  unitsForAttempt,
} from "@/lib/planner";
import type { PlanningCatalogue } from "@/lib/planner";
import { academicSummary } from "@/lib/coursemap/academic-metrics";
import { loadCampusMapData } from "@/lib/rooms/campus-map-data";
import type { CampusMapPlace } from "@/lib/rooms/campus-map";
import { filterSocieties } from "@/lib/societies";
import { loadSocieties } from "@/lib/societies-data";
import { readAssistantVisual } from "./attachments";
import type {
  AssistantCourseReference,
  AssistantPlace,
  AssistantSociety,
  AssistantVisual,
} from "./attachments";
import { AssistantToolError } from "./chat-turn";
import { planVisuals } from "./plan-visuals";
import type { AssistantTool } from "./chat-turn";

const COURSE_CODE_PATTERN = /^[A-Z]{4}\d{4}[A-Z]?$/u;
const TERM_ID_PATTERN = /^\d{4}-[a-z0-9]+$/u;

type PlanContext = {
  state: AppState;
  catalogue: PlanCatalogue;
  planning: PlanningCatalogue;
};

function clip(text: string | null | undefined, maxLength: number) {
  const value = (text ?? "").replace(/\s+/gu, " ").trim();
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function text(input: Record<string, unknown>, key: string, maxLength = 120) {
  const value = input[key];
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function courseCode(input: Record<string, unknown>, key = "code") {
  const code = text(input, key, 12).toUpperCase();
  if (!COURSE_CODE_PATTERN.test(code))
    throw new AssistantToolError(
      `${code || "That"} is not an ANU course code.`,
    );
  return code;
}

function academicYear(input: Record<string, unknown>, fallback: number) {
  const year = Number(input.year);
  return Number.isInteger(year) && year >= 2020 && year <= 2030
    ? year
    : fallback;
}

/** Mirrors the planning catalogue the dashboard and plan pages derive. */
function planningCatalogueFor(
  catalogue: PlanCatalogue,
  state: AppState,
): PlanningCatalogue {
  const { profile } = state;
  const degree = catalogue.degrees.find(
    (item) => item.code === profile.degreeCode,
  );
  return {
    ...catalogue,
    courseOverrides: state.courseOverrides,
    creditedRequirementUnits: creditedRequirementUnits(
      catalogue.structureRequirements,
      state.requirementOverrides ?? [],
      new Set([
        profile.degreeCode,
        profile.majorCode,
        ...(profile.minorCodes ?? []),
        ...(profile.specialisationCodes ?? []),
      ]),
    ),
    terms: planTimelineTerms({
      terms: catalogue.terms,
      years: planTimelineYears({
        degree,
        commencementYear: profile.commencementYear,
        extensionYears: profile.extensionYears,
      }),
    }),
    commencementYear: profile.commencementYear,
    enrolmentMode: profile.enrolmentMode,
    programmeCodes: profile.degreeCode ? [profile.degreeCode] : [],
    structureCodes: planStructureCodes({
      majorCode: profile.majorCode,
      minorCodes: profile.minorCodes,
      specialisationCodes: profile.specialisationCodes,
    }),
  };
}

type ReferencedCourse = {
  code: string;
  name: string;
  year: number;
  units: number;
  sessions: string[];
  prerequisiteText: string;
  level: number;
};

function courseReference(
  course: ReferencedCourse,
  plan?: Pick<AssistantCourseReference, "planStatus" | "prerequisitesMet">,
): AssistantCourseReference {
  return {
    code: course.code,
    name: course.name,
    year: course.year,
    units: course.units,
    sessions: course.sessions,
    prerequisites: clip(course.prerequisiteText, 400) || null,
    level: course.level,
    ...plan,
  };
}

const PLAN_STATUS_VERB: Record<string, string> = {
  planned: "Planned for",
  enrolled: "Enrolled in",
  completed: "Completed in",
  failed: "Failed in",
  withdrawn: "Withdrew in",
};

function summarisePlan(
  { state, catalogue, planning }: PlanContext,
  onCourse: (course: AssistantCourseReference) => void,
  onVisual: (visual: AssistantVisual) => void,
) {
  const { profile, attempts } = state;
  const academic = academicSummary({ ...planning, attempts });
  const degree = catalogue.degrees.find(
    (item) => item.code === profile.degreeCode,
  );
  const structureName = (code: string) =>
    catalogue.structures.find((item) => item.code === code)?.name ?? code;
  const progress = degreeUnitProgress(attempts, degree?.units ?? 0, planning);
  const buckets = requirementBucketProgress({
    requirements: catalogue.structureRequirements,
    overrides: state.requirementOverrides ?? [],
    attempts,
    catalogue: planning,
  });
  const terms = planning.terms
    .map((term) => {
      const courses = attempts
        .filter((attempt) => attempt.termId === term.id)
        .map((attempt) => {
          const course = displayCourseForAttempt(attempt, planning);
          const { issues } = coursePlanStatus(attempt, attempts, planning);
          if (course)
            onCourse(
              courseReference(course, {
                planStatus: `${PLAN_STATUS_VERB[attempt.status] ?? "In"} ${term.shortName} ${term.year}`,
                ...(attempt.status === "planned" ||
                attempt.status === "enrolled"
                  ? {
                      prerequisitesMet: !issues.some(
                        (issue) => issue.code === "prerequisite",
                      ),
                    }
                  : {}),
              }),
            );
          return {
            code: attempt.courseCode,
            name: course?.name ?? null,
            units: unitsForAttempt(attempt, course),
            status: attempt.status,
            ...(attempt.mark !== undefined ? { mark: attempt.mark } : {}),
            ...(issues.length
              ? {
                  issues: issues.map(
                    (issue) => `${issue.severity}: ${issue.detail}`,
                  ),
                }
              : {}),
          };
        });
      return { id: term.id, name: `${term.name} ${term.year}`, courses };
    })
    .filter((term) => term.courses.length);
  const charts = planVisuals({
    gpa: academic.gpa,
    requirements: buckets,
    terms,
  });
  charts.forEach(onVisual);
  return {
    // Already drawn under the reply; mention them rather than repeat them.
    chartsShown: charts.map((chart) => chart.title),
    student: {
      preferredName: profile.preferredName || profile.name || null,
      programme: degree
        ? `${degree.name} (${degree.code}), ${degree.units ?? "unknown"} units`
        : profile.degreeCode || null,
      major: profile.majorCode ? structureName(profile.majorCode) : null,
      minors: profile.minorCodes.map(structureName),
      specialisations: profile.specialisationCodes.map(structureName),
      catalogueYear: profile.catalogueYear,
      commencementYear: profile.commencementYear,
      studyLoad: profile.studyLoad,
      // ANU's 7-point GPA and weighted average mark from recorded results.
      gpa: academic.gpa,
      wam: academic.wam,
    },
    units: progress,
    requirements: buckets.map((bucket) => ({
      title: bucket.title,
      kind: bucket.kind,
      status: requirementBucketStatus(bucket).label,
      targetUnits: bucket.targetUnits,
      completedUnits: bucket.completedUnits,
      plannedUnits: bucket.plannedUnits,
      rule: clip(bucket.description, 240),
    })),
    risks: planRisks({ buckets, attempts, catalogue: planning, progress }).map(
      (risk) => `${risk.severity}: ${risk.title}. ${risk.detail}`,
    ),
    terms,
    emptyTerms: planning.terms
      .filter((term) => !terms.some((item) => item.id === term.id))
      .map((term) => term.id),
  };
}

/**
 * Campus places matching a name such as "Hancock" or "CSIT", best first: a
 * name or marker that starts with the query, then any that contain it, then
 * matches on search terms and address.
 */
function matchPlaces(places: readonly CampusMapPlace[], query: string) {
  const wanted = query.trim().toLocaleLowerCase("en-AU");
  if (!wanted) return [];
  const score = (place: CampusMapPlace) => {
    const names = [place.name, place.markerLabel].map((name) =>
      name.toLocaleLowerCase("en-AU"),
    );
    if (names.some((name) => name.startsWith(wanted))) return 3;
    // "CSIT" for "Computer Science and Information Technology".
    const initials = place.name
      .split(/[\s-]+/u)
      .filter((word) => /^[A-Z]/u.test(word))
      .map((word) => word[0])
      .join("")
      .toLocaleLowerCase("en-AU");
    if (wanted.length > 1 && initials === wanted) return 3;
    if (names.some((name) => name.includes(wanted))) return 2;
    const other = [...place.searchTerms, place.address]
      .join(" ")
      .toLocaleLowerCase("en-AU");
    return other.includes(wanted) ? 1 : 0;
  };
  return places
    .map((place) => ({ place, score: score(place) }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((match) => match.place);
}

/**
 * Builds the tools for one request. Plan reads use the request's Supabase
 * client, so Row Level Security limits them to the signed-in student, and the
 * plan is loaded at most once however many tools ask for it.
 */
export function assistantTools(
  viewer: AuthViewer,
  {
    onCourse,
    onVisual,
    onSociety,
    onPlace,
  }: {
    /** Receives every course a tool returns, for the reply's course previews. */
    onCourse: (course: AssistantCourseReference) => void;
    onVisual: (visual: AssistantVisual) => void;
    onSociety: (society: AssistantSociety) => void;
    onPlace: (place: AssistantPlace) => void;
  },
): AssistantTool[] {
  let plan: Promise<PlanContext> | null = null;
  function loadPlan() {
    plan ??= Promise.all([
      loadCoursemapState(viewer),
      loadCurrentUserPlanCatalogue(),
    ]).then(([state, catalogue]) => ({
      state,
      catalogue,
      planning: planningCatalogueFor(catalogue, state),
    }));
    return plan;
  }
  async function defaultYear() {
    const { catalogue } = await loadPlan().catch(() => ({ catalogue: null }));
    return catalogue?.academicYear ?? new Date().getFullYear();
  }

  return [
    {
      label: "Reading your plan",
      definition: {
        type: "function",
        function: {
          name: "get_plan",
          description:
            "The student's programme, major and minors, unit progress, requirement progress, plan risks and every planned, enrolled or completed course by study period with any problems Coursemap has found (unmet prerequisites, not offered, overload, incompatibility). Call this before giving advice about their plan. It also shows the student a requirement progress chart, and a GPA chart when a GPA rule is unmet.",
          parameters: { type: "object", properties: {} },
        },
      },
      async run() {
        const context = await loadPlan();
        if (!context.state.planId && !context.state.attempts.length)
          return {
            plan: null,
            note: "The student has not set up a plan yet. Suggest the onboarding page at /onboarding.",
          };
        return summarisePlan(context, onCourse, onVisual);
      },
    },
    {
      label: "Searching courses",
      describe: (input) => {
        const query = text(input, "query", 40) || text(input, "subject", 8);
        if (input.unlocked_by)
          return `Finding courses ${text(input, "unlocked_by", 12).toUpperCase()} unlocks`;
        return query ? `Searching courses for "${query}"` : null;
      },
      definition: {
        type: "function",
        function: {
          name: "search_courses",
          description:
            "Search the published ANU course catalogue. Matches course code, title, subject, school and convener, not descriptions, so use short keywords or a subject code. All filters are optional and combine.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Keyword or partial code, such as 'machine learning' or 'COMP2'.",
              },
              subject: {
                type: "string",
                description: "Four-letter subject code, such as COMP or ECON.",
              },
              level: {
                type: "string",
                description:
                  "Course level: '1', '2+', or a range such as '2-3'.",
              },
              session: {
                type: "string",
                description:
                  "Study period offered: S1, S2, Summer, Autumn, Winter or Spring.",
              },
              unlocked_by: {
                type: "string",
                description:
                  "Course code; returns courses that list it as a prerequisite.",
              },
              year: {
                type: "integer",
                description:
                  "Catalogue year. Defaults to the student's plan year.",
              },
            },
          },
        },
      },
      async run(input) {
        const session = text(input, "session", 40);
        const unlockedBy = input.unlocked_by
          ? courseCode(input, "unlocked_by")
          : "";
        const result = await loadPublishedCourseDirectoryPage({
          academicYear: academicYear(input, await defaultYear()),
          filters: {
            query: text(input, "query", 80),
            subject: text(input, "subject", 40),
            level: text(input, "level", 8),
            session: session ? (academicPeriodCode(session) ?? session) : "",
            prerequisite: unlockedBy,
          },
          pageSize: 15,
        });
        result.courses.forEach((course) => onCourse(courseReference(course)));
        return {
          total: result.total,
          shown: result.courses.length,
          courses: result.courses.map((course) => ({
            code: course.code,
            name: course.name,
            year: course.year,
            units: course.units,
            sessions: course.sessions,
            prerequisites: clip(course.prerequisiteText, 160) || null,
          })),
        };
      },
    },
    {
      label: "Looking up a course",
      describe: (input) => {
        const code = text(input, "code", 12).toUpperCase();
        return COURSE_CODE_PATTERN.test(code) ? `Looking up ${code}` : null;
      },
      definition: {
        type: "function",
        function: {
          name: "get_course",
          description:
            "Full published details of one course: offerings, prerequisites, incompatibilities, assumed knowledge, description, learning outcomes, assessment and workload.",
          parameters: {
            type: "object",
            properties: {
              code: {
                type: "string",
                description: "Course code, such as COMP1100.",
              },
              year: {
                type: "integer",
                description:
                  "Catalogue year. Defaults to the student's plan year.",
              },
            },
            required: ["code"],
          },
        },
      },
      async run(input) {
        const code = courseCode(input);
        const year = academicYear(input, await defaultYear());
        const course = await loadPublishedCourse(code, year);
        if (!course)
          return {
            error: `${code} is not published for ${year}. Try another year.`,
          };
        onCourse(courseReference(course));
        return {
          code: course.code,
          name: course.name,
          year: course.year,
          units: course.units,
          level: course.level,
          subject: course.subjectName ?? course.subject,
          convener: course.convener || null,
          link: `/courses/${course.year}/${course.code.toLowerCase()}`,
          offerings: course.offerings.map(
            (offering) =>
              `${offering.periodName} ${offering.calendarYear}${offering.deliveryMode ? `, ${offering.deliveryMode}` : ""}`,
          ),
          offeringStatus: course.offeringStatus,
          prerequisites: clip(course.prerequisiteText, 400) || null,
          corequisites: clip(course.corequisiteText, 200) || null,
          assumedKnowledge: clip(course.assumedKnowledgeText, 200) || null,
          incompatible: clip(course.incompatibilityText, 200) || null,
          permission: clip(course.permissionText, 200) || null,
          description: clip(course.description, 700),
          learningOutcomes: course.learningOutcomes
            .slice(0, 6)
            .map((outcome) => clip(outcome.body, 160)),
          assessment: course.assessments.map(
            (item) =>
              `${clip(item.title, 60)}${item.weight !== null ? ` (${item.weight}%)` : ""}`,
          ),
          workload: clip(course.workloadText, 160) || null,
        };
      },
    },
    {
      label: "Finding courses that fit",
      describe: (input) => {
        const termId = text(input, "term_id", 20).toLowerCase();
        const [year, period] = termId.split("-");
        return year && period
          ? `Finding courses for ${period.toUpperCase()} ${year}`
          : null;
      },
      definition: {
        type: "function",
        function: {
          name: "recommend_courses",
          description:
            "Courses from the student's programme and major that fit one study period: offered then, not already planned, prerequisites met by earlier periods and no incompatibility. Also returns the period's current load.",
          parameters: {
            type: "object",
            properties: {
              term_id: {
                type: "string",
                description: "Study period id from get_plan, such as 2027-s1.",
              },
            },
            required: ["term_id"],
          },
        },
      },
      async run(input) {
        const termId = text(input, "term_id", 20).toLowerCase();
        if (!TERM_ID_PATTERN.test(termId))
          throw new AssistantToolError(
            "Use a study period id such as 2027-s1.",
          );
        const { state, planning } = await loadPlan();
        const term = planning.terms.find((item) => item.id === termId);
        if (!term)
          throw new AssistantToolError(
            `${termId} is not a study period in this plan. Call get_plan for the period ids.`,
          );
        const majorCodes = state.profile.majorCode
          ? [state.profile.majorCode]
          : [];
        const load = termLoad(state.attempts, term.id, undefined, planning);
        const courses = recommendedCoursesForTerm(
          term,
          state.attempts,
          majorCodes,
          planning,
        );
        courses
          .slice(0, 12)
          .forEach((course) => onCourse(courseReference(course)));
        return {
          term: `${term.name} ${term.year}`,
          currentLoad: load,
          suggestions: courses.slice(0, 12).map((course) => ({
            code: course.code,
            name: course.name,
            units: course.units,
            level: course.level,
          })),
          more: Math.max(0, courses.length - 12),
        };
      },
    },
    {
      label: "Looking up societies",
      describe: (input) => {
        const query = text(input, "query", 40);
        return query ? `Looking up societies for "${query}"` : null;
      },
      definition: {
        type: "function",
        function: {
          name: "find_society",
          description:
            "Search ANU student societies and clubs by name, interest or category. The matches are shown to the student as cards with links, so describe them briefly.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Society name or interest, such as 'robotics' or 'debating'.",
              },
            },
            required: ["query"],
          },
        },
      },
      async run(input) {
        const query = text(input, "query", 80);
        const { societies } = await loadSocieties();
        const matches = filterSocieties(societies, query, "").slice(0, 4);
        matches.forEach((society) =>
          onSociety({
            slug: society.slug,
            name: society.name,
            category: society.category,
            summary: clip(society.summary, 280),
            ...(society.logoUrl ? { logoUrl: society.logoUrl } : {}),
          }),
        );
        return {
          found: matches.length,
          societies: matches.map((society) => ({
            name: society.name,
            category: society.category,
            summary: clip(society.summary, 200),
            interests: society.interests.slice(0, 5),
          })),
        };
      },
    },
    {
      label: "Finding the place",
      describe: (input) => {
        const query = text(input, "place", 40);
        return query ? `Finding ${query} on the campus map` : null;
      },
      definition: {
        type: "function",
        function: {
          name: "find_place",
          description:
            "Find a building or place on the ANU Acton campus map. Give 'from' as well when the student wants directions; the student is shown a card that opens the 3D campus map with the route. Do not write turn-by-turn directions.",
          parameters: {
            type: "object",
            properties: {
              place: {
                type: "string",
                description:
                  "Building or place name, such as 'Hancock Library' or 'CSIT'.",
              },
              from: {
                type: "string",
                description:
                  "Where the student is starting from, for directions.",
              },
            },
            required: ["place"],
          },
        },
      },
      async run(input) {
        const { data, error } = await loadCampusMapData();
        if (error)
          throw new AssistantToolError(
            "The campus map is unavailable right now.",
          );
        const matches = matchPlaces(
          data.places,
          text(input, "place", 80),
        ).slice(0, 3);
        const start = input.from
          ? matchPlaces(
              data.places.filter((place) => place.isRoutable),
              text(input, "from", 80),
            )[0]
          : undefined;
        matches.forEach((place, index) =>
          onPlace({
            slug: place.slug,
            name: place.name,
            address: place.address,
            // Directions are offered for the best match only.
            ...(index === 0 && start && place.isRoutable
              ? { from: { slug: start.slug, name: start.name } }
              : {}),
          }),
        );
        return {
          found: matches.length,
          places: matches.map((place) => ({
            name: place.name,
            address: place.address,
          })),
          ...(input.from
            ? {
                directionsFrom:
                  start?.name ?? "Start point not found on the map",
              }
            : {}),
        };
      },
    },
    {
      label: "Drawing a chart",
      silent: true,
      definition: {
        type: "function",
        function: {
          name: "show_visual",
          description:
            "Show the student a small chart below your reply. Use 'meter' for one value against a scale and an optional required value, such as a GPA of 5.2 out of 7 against a 6.0 requirement. Use 'bars' to compare up to 12 values, such as completed units per requirement or units per study period, each with an optional target. Only chart numbers you got from a tool.",
          parameters: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["meter", "bars"] },
              title: { type: "string" },
              unit: {
                type: "string",
                description: "Unit for the values, such as 'units' or 'GPA'.",
              },
              value: { type: "number", description: "Meter value." },
              max: { type: "number", description: "Meter scale maximum." },
              target: {
                type: "number",
                description: "Meter required value.",
              },
              items: {
                type: "array",
                description: "Bars to compare.",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string" },
                    value: { type: "number", description: "Done so far." },
                    planned: {
                      type: "number",
                      description: "Scheduled on top of value.",
                    },
                    target: { type: "number" },
                  },
                  required: ["label", "value"],
                },
              },
            },
            required: ["kind", "title"],
          },
        },
      },
      async run(input) {
        const visual = readAssistantVisual(input);
        if (!visual)
          throw new AssistantToolError(
            "That chart is incomplete. A meter needs value and max; bars need items with label and value.",
          );
        onVisual(visual);
        return { shown: true };
      },
    },
  ];
}
