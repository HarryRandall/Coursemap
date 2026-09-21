import { redirect } from "next/navigation";
import {
  defaultCatalogueYear,
  loadCatalogueYears,
} from "@/lib/coursemap/admin-catalogue";
import { adminCatalogueYearPath } from "@/lib/coursemap/catalogue-kinds";

export const dynamic = "force-dynamic";

export default async function Page() {
  const years = await loadCatalogueYears();
  redirect(
    adminCatalogueYearPath("major", await defaultCatalogueYear("major", years)),
  );
}
