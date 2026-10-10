import type { Page } from "@playwright/test";

/** Keep rendered-page tests independent of public map providers. */
export async function stubRoomMapRequests(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/styles/")) {
      return route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: "background",
              type: "background",
              paint: { "background-color": "#f5f5f5" },
            },
          ],
        },
      });
    }
    return route.abort();
  });
  await page.route("https://tiles.mapterhorn.com/**", (route) => {
    if (new URL(route.request().url()).pathname === "/tilejson.json") {
      return route.fulfill({
        json: {
          tilejson: "3.0.0",
          tiles: ["https://tiles.mapterhorn.com/{z}/{x}/{y}.webp"],
          minzoom: 0,
          maxzoom: 0,
          attribution: '<a href="https://mapterhorn.com">Mapterhorn</a>',
        },
      });
    }
    return route.abort();
  });
}
