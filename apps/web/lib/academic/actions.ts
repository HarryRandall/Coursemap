"use server";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export async function saveAcademicResult(
  id: string,
  operation: "save" | "clear" | "remove",
  mark?: number,
  grade?: string,
  units?: number,
): Promise<{ ok: boolean; message: string; detail?: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_current_user_academic_result", {
      p_id: id,
      p_operation: operation,
      p_mark: mark,
      p_grade: grade,
      p_units: units,
    });
    if (error) throw error;
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        operation === "remove"
          ? "Course removed."
          : operation === "clear"
            ? "Result cleared."
            : "Result saved.",
    };
  } catch (error) {
    const detail =
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof error.message === "string"
        ? error.message
        : "The academic result request failed.";
    const { canAccessAdmin } = await getAuthContext();
    return {
      ok: false,
      message: "Couldn't save that result",
      ...(canAccessAdmin ? { detail } : {}),
    };
  }
}
