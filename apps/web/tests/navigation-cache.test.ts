import { expect, test } from "vitest";
import config from "../next.config";

test("visited dynamic pages are reused briefly without enabling Cache Components", () => {
  expect(config.experimental?.staleTimes).toEqual({ dynamic: 30, static: 180 });
  expect(config.cacheComponents).not.toBe(true);
});
