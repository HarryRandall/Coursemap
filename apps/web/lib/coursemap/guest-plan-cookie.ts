import {
  GUEST_PLAN_MAX_AGE,
  GUEST_PLAN_MAX_CHUNKS,
  encodeGuestPlan,
  guestPlanChunkName,
} from "@/lib/coursemap/guest-plan";
import type { AppState } from "@/lib/coursemap/types";

function setCookie(name: string, value: string, maxAge: number) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/**
 * Saves a guest's plan in this browser. Returns false when the plan has
 * outgrown what cookies can hold, leaving the last saved plan in place.
 */
export function writeGuestPlanCookie(state: AppState) {
  const chunks = encodeGuestPlan(state);
  if (!chunks) return false;
  for (let index = 0; index < GUEST_PLAN_MAX_CHUNKS; index += 1) {
    const chunk = chunks[index];
    if (chunk === undefined) setCookie(guestPlanChunkName(index), "", 0);
    else setCookie(guestPlanChunkName(index), chunk, GUEST_PLAN_MAX_AGE);
  }
  return true;
}

export function clearGuestPlanCookie() {
  for (let index = 0; index < GUEST_PLAN_MAX_CHUNKS; index += 1) {
    setCookie(guestPlanChunkName(index), "", 0);
  }
}
