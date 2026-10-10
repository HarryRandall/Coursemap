import { loadPublishedSurveyReport } from "@/lib/course-surveys/published-surveys";
const HEADERS = { "Cache-Control": "private, no-store" };
const PUBLIC_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=60" };
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const code = (await params).code.trim().toUpperCase();
  if (!/^[A-Z]{4}[0-9]{4}$/u.test(code))
    return Response.json(
      { error: "Choose a valid course code." },
      { status: 400, headers: HEADERS },
    );
  try {
    return Response.json(
      { report: await loadPublishedSurveyReport(code) },
      { headers: PUBLIC_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "Student survey results could not be loaded. Try again." },
      { status: 503, headers: HEADERS },
    );
  }
}
