export type RequisiteCondition =
  | {
      kind: "course";
      code: string;
    }
  | {
      kind: "subject_units";
      subject: string;
      units: number;
    }
  | {
      kind: "level_units";
      units: number;
      level: number;
      subject?: string;
    }
  | {
      kind: "units_total";
      units: number;
    }
  | {
      kind: "programme_enrolment";
      code: string;
      name: string;
    };

export type RequisiteExpression =
  | RequisiteCondition
  | {
      kind: "group";
      operator: "all_of" | "any_of";
      conditions: RequisiteExpression[];
    };

export type CompletedRequisiteCourse = {
  code: string;
  units: number;
};

export type RequisiteProgress =
  | {
      kind: "course";
      code: string;
      satisfied: boolean;
    }
  | {
      completedUnits: number;
      kind: "subject_units";
      requiredUnits: number;
      satisfied: boolean;
      subject: string;
    }
  | {
      completedUnits: number;
      kind: "level_units";
      level: number;
      requiredUnits: number;
      satisfied: boolean;
      subject?: string;
    }
  | {
      completedUnits: number;
      kind: "units_total";
      requiredUnits: number;
      satisfied: boolean;
    }
  | {
      code: string;
      kind: "programme_enrolment";
      name: string;
      satisfied: boolean;
    }
  | {
      conditions: RequisiteProgress[];
      kind: "group";
      operator: "all_of" | "any_of";
      satisfied: boolean;
    };

const COURSE_LEVEL_PATTERN = /^[A-Z]{4}(\d)\d{3}[A-Z]?$/u;

function courseLevel(code: string) {
  const digit = COURSE_LEVEL_PATTERN.exec(code.toUpperCase())?.[1];
  return digit === undefined ? null : Number(digit) * 1000;
}

/**
 * Evaluates only completed course attempts. Planned and enrolled courses are
 * deliberately excluded because the ANU wording requires completed study.
 */
export function evaluateRequisiteExpression(
  expression: RequisiteExpression,
  completedCourses: readonly CompletedRequisiteCourse[],
  enrolledProgrammeCodes: readonly string[] = [],
): RequisiteProgress {
  if (expression.kind === "programme_enrolment") {
    return {
      kind: "programme_enrolment",
      code: expression.code,
      name: expression.name,
      satisfied: enrolledProgrammeCodes.some(
        (code) => code.toUpperCase() === expression.code,
      ),
    };
  }

  if (expression.kind === "course") {
    return {
      kind: "course",
      code: expression.code,
      satisfied: completedCourses.some(
        (course) => course.code.toUpperCase() === expression.code,
      ),
    };
  }

  if (expression.kind === "subject_units") {
    const completedUnits = completedCourses.reduce((total, course) => {
      const subject = course.code.slice(0, 4).toUpperCase();
      return subject === expression.subject && Number.isFinite(course.units)
        ? total + course.units
        : total;
    }, 0);
    return {
      kind: "subject_units",
      subject: expression.subject,
      requiredUnits: expression.units,
      completedUnits,
      satisfied: completedUnits >= expression.units,
    };
  }

  if (expression.kind === "level_units") {
    const completedUnits = completedCourses.reduce((total, course) => {
      const subject = course.code.slice(0, 4).toUpperCase();
      const level = courseLevel(course.code);
      const subjectMatches =
        expression.subject === undefined || subject === expression.subject;
      return subjectMatches &&
        level === expression.level &&
        Number.isFinite(course.units)
        ? total + course.units
        : total;
    }, 0);
    return {
      kind: "level_units",
      level: expression.level,
      ...(expression.subject !== undefined
        ? { subject: expression.subject }
        : {}),
      requiredUnits: expression.units,
      completedUnits,
      satisfied: completedUnits >= expression.units,
    };
  }

  if (expression.kind === "units_total") {
    const completedUnits = completedCourses.reduce(
      (total, course) =>
        Number.isFinite(course.units) ? total + course.units : total,
      0,
    );
    return {
      kind: "units_total",
      requiredUnits: expression.units,
      completedUnits,
      satisfied: completedUnits >= expression.units,
    };
  }

  const conditions = expression.conditions.map((condition) =>
    evaluateRequisiteExpression(
      condition,
      completedCourses,
      enrolledProgrammeCodes,
    ),
  );
  return {
    kind: "group",
    operator: expression.operator,
    conditions,
    satisfied:
      expression.operator === "all_of"
        ? conditions.every((condition) => condition.satisfied)
        : conditions.some((condition) => condition.satisfied),
  };
}
