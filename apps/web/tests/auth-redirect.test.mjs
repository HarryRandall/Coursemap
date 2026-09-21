import assert from "node:assert/strict";

import { test } from "vitest";
const { safeInternalRedirect } = await import("../lib/auth/redirect.ts");

test("keeps valid internal authentication destinations", () => {
  const cases = [
    "/plan",
    "/courses/2026/comp2100",
    "/courses?query=software%20design",
    "/requirements#major",
  ];

  cases.forEach((candidate) => {
    assert.equal(safeInternalRedirect(candidate), candidate);
  });
});

test("rejects external, decoded and handler redirect destinations", () => {
  const unsafe = [
    null,
    "",
    "plan",
    "https://evil.example/plan",
    "//evil.example/plan",
    "///evil.example/plan",
    "/\\evil.example/plan",
    "/%5c%5cevil.example/plan",
    "/%255c%255cevil.example/plan",
    "/%2f%2fevil.example/plan",
    "/%252f%252fevil.example/plan",
    "/%0aplan",
    "/auth/callback",
    "/auth/callback/again",
    "/AUTH/CONFIRM",
    "/auth/%63allback",
    "/auth/%2563allback",
    "/auth/confirm?token_hash=secret",
    "/auth/callback%3Fcode=secret",
    "/auth/callback%23fragment",
    "/auth/logout",
  ];

  unsafe.forEach((candidate) => {
    assert.equal(
      safeInternalRedirect(candidate),
      "/dashboard",
      `expected ${String(candidate)} to be rejected`,
    );
  });
});

test("uses the supplied fallback for unsafe destinations", () => {
  assert.equal(safeInternalRedirect("//evil.example", "/courses"), "/courses");
});
