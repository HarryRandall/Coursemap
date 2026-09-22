import { CatalogueLoading } from "@/ui/admin/catalogue-table/catalogue-loading";

export default function Loading() {
  return (
    <CatalogueLoading noun="programmes" layout="directory" hideAcademicYear />
  );
}
