import type {
  AcademicTermPoint,
  GradeTally,
} from "@/lib/coursemap/academic-metrics";
import type { DegreeUnitProgress } from "@/lib/planner";
import { gradeBands, gradeForMark } from "@/lib/academic/metrics";

/**
 * One example student for the landing page's dashboard overview: four
 * finished semesters and a fifth in progress, in the shapes the dashboard's
 * own metric cards take.
 */
export const overviewTerms: AcademicTermPoint[] = [
  {
    id: "2024-s1",
    label: "S1 '24",
    year: 2024,
    wam: 71,
    gpa: 5.5,
    units: 24,
    courses: 4,
    marks: [
      { code: "COMP1100", mark: 76 },
      { code: "MATH1013", mark: 68 },
      { code: "SCOM1001", mark: 72 },
      { code: "STAT1003", mark: 67 },
    ],
  },
  {
    id: "2024-s2",
    label: "S2 '24",
    year: 2024,
    wam: 69,
    gpa: 5.25,
    units: 24,
    courses: 4,
    marks: [
      { code: "COMP1110", mark: 71 },
      { code: "COMP1600", mark: 64 },
      { code: "MATH1014", mark: 66 },
      { code: "ECON1101", mark: 74 },
    ],
  },
  {
    id: "2025-s1",
    label: "S1 '25",
    year: 2025,
    wam: 75,
    gpa: 5.75,
    units: 24,
    courses: 4,
    marks: [
      { code: "COMP2100", mark: 78 },
      { code: "COMP2300", mark: 73 },
      { code: "COMP2420", mark: 77 },
      { code: "MATH2222", mark: 70 },
    ],
  },
  {
    id: "2025-s2",
    label: "S2 '25",
    year: 2025,
    wam: 79,
    gpa: 6.25,
    units: 24,
    courses: 4,
    marks: [
      { code: "COMP2120", mark: 82 },
      { code: "COMP2310", mark: 76 },
      { code: "COMP3600", mark: 80 },
      { code: "STAT2001", mark: 77 },
    ],
  },
  {
    id: "2026-s1",
    label: "S1 '26",
    year: 2026,
    wam: 82,
    gpa: 6.5,
    units: 24,
    courses: 4,
    marks: [
      { code: "COMP3120", mark: 85 },
      { code: "COMP3425", mark: 81 },
      { code: "COMP3670", mark: 83 },
      { code: "COMP3900", mark: 79 },
    ],
  },
];

export const overviewGpa = 5.9;

const marks = overviewTerms.flatMap((term) =>
  term.marks.map((item) => gradeForMark(item.mark)),
);

export const overviewGrades: GradeTally[] = gradeBands.map((band) => ({
  code: band.code,
  label: band.label,
  count: marks.filter((code) => code === band.code).length,
}));

/** 120 units done, 12 enrolled this semester and the last 12 still to place. */
export const overviewProgress: DegreeUnitProgress = {
  completed: 120,
  planned: 12,
  remaining: 12,
  mapped: 132,
  total: 144,
  percent: 83,
};
export const overviewEnrolledUnits = 12;
export const overviewUnitTarget = 144;
