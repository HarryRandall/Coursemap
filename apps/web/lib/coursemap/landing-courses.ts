import type { CourseRuleExpression } from "@/lib/coursemap/course-types";

/** The parts of a published course the requisite views need, as plain data. */
export type ShowcaseCourse = {
  code: string;
  name: string;
  year: number;
  /** Prerequisites, joined with any incompatibilities, for the table. */
  enrolmentRule: CourseRuleExpression;
  /** Prerequisites alone, for the graph. */
  prerequisiteRule: CourseRuleExpression | null;
  hasPrerequisiteWording: boolean;
  availableCourseCodes: string[];
};
