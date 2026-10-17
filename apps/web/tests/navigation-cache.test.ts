import { expect, test } from "vitest";
import config from "../next.config";

test("visited pages are reused for five minutes without enabling Cache Components", () => {
  expect(config.experimental?.staleTimes).toEqual({
    dynamic: 300,
    static: 300,
  });
  expect(config.cacheComponents).not.toBe(true);
});
