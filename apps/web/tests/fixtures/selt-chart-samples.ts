import type {
  CourseSurveyResults,
  SurveySemester,
  SurveySession,
} from "@/lib/course-surveys/survey-results";

// Design prototype data extracted from the ANU Insight time-series reports.
// Real results will be imported into the database; until then only these
// courses show charts.

type SampleRow = [
  year: number,
  session: SurveySession,
  enrolments: number,
  respondents: number,
  agreement: [
    teaching: number,
    workload: number,
    feedback: number,
    analytical: number,
    overall: number,
  ],
];

function surveys(rows: SampleRow[]): SurveySemester[] {
  return rows.map(([year, session, enrolments, respondents, agreement]) => ({
    year,
    session,
    enrolments,
    respondents,
    agreementPercent: {
      teaching_and_learning_activities: agreement[0],
      workload: agreement[1],
      feedback: agreement[2],
      analytical_development: agreement[3],
      overall_learning_experience: agreement[4],
    },
  }));
}

const SAMPLE_RESULTS: CourseSurveyResults[] = [
  {
    courseCode: "COMP1730",
    sourceName: "ANU Insight Data Warehouse",
    surveys: surveys([
      [2019, "sem_1", 197, 62, [68, 65, 56, 71, 71]],
      [2019, "sem_2", 290, 79, [65, 62, 53, 68, 62]],
      [2020, "sem_2", 252, 55, [67, 71, 67, 76, 72]],
      [2021, "sem_1", 294, 77, [73, 71, 67, 72, 73]],
      [2021, "sem_2", 287, 57, [66, 68, 56, 79, 70]],
      [2022, "sem_1", 338, 86, [64, 67, 61, 69, 67]],
      [2022, "sem_2", 227, 46, [50, 52, 35, 50, 57]],
      [2023, "sem_1", 270, 84, [48, 43, 23, 56, 44]],
      [2023, "sem_2", 206, 36, [66, 67, 64, 78, 71]],
      [2024, "sem_1", 261, 57, [70, 79, 51, 75, 68]],
      [2024, "sem_2", 190, 35, [69, 66, 59, 77, 74]],
      [2025, "sem_1", 192, 45, [53, 49, 27, 55, 49]],
      [2025, "sem_2", 142, 38, [95, 76, 66, 92, 76]],
    ]),
  },
  {
    courseCode: "COMP2310",
    sourceName: "ANU Insight Data Warehouse",
    surveys: surveys([
      [2019, "sem_2", 242, 61, [72, 54, 66, 83, 76]],
      [2020, "sem_2", 232, 60, [80, 63, 78, 81, 76]],
      [2021, "sem_2", 212, 39, [71, 38, 45, 79, 70]],
      [2022, "sem_2", 254, 71, [58, 45, 28, 62, 46]],
      [2023, "sem_2", 180, 58, [45, 22, 36, 53, 49]],
      [2024, "sem_2", 189, 50, [85, 58, 65, 85, 81]],
      [2025, "sem_2", 140, 36, [61, 50, 47, 72, 67]],
    ]),
  },
];

export function sampleSurveyResults(courseCode: string) {
  return (
    SAMPLE_RESULTS.find((results) => results.courseCode === courseCode) ?? null
  );
}
