import { isAuthorisedCronRequest } from "@/lib/catalogue-sync/cron-authorisation";
import { sweepCatalogueSyncs } from "@/lib/catalogue-sync/sync-sweeper";
import { safeErrorSummary } from "@/lib/catalogue-sync/process-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorisedCronRequest(request))
    return Response.json(
      { error: "Cron authorisation is required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  try {
    return Response.json(await sweepCatalogueSyncs(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: `The catalogue sync sweep failed. ${safeErrorSummary(error)}` },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
