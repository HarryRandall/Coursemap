export type ImportDiagnostic = {
  code: string;
  severity: "warning" | "error";
  message: string;
  field?: string;
  sourceFragment?: string;
};

export type ImportManifestSource = {
  name: string;
  kind: string;
  baseUrl: string;
};

export const ANU_PROGRAMS_AND_COURSES_SOURCE = {
  name: "ANU Programs and Courses",
  kind: "anu_programs_courses_html",
  baseUrl: "https://programsandcourses.anu.edu.au",
} satisfies ImportManifestSource;
