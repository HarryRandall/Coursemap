import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. An unset or blank
 * secret refuses every request rather than leaving the job open.
 */
export function isAuthorisedCronRequest(
  request: Request,
  secret = process.env.CRON_SECRET,
) {
  const expected = secret?.trim();
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  // Comparing digests keeps the comparison constant-time for any length.
  return timingSafeEqual(digest(header), digest(`Bearer ${expected}`));
}
