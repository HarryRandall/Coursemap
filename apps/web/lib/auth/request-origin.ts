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
 * The deployment's own URLs. Vercel sets these hostnames in the server
 * environment, so a preview deployment can accept its own pages without
 * trusting anything the request says about where it came from.
 */
function vercelDeploymentOrigins() {
  return [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].flatMap(
    (host) => {
      const trimmed = host?.trim();
      if (!trimmed || !/^[a-z0-9.-]+$/iu.test(trimmed)) return [];
      return [`https://${trimmed.toLowerCase()}`];
    },
  );
}

/**
 * Cookie-authenticated mutations must come from a Coursemap page. A browser
 * always sends Origin on a cross-site POST or DELETE, so a missing or foreign
 * value is refused rather than trusted.
 */
export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return (
    origin === requestSiteOrigin(request) ||
    vercelDeploymentOrigins().includes(origin)
  );
}
