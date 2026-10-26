import { NextResponse } from "next/server";
import { loadPublishedCoursePage } from "@/lib/coursemap/published-courses";
import type { CourseDetails } from "@/lib/coursemap/course-types";

export const dynamic = "force-dynamic";

function searchCourse(course: CourseDetails) {
  return {
    accent: course.accent,
    code: course.code,
    name: course.name,
    year: course.year,
    units: course.units,
    level: course.level,
    subject: course.subject,
    school: course.school,
    convener: course.convener,
    sessions: course.sessions,
    delivery: course.delivery,
    description: course.description,
    prerequisiteText: course.prerequisiteText,
    prerequisiteCodes: course.prerequisiteCodes,
    incompatibilities: course.incompatibilityText
      ? [course.incompatibilityText]
      : [],
    countsTowards: [],
    sourceUrl: course.sourceUrl,
    lastChanged: course.sourceUpdatedAt ?? "Not listed",
    parseState:
      course.reviewState === "verified"
        ? "Verified"
        : course.reviewState === "review"
          ? "Review"
          : "Automatic",
  };
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const query = searchParams.get("q")?.trim() ?? "";
  // Recommendations ask for known codes instead of a query.
  const codes = (searchParams.get("codes") ?? "")
    .split(",")
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 60);
  // Browsing lists the filtered catalogue before anything is typed.
  const browse = searchParams.get("browse") === "1";
  if (!query && !browse && codes.length === 0)
    return NextResponse.json({ courses: [] });
  const academicYear = Number(searchParams.get("year"));
  if (
    !Number.isInteger(academicYear) ||
    academicYear < 2020 ||
    academicYear > 2030
  ) {
    return NextResponse.json(
      { error: "A valid academic year from 2020 to 2030 is required." },
      { status: 400 },
    );
  }

  try {
    if (!query && !browse) {
      // The response carries list fields only, so the compact directory read
      // serves it instead of the full requisite and fee projection.
      const result = await loadPublishedCoursePage({
        academicYear,
        filters: { codes: codes.join(",") },
        pageSize: codes.length,
      });
      return NextResponse.json({
        courses: result.courses.map(searchCourse),
        page: 1,
        pageSize: result.courses.length,
        total: result.courses.length,
      });
    }
    const requestedPage = Number(searchParams.get("page") ?? "1");
    const requestedPageSize = Number(searchParams.get("pageSize") ?? "8");
    const result = await loadPublishedCoursePage({
      academicYear,
      filters: {
        query,
        level: searchParams.get("level") ?? undefined,
        session: searchParams.get("session") ?? undefined,
        subject: searchParams.get("subject") ?? undefined,
        tag: searchParams.get("tag") ?? undefined,
      },
      page: Number.isFinite(requestedPage) ? requestedPage : 1,
      pageSize: Number.isFinite(requestedPageSize) ? requestedPageSize : 8,
    });
    return NextResponse.json({
      ...result,
      courses: result.courses.map(searchCourse),
    });
  } catch {
    return NextResponse.json(
      { error: "Course search is temporarily unavailable." },
      { status: 503 },
    );
  }
}
