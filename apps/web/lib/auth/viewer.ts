import { cache } from "react";
import type { CatalogueKind } from "@/lib/catalogue/content";
import { importPublicationPermission } from "@/lib/catalogue-runs/kinds";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AuthViewer = {
  id: string;
  email: string | null;
};

export type AuthContext = {
  viewer: AuthViewer | null;
  canAccessAdmin: boolean;
};

const loadVerifiedViewer = cache(async (): Promise<AuthViewer | null> => {
  if (!getSupabaseConfig()) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const subject = data?.claims.sub;
    if (error || typeof subject !== "string" || !subject) return null;
    return {
      id: subject,
      email: typeof data.claims.email === "string" ? data.claims.email : null,
    };
  } catch {
    return null;
  }
});

const currentUserHasPermission = cache(async (requiredPermission: string) => {
  if (!(await loadVerifiedViewer())) return false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("current_user_has_permission", {
      required_permission: requiredPermission,
    });
    return !error && data === true;
  } catch {
    return false;
  }
});

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  const viewer = await loadVerifiedViewer();
  return {
    viewer,
    canAccessAdmin: viewer
      ? await currentUserHasPermission("admin.access")
      : false,
  };
});

export async function getAuthViewer(): Promise<AuthViewer | null> {
  return (await getAuthContext()).viewer;
}

/** Check the permission required to run programme and calendar imports. */
/**
 * The permission for ANU operations: running syncs and discovery, choosing an
 * extraction model, and reading the technical record of either. Separate from
 * catalogue.write, which authors and publishes content.
 */
export async function canManageCatalogueOperations() {
  return currentUserHasPermission("imports.manage");
}

/** Check the permission required to edit, publish and archive courses. */
export async function canWriteCourses() {
  return currentUserHasPermission("courses.write");
}

/** Check the permission required to edit and publish academic structures. */
export async function canWriteCatalogue() {
  return currentUserHasPermission("catalogue.write");
}

/**
 * Check the permission required to edit and publish one kind of record:
 * courses.write for courses, catalogue.write for academic structures.
 */
export async function canWriteCatalogueRecord(kind: CatalogueKind) {
  return currentUserHasPermission(importPublicationPermission(kind));
}

/**
 * Check the permission to read other students' plans, results and student
 * numbers. Opening administration does not imply it.
 */
export async function canReadStudentRecords() {
  return currentUserHasPermission("students.read");
}

/** Check the narrower permission required to manage Room Finder data. */
export async function canManageRooms() {
  return currentUserHasPermission("rooms.manage");
}
