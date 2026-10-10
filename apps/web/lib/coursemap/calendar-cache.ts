import { updateTag } from "next/cache";

export const PUBLISHED_UNIVERSITY_CALENDAR_TAG =
  "published-university-calendar";

export function revalidatePublishedUniversityCalendar() {
  updateTag(PUBLISHED_UNIVERSITY_CALENDAR_TAG);
}
