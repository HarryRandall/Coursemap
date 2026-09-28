import { NextResponse } from "next/server";
import { academicPeriodTerm } from "@/lib/coursemap/academic-periods";
import { createPublicClient } from "@/lib/supabase/public-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("academic_periods")
    .select("calendar_year,code,ends_on,name,short_name,starts_on,sort_order")
    .eq("status", "published")
    .order("calendar_year")
    .order("sort_order");
  if (error) {
    return NextResponse.json(
      { error: "Semester options are temporarily unavailable." },
      { status: 503 },
    );
  }

  const terms = (data ?? []).map(academicPeriodTerm);
  terms.push({
    id: "unscheduled",
    year: 9999,
    name: "Later",
    shortName: "Later",
    dates: "Choose when ready",
  });
  return NextResponse.json({ terms });
}
