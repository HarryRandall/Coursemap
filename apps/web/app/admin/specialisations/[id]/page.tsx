import { AcademicStructureDetailPage } from "@/ui/admin/academic-structures/academic-structure-detail-page";
export const dynamic = "force-dynamic";
export default function AcademicStructureYearPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; import?: string; snapshot?: string }>;
}) {
  return (
    <AcademicStructureDetailPage expectedKind="specialisation" {...props} />
  );
}
