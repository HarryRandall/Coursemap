import { NextResponse } from "next/server";
import { loadPublishedCoursePage } from "@/lib/coursemap/published-courses";
import { planCourseFromDetails } from "@/lib/coursemap/plan-catalogue";
import { courseLevelBounds } from "@/lib/coursemap/course-level-filter";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year"));
  const cursor = Number(params.get("cursor") ?? "1");
  const codes = params.get("codes") ?? "";
  const subject = params.get("subject") ?? "";
  const tag = params.get("tag") ?? "";
  const level = params.get("level") ?? "";
  // Narrows the rule's courses by code or name as a student types.
  const query = params.get("q")?.trim() ?? "";
  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2030 ||
    !Number.isInteger(cursor) ||
    cursor < 1 ||
    cursor > 1000 ||
    (!codes && !subject && !tag) ||
    codes.length > 12000 ||
    tag.length > 200 ||
    query.length > 80 ||
    (codes &&
      !codes.split(",").every((code) => /^[A-Z]{4}\d{4}[A-Z]?$/u.test(code))) ||
    (subject &&
      !subject.split(/[,\s]+/u).every((code) => /^[A-Z]{4}$/u.test(code))) ||
    (level && !courseLevelBounds(level))
  ) {
    return NextResponse.json(
      { error: "A valid bounded course rule and catalogue year are required." },
      { status: 400 },
    );
  }
  try {
    const result = await loadPublishedCoursePage({
      academicYear: year,
      filters: { codes, subject, tag, level, query },
      page: cursor,
      pageSize: 12,
    });
    return NextResponse.json({
      courses: result.courses.map(planCourseFromDetails),
      total: result.total,
      nextCursor: cursor * 12 < result.total ? String(cursor + 1) : null,
    });
  } catch {
    return NextResponse.json(
      { error: "Matching courses are temporarily unavailable." },
      { status: 503 },
    );
  }
}
