import { updateTag } from "next/cache";

export const PUBLISHED_CAMPUS_MAP_TAG = "published-campus-map";

/** A save may publish a map or replace an existing publication with a draft. */
export function revalidatePublishedCampusMap() {
  updateTag(PUBLISHED_CAMPUS_MAP_TAG);
}
