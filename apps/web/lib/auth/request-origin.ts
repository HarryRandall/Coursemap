import { getSiteOriginForRequest } from "@/lib/supabase/config";

/**
 * The application origin that served this request, behind the local Next.js
 * proxy or a trusted alias. Null when no canonical site origin is configured.
 */
export function requestSiteOrigin(request: Request) {
  return getSiteOriginForRequest(
    new URL(request.url),
    request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
    request.headers.get("x-forwarded-proto"),
  );
}

/**
 * Cookie-authenticated mutations must come from a Coursemap page. A browser
 * always sends Origin on a cross-site POST or DELETE, so a missing or foreign
 * value is refused rather than trusted.
 */
export function isSameOriginRequest(request: Request) {
  const siteOrigin = requestSiteOrigin(request);
  return Boolean(siteOrigin) && request.headers.get("origin") === siteOrigin;
}
