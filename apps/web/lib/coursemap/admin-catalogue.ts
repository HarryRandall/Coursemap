import "server-only";
import { emptyCatalogueContent } from "@/lib/catalogue/content";
import { contentHashForCatalogueContent } from "@/lib/catalogue-import/version-content";
import { createClient } from "@/lib/supabase/server";
import type {
  CatalogueDirectoryPage,
  CatalogueDirectoryRecord,
  CatalogueKind,
  CatalogueRecordState,
} from "./catalogue-kinds";

export * from "./catalogue-kinds";

const PAGE_SIZE = 50;

export async function loadCatalogueYears() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("academic_years")
    .select("year")
    .gte("year", 2020)
    .lte("year", 2030);
  if (error) throw error;
  return (data ?? [])
    .map((row) => row.year)
    .sort((left, right) => right - left);
}

export async function defaultCatalogueYear(
  kind: CatalogueKind,
  years: number[],
) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("catalogue_records")
    .select("academic_years(year)")
    .eq("kind", kind)
    .order("academic_year_id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const available = data?.academic_years?.year;
  if (available && years.includes(available)) return available;
  const current = new Date().getFullYear();
  return years.includes(current) ? current : (years[0] ?? current);
}

export async function loadCatalogueDirectoryPage({
  kind,
  academicYear,
  query = "",
  state = null,
  page = 1,
}: {
  kind: CatalogueKind;
  academicYear: number;
  query?: string;
  /** Narrows to the state the row's badge reports. Null leaves every row in. */
  state?: CatalogueRecordState | null;
  page?: number;
}): Promise<CatalogueDirectoryPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_catalogue_directory_page", {
    p_kind: kind,
    p_academic_year: academicYear,
    p_query: query,
    p_state: state ?? undefined,
    p_page: Math.max(1, Math.floor(page)),
  });
  if (error) throw error;
  // The RPC returns only the selected page. Keep canonical empty-draft hashing
  // here so SQL does not duplicate the catalogue content serialisation contract.
  const result = data as unknown as {
    years: number[];
    status: CatalogueDirectoryPage["status"];
    total: number;
    page: number;
    records: Array<
      Omit<CatalogueDirectoryRecord, "hasChanges"> & {
        draftHash: string | null;
        publishedHash: string | null;
        hasPublication: boolean;
      }
    >;
  };
  return {
    kind,
    academicYear,
    years: result.years,
    status: result.status,
    total: result.total,
    page: result.page,
    pageSize: PAGE_SIZE,
    records: result.records.map(
      ({ draftHash, publishedHash, hasPublication, ...record }) => ({
        ...record,
        hasChanges:
          record.hasDraft &&
          draftHash !==
            (hasPublication
              ? publishedHash
              : contentHashForCatalogueContent(
                  emptyCatalogueContent({
                    kind,
                    code: record.code,
                    academicYear,
                    title: record.title,
                  }),
                )),
      }),
    ),
  };
}
