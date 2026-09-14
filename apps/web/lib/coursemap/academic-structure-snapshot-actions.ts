"use server";

import { revalidatePath } from "next/cache";
import { canWriteCatalogue } from "@/lib/auth/viewer";
import type { CoursemapActionResult } from "@/lib/coursemap/actions";
import {
  adminAcademicStructureCollectionPath,
  adminAcademicStructureDetailPath,
} from "@/lib/coursemap/academic-structure-routes";
import {
  parseAcademicStructureManualSnapshotProjection,
  type AcademicStructureManualSnapshotProjection,
} from "@/lib/structure-import/manual-snapshot";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

type ManualSnapshotRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export type SaveAcademicStructureManualSnapshotInput = {
  expectedBaseSnapshotId: number;
  projection: AcademicStructureManualSnapshotProjection;
  structurePublicId: string;
  structureYearId: number;
};

const PUBLIC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
}

function actionError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return "Coursemap could not save this academic structure draft.";
  }
  const code = "code" in error ? String(error.code) : "";
  const message = "message" in error ? String(error.message) : "";
  if (code === "42501" || /permission|authentication/i.test(message)) {
    return "Catalogue write permission is required.";
  }
  if (code === "40001" || /draft changed/i.test(message)) {
    return "This draft changed while you were editing it. Refresh the page and review the current snapshot before trying again.";
  }
  if (/no saved academic structure information changed/i.test(message)) {
    return "No saved academic structure information changed.";
  }
  if (
    code === "22023" ||
    code === "23514" ||
    /projection|requirement|invalid/i.test(message)
  ) {
    return message || "The edited academic structure is not valid.";
  }
  return "Coursemap could not save this academic structure draft.";
}

export async function saveAcademicStructureManualSnapshot(
  input: SaveAcademicStructureManualSnapshotInput,
): Promise<CoursemapActionResult> {
  try {
    if (!(await canWriteCatalogue())) {
      return { ok: false, message: "Catalogue write permission is required." };
    }
    if (!PUBLIC_ID_PATTERN.test(input.structurePublicId)) {
      throw new TypeError("The academic structure identifier is invalid.");
    }
    const structureYearId = positiveId(
      input.structureYearId,
      "Academic structure year",
    );
    const expectedBaseSnapshotId = positiveId(
      input.expectedBaseSnapshotId,
      "Base snapshot",
    );
    const projection = parseAcademicStructureManualSnapshotProjection(
      input.projection,
    );
    const client = (await createClient()) as unknown as ManualSnapshotRpcClient;
    const { data, error } = await client.rpc(
      "create_academic_structure_manual_snapshot",
      {
        p_structure_year_id: structureYearId,
        p_expected_base_snapshot_id: expectedBaseSnapshotId,
        p_projection: projection as unknown as Json,
      },
    );
    if (error) throw error;
    if (typeof data !== "number") {
      throw new Error("The manual snapshot identifier was not returned.");
    }

    revalidatePath(
      adminAcademicStructureCollectionPath(projection.structureKind),
    );
    revalidatePath(
      adminAcademicStructureDetailPath({
        kind: projection.structureKind,
        publicId: input.structurePublicId,
      }),
    );
    return {
      ok: true,
      snapshotId: data,
      message: `${projection.structureCode} was saved as a new draft snapshot. It has not been published.`,
    };
  } catch (error) {
    return { ok: false, message: actionError(error) };
  }
}
