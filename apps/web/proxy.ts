import { type NextRequest, NextResponse } from "next/server";
import {
  requestPathWithSearch,
  safeInternalRedirect,
} from "@/lib/auth/redirect";
import {
  getSiteOriginForRequest,
  getSupabaseConfig,
} from "@/lib/supabase/config";
import { createRequestClient } from "@/lib/supabase/request";

const PROTECTED_ROUTE_PREFIXES = [
  "/compass",
  "/admin",
  "/dashboard",
  "/onboarding",
  "/plan",
  "/profile",
  "/requirements",
  "/academic",
  "/calendar",
  "/roadmap",
  "/rooms",
  "/printing",
  "/help",
  "/history",
  "/timetable",
] as const;

function privateNoStore(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function isProtectedRoute(pathname: string) {
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function signInRedirect(request: NextRequest) {
  const siteOrigin = getSiteOriginForRequest(
    request.nextUrl,
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto"),
  );
  if (!siteOrigin) {
    return new NextResponse("Coursemap authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const signInUrl = new URL("/login", siteOrigin);
  signInUrl.searchParams.set(
    "next",
    safeInternalRedirect(requestPathWithSearch(request.nextUrl)),
  );
  return privateNoStore(NextResponse.redirect(signInUrl));
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  });
  const protectedRoute = isProtectedRoute(request.nextUrl.pathname);

  if (!getSupabaseConfig()) {
    return protectedRoute ? signInRedirect(request) : response;
  }

  const { supabase, applyTo } = createRequestClient(request, response);
  const { data, error } = await supabase.auth.getClaims();
  const authenticated = !error && Boolean(data?.claims.sub);

  if (protectedRoute && !authenticated) {
    return applyTo(signInRedirect(request));
  }

  const downstreamResponse = applyTo(
    NextResponse.next({
      request: { headers: request.headers },
    }),
  );

  return authenticated
    ? privateNoStore(downstreamResponse)
    : downstreamResponse;
}

export const config = {
  matcher: [
    "/((?!design-system(?:/|$)|admin/design-system(?:-preview)?(?:/|$)|api/design-system(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
