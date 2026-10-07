import { withSyncDatabaseClient } from "@/lib/catalogue-sync/sync-store";
import { seltReportSchema } from "@/lib/selt/contract";
import {
  importSeltReport,
  SeltAuthenticationError,
  withSeltToken,
} from "@/lib/selt/store";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BYTES = 256 * 1024;
function bearerToken(request: Request) {
  const match = request.headers
    .get("authorization")
    ?.match(/^Bearer ([A-Za-z0-9_-]{43})$/u);
  if (!match) throw new SeltAuthenticationError();
  return match[1]!;
}
async function requestBody(request: Request) {
  if (!request.body) throw new TypeError("Provide an extracted SELT report.");
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES)
        throw new TypeError("The SELT report exceeds the upload limit.");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
export async function GET(request: Request) {
  try {
    const token = bearerToken(request);
    const codes = await withSyncDatabaseClient((sql) =>
      withSeltToken(sql, token, async (tx) => {
        const rows =
          await tx`select code from public.catalogue_codes where kind = 'course' and code ~ '^[A-Z]{4}[0-9]{4}$' order by code`;
        return rows.map((row) => String(row.code));
      }),
    );
    return Response.json(
      { codes },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SeltAuthenticationError
            ? error.message
            : "The course list could not be loaded.",
      },
      {
        status: error instanceof SeltAuthenticationError ? 401 : 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
export async function POST(request: Request) {
  try {
    const token = bearerToken(request);
    // Authenticate before reading or validating potentially expensive input.
    await withSyncDatabaseClient((sql) =>
      withSeltToken(sql, token, async () => true),
    );
    const parsed = seltReportSchema.safeParse(await requestBody(request));
    if (!parsed.success)
      return Response.json(
        {
          error: "The extracted SELT report is invalid.",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    const result = await withSyncDatabaseClient((sql) =>
      importSeltReport(sql, token, parsed.data),
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status =
      error instanceof SeltAuthenticationError
        ? 401
        : error instanceof TypeError || error instanceof SyntaxError
          ? 400
          : 500;
    return Response.json(
      {
        error:
          status === 401 && error instanceof Error
            ? error.message
            : status === 400
              ? "The SELT report could not be accepted."
              : "The SELT upload failed. Retry this report.",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
