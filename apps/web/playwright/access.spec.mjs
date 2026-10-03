import assert from "node:assert/strict";

import { test } from "./request-fixture.mjs";

const origin = "http://127.0.0.1:4318";

function request(api, path, init = {}) {
  return api(`${origin}${path}`, init);
}

test("keeps anonymous public routes available when the database is unavailable", async ({
  request: api,
}) => {
  const responses = await Promise.all(
    [
      "/",
      "/courses",
      "/courses/2026/comp2100",
      "/key-dates",
      "/login",
      "/signup",
    ].map((path) => request(api, path, { headers: { accept: "text/html" } })),
  );

  responses.forEach((response) => assert.equal(response.status, 200));

  const html = (
    await Promise.all(responses.map((response) => response.text()))
  ).join("\n");
  assert.doesNotMatch(html, /Harry Student/i);
  assert.doesNotMatch(html, /u7499609/i);
  assert.doesNotMatch(html, /Admin console/i);
});

test("renders password authentication without magic-link instructions", async ({
  request: api,
}) => {
  const response = await request(api, "/login?next=%2Fplan");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /name="email"/i);
  assert.match(html, /name="password"/i);
  assert.match(html, /autocomplete="current-password"/i);
  assert.match(html, /Create an account/i);
  assert.doesNotMatch(html, /magic link|Mailpit|one-time email link/i);
});

test("redirects protected routes to the canonical login page", async ({
  request: api,
}) => {
  for (const path of [
    "/compass",
    "/compass/new",
    "/compass/usage",
    "/compass/11111111-1111-4111-8111-111111111111",
    "/plan?year=2026",
    "/profile",
    "/dashboard",
    "/onboarding",
    "/requirements",
    "/academic",
    "/calendar",
    "/roadmap",
    "/rooms",
    "/printing",
    "/societies",
    "/societies/anime-and-gaming-society",
    "/societies/events/6fc40105-8a26-4ee2-bb07-434a26fb5c23",
    "/help",
    "/history",
    "/timetable",
    "/admin/dashboard",
    "/admin/operations/catalogue/imports",
    "/admin/operations/catalogue/imports/new?year=2026",
    "/admin/operations/catalogue/imports/11111111-1111-4111-8111-111111111111",
    "/admin/rooms",
    "/admin/users",
    "/admin/roles",
    "/admin/users/70000000-0000-4000-8000-000000000001",
    "/admin/operations/catalogue",
    "/admin/operations/catalogue/discovery",
    "/admin/operations/catalogue/syncs/11111111-1111-4111-8111-111111111111",
  ]) {
    const response = await request(api, path, { redirect: "manual" });

    assert.equal(response.status, 307);
    const location = new URL(response.headers.get("location"), origin);
    assert.equal(location.origin, origin);
    assert.equal(location.pathname, "/login");
    assert.equal(location.searchParams.get("next"), path);
    assert.equal(location.searchParams.get("reason"), null);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  }
});

test("redirects legacy auth pages to the canonical public paths", async ({
  request: api,
}) => {
  const [loginResponse, signupResponse] = await Promise.all([
    request(api, "/auth/sign-in?next=%2Fplan", { redirect: "manual" }),
    request(api, "/auth/sign-up?next=%2Fonboarding", { redirect: "manual" }),
  ]);

  assert.equal(loginResponse.status, 308);
  assert.equal(signupResponse.status, 308);
  assert.equal(loginResponse.headers.get("location"), "/login?next=%2Fplan");
  assert.equal(
    signupResponse.headers.get("location"),
    "/signup?next=%2Fonboarding",
  );
});

test("does not expose logout over GET", async ({ request: api }) => {
  const response = await request(api, "/auth/logout", { redirect: "manual" });
  assert.equal(response.status, 405);
});

test("keeps public and built static assets outside authentication", async ({
  request: api,
}) => {
  const homeResponse = await request(api, "/", {
    headers: { accept: "text/html" },
  });
  const homeHtml = await homeResponse.text();
  const builtAssetPath = homeHtml.match(
    /(?:src|href)="(\/_next\/static\/[^"? ]+)/,
  )?.[1];
  assert.ok(builtAssetPath, "expected a built Next.js static asset");

  const [publicAsset, builtAsset] = await Promise.all([
    request(api, "/icon-32.png", { redirect: "manual" }),
    request(api, builtAssetPath, { redirect: "manual" }),
  ]);

  assert.equal(publicAsset.status, 200);
  assert.equal(builtAsset.status, 200);
  assert.equal(publicAsset.headers.get("location"), null);
  assert.equal(builtAsset.headers.get("location"), null);
});

test("removed reference routes stay unavailable without a session", async ({
  request: api,
}) => {
  for (const path of [
    "/design-system",
    "/design-system/typography",
    "/admin/design-system/components",
    "/admin/design-system-preview/tokens/foundations",
    "/api/design-system/review",
    "/structures/bcomp",
  ]) {
    assert.equal(
      (await request(api, path, { redirect: "manual" })).status,
      404,
      path,
    );
  }
});

test("rejects malformed auth callbacks and cross-origin logout", async ({
  request: api,
}) => {
  for (const path of [
    "/auth/callback?code=&code=duplicate",
    "/auth/confirm?token_hash=value&type=magiclink",
  ]) {
    const response = await request(api, path, { redirect: "manual" });
    assert.equal(response.status, 303);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  }
  const response = await request(api, "/auth/logout", {
    method: "POST",
    headers: { origin: "https://evil.example" },
    redirect: "manual",
  });
  assert.equal(response.status, 403);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
});

test("anonymous users cannot preview or start paid course import runs", async ({
  request: api,
}) => {
  const responses = await Promise.all([
    request(api, "/api/admin/course-import-runs?year=2026"),
    ...["publish-drafts", "auto-publish"].map((action) =>
      request(api, "/api/admin/course-import-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          runId: "00000000-0000-4000-8000-000000000001",
          enabled: true,
        }),
      }),
    ),
    request(api, "/api/admin/course-import-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "create",
        year: 2026,
        limit: 100,
        budgetUsd: 0.5,
      }),
    }),
  ]);
  for (const response of responses) assert.equal(response.status, 403);
});
