import { beforeEach, expect, test, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (read: unknown) => read }));
vi.mock("@/lib/supabase/public-server", () => ({
  createPublicClient: () => ({ rpc }),
}));
import { loadPublishedStructure } from "@/lib/coursemap/published-structures";
import type {
  RequirementTreeCondition,
  RequirementTreeGroup,
} from "@/lib/coursemap/requirement-tree-node";

beforeEach(() => {
  rpc.mockReset();
});

function condition(fields: Record<string, unknown>) {
  return {
    groupKey: "degree-rules",
    position: 0,
    conditionKind: "other",
    minimumUnits: null,
    maximumUnits: null,
    ...fields,
  };
}

const projection = {
  structureCode: "bcomp",
  structureKind: "programme",
  academicYear: 2026,
  snapshot: { name: "Bachelor of Computing", units: 144 },
  requirements: {
    ruleGroups: [
      { key: "root", operator: "all_of", minimumUnits: 144, position: 0 },
      {
        key: "degree-rules",
        parentGroupKey: "root",
        label: "Degree-wide rules",
        operator: "all_of",
        position: 1,
        scope: "degree",
      },
    ],
    ruleConditions: [
      condition({
        key: "degree-1000-max",
        conditionKind: "level_units",
        maximumUnits: 60,
        maximumCourseLevel: 1999,
        scope: "degree",
      }),
      condition({
        key: "police-check",
        position: 1,
        freeText: "A police check before placement.",
        noteKind: "required",
      }),
      condition({
        key: "unknown-kind",
        position: 2,
        freeText: "Ask the convener.",
        noteKind: "something_else",
      }),
      condition({
        key: "not-badan",
        position: 3,
        conditionKind: "structure",
        requiredStructureCode: "BADAN",
        matchesStructure: false,
      }),
      condition({
        key: "in-bcomp",
        position: 4,
        conditionKind: "structure",
        requiredStructureCode: "BCOMP",
        matchesStructure: true,
      }),
    ],
    ruleConditionCourses: [],
  },
};

test("the loader reads scope, note kinds and negated structures into the tree", async () => {
  rpc.mockResolvedValue({ data: projection, error: null });
  const structure = await loadPublishedStructure("bcomp", 2026);
  const degreeRules = structure?.requirements
    ?.children[0] as RequirementTreeGroup;
  expect(degreeRules.title).toBe("Degree-wide rules");
  expect(degreeRules.scope).toBe("degree");
  const byKey = new Map(
    degreeRules.children.map((child) => [
      (child as RequirementTreeCondition).projectionKey,
      child as RequirementTreeCondition,
    ]),
  );
  expect(byKey.get("degree-1000-max")?.scope).toBe("degree");
  expect(byKey.get("police-check")?.scope).toBe("part");
  expect(byKey.get("police-check")?.noteKind).toBe("required");
  expect(byKey.get("unknown-kind")?.noteKind).toBeUndefined();
  expect(byKey.get("not-badan")?.matchesStructure).toBe(false);
  expect(byKey.get("not-badan")?.itemCode).toBe("BADAN");
  // Only the negation is carried; an ordinary structure condition stays bare.
  expect(byKey.get("in-bcomp")?.matchesStructure).toBeUndefined();
});
