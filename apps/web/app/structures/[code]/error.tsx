"use client";

import { StructureCatalogueError } from "@/ui/requirements/structure-catalogue-error";

export default function StructureError({ reset }: { reset: () => void }) {
  return <StructureCatalogueError onRetry={reset} />;
}
