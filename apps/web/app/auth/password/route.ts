import { type NextRequest, NextResponse } from "next/server";

import { safeInternalRedirect } from "@/lib/auth/redirect";
import {
  getSiteOriginForRequest,
  getSupabaseConfig,
} from "@/lib/supabase/config";
import { createRequestClient } from "@/lib/supabase/request";

function noStore(response: NextResponse) {
  response.headers.set(
    "Cache-Control",
    "private, no-cache, no-store, must-revalidate, max-age=0",
  );
  response.headers.set("Expires", "0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function loginRedirect(origin: string, next: string) {
  const url = new URL("/login", origin);
  url.searchParams.set("next", next);
  url.searchParams.set("error", "invalid-login");
  return noStore(NextResponse.redirect(url, 303));
}

export async function POST(request: NextRequest) {
  const siteOrigin = getSiteOriginForRequest(
    request.nextUrl,
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto"),
  );
  if (!siteOrigin || !getSupabaseConfig()) {
    return new NextResponse("Coursemap authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  if (request.headers.get("origin") !== siteOrigin) {
    return new NextResponse("Invalid request origin.", {
      status: 403,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const formData = await request.formData();
  const emails = formData.getAll("email");
  const passwords = formData.getAll("password");
  const nextValues = formData.getAll("next");
  const email = emails.length === 1 ? emails[0] : null;
  const password = passwords.length === 1 ? passwords[0] : null;
  const next = safeInternalRedirect(
    nextValues.length === 1 && typeof nextValues[0] === "string"
      ? nextValues[0]
      : null,
  );

  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    email.length > 254 ||
    password.length < 8 ||
    password.length > 128
  ) {
    return loginRedirect(siteOrigin, next);
  }

  const response = noStore(
    NextResponse.redirect(new URL(next, siteOrigin), 303),
  );
  const { supabase, applyTo } = createRequestClient(request, response);
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) return applyTo(loginRedirect(siteOrigin, next));
  return response;
}
