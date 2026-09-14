import { AcademicStructureDetailPage } from "@/ui/admin/academic-structures/academic-structure-detail-page";
export default async function VersionPage(props: {
  params: Promise<{ id: string; versionId: string }>;
  searchParams: Promise<{ import?: string }>;
}) {
  const params = await props.params;
  return (
    <AcademicStructureDetailPage
      {...props}
      expectedKind="programme"
      versionPublicId={params.versionId}
    />
  );
}
