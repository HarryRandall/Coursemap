import { loadAdminKeyDatesYear } from "@/lib/admin/key-dates";
import { KeyDatesChangelog } from "@/ui/admin/key-dates/key-dates-changelog";
import { KeyDatesLoadError } from "@/ui/admin/key-dates/key-dates-load-error";
import { calendarYearParam } from "../year-param";

export const dynamic = "force-dynamic";

export default async function AdminKeyDatesChangelogPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const year = calendarYearParam((await params).year);
  const data = await loadAdminKeyDatesYear(year).catch(() => null);
  if (!data) return <KeyDatesLoadError year={year} />;

  return <KeyDatesChangelog entries={data.changelog} year={year} />;
}
