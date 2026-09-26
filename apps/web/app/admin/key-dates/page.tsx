import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Opens the current Canberra calendar year. */
export default function AdminKeyDatesIndexPage() {
  const year = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
  }).format(new Date());
  redirect(`/admin/key-dates/${year}`);
}
