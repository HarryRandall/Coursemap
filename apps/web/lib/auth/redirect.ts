const FALLBACK_PATH = "/dashboard";
const AUTH_HANDLER_PATHS = [
  "/auth/callback",
  "/auth/confirm",
  "/auth/logout",
  "/auth/password",
  "/auth/sign-in",
] as const;

function fullyDecodePath(pathname: string) {
  let decoded = pathname;

  for (let pass = 0; pass < 8; pass += 1) {
    const next = decodeURIComponent(decoded);
    if (next === decoded) return decoded;
    decoded = next;
  }

  return decoded;
}

function isUnsafeDecodedPath(pathname: string) {
  const normalised = pathname.toLowerCase();
  return (
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(pathname) ||
    AUTH_HANDLER_PATHS.some(
      (handler) =>
        normalised === handler ||
        normalised.startsWith(`${handler}/`) ||
        normalised.startsWith(`${handler}?`) ||
        normalised.startsWith(`${handler}#`),
    )
  );
}

/**
 * Accept only a path on this application. This keeps `next` parameters from
 * becoming open redirects after authentication.
 */
export function safeInternalRedirect(
  candidate: string | null | undefined,
  fallback = FALLBACK_PATH,
) {
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return fallback;
  }

  try {
    const base = new URL("https://coursemap.invalid");
    const resolved = new URL(candidate, base);
    if (resolved.origin !== base.origin) return fallback;
    const decodedPathname = fullyDecodePath(resolved.pathname);
    if (isUnsafeDecodedPath(decodedPathname)) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

export function requestPathWithSearch(url: URL) {
  return `${url.pathname}${url.search}`;
}
