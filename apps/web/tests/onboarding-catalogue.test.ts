import { beforeEach, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (read: unknown) => read }));
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({ rpc }),
}));
const { loadOnboardingCatalogue } =
  await import("@/lib/coursemap/onboarding-catalogue");
const programme = (code: string, name: string) => ({
  catalogueYear: 2026,
  code,
  name,
  description: "Full published description",
  durationYears: 3,
  units: 144,
  majorCodes: ["MAJ1"],
  minorCodes: [],
  specialisationCodes: ["SPEC1"],
});
beforeEach(() => rpc.mockReset());

test("reads every published choice in one request without a 1000-row cap", async () => {
  const degrees = Array.from({ length: 1250 }, (_, index) =>
    programme(`P${index}`, `Degree ${index}`),
  );
  rpc.mockResolvedValue({
    data: {
      catalogueYears: [
        { id: 1, year: 2025 },
        { id: 2, year: 2026 },
      ],
      degrees,
      majors: [],
      minors: [],
      specialisations: [],
    },
    error: null,
  });
  const result = await loadOnboardingCatalogue();
  expect(rpc).toHaveBeenCalledExactlyOnceWith("published_onboarding_catalogue");
  expect(result.degrees).toHaveLength(1250);
  expect(result.catalogueYears.map((year) => year.year)).toEqual([2026, 2025]);
  expect(result.degrees[0]).toEqual(programme("P0", "Degree 0"));
  expect(result.degrees.map((degree) => degree.name)).toEqual(
    degrees.map((degree) => degree.name).toSorted((a, b) => a.localeCompare(b)),
  );
});

test("preserves descriptions and explicit selectable codes for every structure kind", async () => {
  const choice = programme("P1", "Programme");
  rpc.mockResolvedValue({
    data: {
      catalogueYears: [],
      degrees: [choice],
      majors: [{ ...choice, code: "MAJ1" }],
      minors: [{ ...choice, code: "MIN1" }],
      specialisations: [{ ...choice, code: "SPEC1" }],
    },
    error: null,
  });
  const result = await loadOnboardingCatalogue();
  expect(result.degrees).toEqual([choice]);
  expect(result.majors[0].code).toBe("MAJ1");
  expect(result.minors[0].code).toBe("MIN1");
  expect(result.specialisations[0].code).toBe("SPEC1");
});

test("fails explicitly for failed or malformed projections", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: "57014" } });
  await expect(loadOnboardingCatalogue()).rejects.toMatchObject({
    code: "57014",
  });
  rpc.mockResolvedValueOnce({ data: {}, error: null });
  await expect(loadOnboardingCatalogue()).rejects.toThrow(
    "degree choices could not be read",
  );
});
