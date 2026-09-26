import { NextResponse } from "next/server";
import {
  loadPublishedCoursePage,
  loadPublishedCoursesByCodes,
} from "@/lib/coursemap/published-courses";
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
    .map((code) => code.trim())
    .filter(Boolean)
    .slice(0, 60);
  if (!query && codes.length === 0) return NextResponse.json({ courses: [] });
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
    if (!query) {
      const courses = await loadPublishedCoursesByCodes(codes, academicYear);
      return NextResponse.json({
        courses: courses.map(searchCourse),
        page: 1,
        pageSize: courses.length,
        total: courses.length,
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
