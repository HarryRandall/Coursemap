import { beforeEach, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;
const tables = new Map<string, Row[]>();
const requests: { table: string; ids: number; from: number }[] = [];

/** A PostgREST stand-in that honours `.in()`, `.eq()` and `.range()` and caps pages at 1000 rows. */
function query(table: string) {
  let rows = tables.get(table) ?? [];
  let ids = 0;
  let from = 0;
  let to = Number.POSITIVE_INFINITY;
  const builder = {
    select: () => builder,
    neq: () => builder,
    is: () => builder,
    not: () => builder,
    order: () => builder,
    eq: (column: string, value: unknown) => {
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      ids = values.length;
      const set = new Set(values);
      rows = rows.filter((row) => set.has(row[column]));
      return builder;
    },
    range: (start: number, end: number) => {
      from = start;
      to = end;
      return builder;
    },
    then: (resolve: (value: unknown) => void) => {
      requests.push({ table, ids, from });
      resolve({
        data: rows.slice(from, Math.min(to + 1, from + 1000)),
        error: null,
      });
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({ from: query }),
}));

const { loadOnboardingCatalogue } =
  await import("@/lib/coursemap/onboarding-catalogue");

const PROGRAMMES = 1250;

beforeEach(() => {
  requests.length = 0;
  const range = Array.from({ length: PROGRAMMES }, (_, index) => index + 1);
  tables.set(
    "catalogue_records",
    range.map((id) => ({
      id,
      academic_year_id: 1,
      published_version_id: 10_000 + id,
      code_id: id,
    })),
  );
  tables.set("academic_years", [{ id: 1, year: 2026 }]);
  tables.set(
    "catalogue_codes",
    range.map((id) => ({ id, code: `P${id}`, kind: "programme" })),
  );
  tables.set(
    "structure_version_details",
    range.map((id) => ({
      version_id: 10_000 + id,
      name: `Programme ${String(id).padStart(4, "0")}`,
      description: null,
      duration_years: 3,
      units: 144,
    })),
  );
  tables.set("academic_structure_snapshot_relationships", []);
  tables.set("requirement_conditions", []);
  tables.set("requirement_condition_options", []);
});

test("loads every published programme past the 1000-row page limit", async () => {
  const catalogue = await loadOnboardingCatalogue();
  expect(catalogue.catalogueYears).toEqual([{ id: 1, year: 2026 }]);
  expect(catalogue.degrees).toHaveLength(PROGRAMMES);
  expect(catalogue.degrees[0]).toMatchObject({
    code: "P1",
    durationYears: 3,
    units: 144,
  });
});

test("keeps identifier lists short enough for the query string", async () => {
  await loadOnboardingCatalogue();
  const listed = requests.filter((request) => request.ids > 0);
  expect(listed.length).toBeGreaterThan(0);
  expect(Math.max(...listed.map((request) => request.ids))).toBeLessThanOrEqual(
    200,
  );
});
