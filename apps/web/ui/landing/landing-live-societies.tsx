import { loadLandingSocieties } from "@/lib/coursemap/landing-data";
import { LandingSocieties } from "@/ui/landing/landing-societies";

/** Published societies, streamed in once the directory loads. */
export async function LandingLiveSocieties() {
  const rows = await loadLandingSocieties();
  return rows.length > 0 ? (
    <LandingSocieties rows={rows} />
  ) : (
    <p className="text-sm text-muted-foreground">
      Societies appear here once the directory is published.
    </p>
  );
}
