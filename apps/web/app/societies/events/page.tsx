import { redirect } from "next/navigation";

export default function SocietyEventsPage() {
  redirect("/societies?tab=events");
}
