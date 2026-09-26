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
