const STUDENT_NUMBER_PATTERN = /^u\d{7}$/;

/** Returns the lower-case student number, "" when blank, or null when invalid. */
export function normaliseStudentNumber(value: string) {
  const studentNumber = value.trim().toLowerCase();
  if (!studentNumber) return "";
  return STUDENT_NUMBER_PATTERN.test(studentNumber) ? studentNumber : null;
}
