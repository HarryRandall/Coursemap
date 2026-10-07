import { redirect } from "next/navigation";
import {
  canManageCatalogueOperations,
  canWriteCourses,
} from "@/lib/auth/viewer";
import { AppShell } from "@/ui/shell";
import { SeltImports } from "@/ui/admin/selt/selt-imports";
export const dynamic = "force-dynamic";
export default async function SeltPage() {
  if (!(await canManageCatalogueOperations())) redirect("/admin");
  return (
    <AppShell admin>
      <SeltImports canPublish={await canWriteCourses()} />
    </AppShell>
  );
}
