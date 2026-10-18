import { expect, test } from "vitest";
import { readCampusMapQueryBatches } from "@/lib/rooms/campus-map-query";

test("room metadata batches retain every place and limit simultaneous reads", async () => {
  const ids = Array.from({ length: 800 }, (_, index) => `place-${index}`);
  let active = 0;
  let peak = 0;
  const sizes: number[] = [];
  const results = await readCampusMapQueryBatches(ids, async (batch) => {
    active += 1;
    peak = Math.max(peak, active);
    sizes.push(batch.length);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    return batch;
  });
  expect(results.flat()).toEqual(ids);
  expect(peak).toBe(2);
  expect(Math.max(...sizes)).toBe(75);
});

test("empty campus metadata skips the database and failed batches propagate", async () => {
  let calls = 0;
  expect(
    await readCampusMapQueryBatches([], async () => {
      calls += 1;
    }),
  ).toEqual([]);
  expect(calls).toBe(0);
  await expect(
    readCampusMapQueryBatches([1], async () => {
      throw new Error("Unavailable.");
    }),
  ).rejects.toThrow("Unavailable.");
});
