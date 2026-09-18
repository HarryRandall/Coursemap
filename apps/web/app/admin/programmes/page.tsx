import {
  CatalogueDirectoryPage,
  type SearchParams,
} from "@/ui/admin/catalogue/catalogue-pages";

export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  return (
    <CatalogueDirectoryPage kind="programme" searchParams={searchParams} />
  );
}
