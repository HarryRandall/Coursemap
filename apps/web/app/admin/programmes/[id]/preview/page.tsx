import { AcademicStructureDetailPage } from "@/ui/admin/academic-structures/academic-structure-detail-page";
export default function CataloguePage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; import?: string; snapshot?: string }>;
}) {
  return (
    <AcademicStructureDetailPage
      {...props}
      expectedKind="programme"
      pageView="preview"
    />
  );
}
