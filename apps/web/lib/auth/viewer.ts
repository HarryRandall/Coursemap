import { cache } from "react";
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

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  if (!getSupabaseConfig()) {
    return { viewer: null, canAccessAdmin: false };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const subject = data?.claims.sub;

    if (error || typeof subject !== "string" || !subject) {
      return { viewer: null, canAccessAdmin: false };
    }

    const viewer = {
      id: subject,
      email: typeof data.claims.email === "string" ? data.claims.email : null,
    };
    const { data: canAccessAdmin, error: permissionError } = await supabase.rpc(
      "current_user_has_permission",
      {
        required_permission: "admin.access",
      },
    );

    return {
      viewer,
      canAccessAdmin: !permissionError && canAccessAdmin === true,
    };
  } catch {
    return { viewer: null, canAccessAdmin: false };
  }
});

export async function getAuthViewer(): Promise<AuthViewer | null> {
  return (await getAuthContext()).viewer;
}

async function currentUserHasPermission(requiredPermission: string) {
  if (!getSupabaseConfig()) return false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || typeof data?.claims.sub !== "string") return false;

    const { data: allowed, error: permissionError } = await supabase.rpc(
      "current_user_has_permission",
      { required_permission: requiredPermission },
    );
    return !permissionError && allowed === true;
  } catch {
    return false;
  }
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

/** Check the narrower permission required to manage Room Finder data. */
export async function canManageRooms() {
  if (!getSupabaseConfig()) return false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || typeof data?.claims.sub !== "string") return false;

    const { data: allowed, error: permissionError } = await supabase.rpc(
      "current_user_has_permission",
      { required_permission: "rooms.manage" },
    );
    return !permissionError && allowed === true;
  } catch {
    return false;
  }
}
