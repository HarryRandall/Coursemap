import assert from "node:assert/strict";
import { test } from "vitest";

import { collectPlanCatalogueRecordIds } from "../lib/coursemap/plan-course-ids.ts";

test("includes records that only appear in recorded attempts", () => {
  assert.deepEqual(
    collectPlanCatalogueRecordIds(
      [{ catalogue_record_id: 101 }],
      [{ catalogue_record_id: 202 }],
    ),
    [101, 202],
  );
});

test("deduplicates records shared by the plan and recorded attempts", () => {
  assert.deepEqual(
    collectPlanCatalogueRecordIds(
      [{ catalogue_record_id: 101 }, { catalogue_record_id: 202 }],
      [
        { catalogue_record_id: 202 },
        { catalogue_record_id: 303 },
        { catalogue_record_id: 303 },
      ],
    ),
    [101, 202, 303],
  );
});
