import { type NextRequest, NextResponse } from "next/server";
import { requestSiteOrigin } from "@/lib/auth/request-origin";
import {
  GUEST_PLAN_COOKIE,
  GUEST_PLAN_MAX_AGE,
  emptyGuestState,
  encodeGuestPlan,
} from "@/lib/coursemap/guest-plan";

/**
 * Starts planning without an account. An existing guest plan is kept, so the
 * button doubles as a way back in; a new one starts at onboarding.
 */
export async function POST(request: NextRequest) {
  const siteOrigin = requestSiteOrigin(request) ?? request.nextUrl.origin;
  if (request.headers.get("origin") !== siteOrigin) {
    return new NextResponse("Invalid request origin.", {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const existing = request.cookies.get(GUEST_PLAN_COOKIE)?.value;
  const response = NextResponse.redirect(
    new URL(existing ? "/dashboard" : "/onboarding", siteOrigin),
    303,
  );
  response.headers.set("Cache-Control", "private, no-store");
  if (!existing) {
    const [value] = encodeGuestPlan(emptyGuestState()) ?? [];
    response.cookies.set(GUEST_PLAN_COOKIE, value, {
      path: "/",
      maxAge: GUEST_PLAN_MAX_AGE,
      sameSite: "lax",
      secure: siteOrigin.startsWith("https:"),
      // The planner rewrites this cookie in the browser on every change.
      httpOnly: false,
    });
  }
  return response;
}
