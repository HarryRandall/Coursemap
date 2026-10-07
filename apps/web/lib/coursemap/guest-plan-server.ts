import { cookies } from "next/headers";
import {
  GUEST_PLAN_MAX_CHUNKS,
  decodeGuestPlan,
  guestPlanChunkName,
} from "@/lib/coursemap/guest-plan";

/** The guest plan saved in this browser's cookies, or null without one. */
export async function readGuestPlan() {
  const store = await cookies();
  return decodeGuestPlan((name) => store.get(name)?.value);
}

/** Removes the guest plan cookies, from a server action or route handler. */
export async function clearGuestPlan() {
  const store = await cookies();
  for (let index = 0; index < GUEST_PLAN_MAX_CHUNKS; index += 1) {
    store.delete(guestPlanChunkName(index));
  }
}
