import { notFound } from "next/navigation";
import {
  AcademicStructureDirectoryPage,
  type AcademicStructureDirectorySearchParams,
} from "@/ui/admin/academic-structures/structure-directory-page";

export const dynamic = "force-dynamic";

export default async function AdminProgrammesPage({
  searchParams,
}: {
  searchParams: Promise<
    AcademicStructureDirectorySearchParams & {
      kind?: string | string[];
    }
  >;
}) {
  const params = await searchParams;
  if (params.kind !== undefined) notFound();

  return (
    <AcademicStructureDirectoryPage
      kind="programme"
      searchParams={Promise.resolve(params)}
    />
  );
}
