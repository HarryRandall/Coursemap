import { getAuthViewer } from "@/lib/auth/viewer";
import { loadPublishedSurveyReport } from "@/lib/course-surveys/published-surveys";
const HEADERS = { "Cache-Control": "private, no-store" };
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  if (!(await getAuthViewer()))
    return Response.json(
      { error: "Sign in to view student survey results." },
      { status: 401, headers: HEADERS },
    );
  const code = (await params).code.trim().toUpperCase();
  if (!/^[A-Z]{4}[0-9]{4}$/u.test(code))
    return Response.json(
      { error: "Choose a valid course code." },
      { status: 400, headers: HEADERS },
    );
  try {
    return Response.json(
      { report: await loadPublishedSurveyReport(code) },
      { headers: HEADERS },
    );
  } catch {
    return Response.json(
      { error: "Student survey results could not be loaded. Try again." },
      { status: 503, headers: HEADERS },
    );
  }
}
