import { expect, login, test } from "./fixtures";

/**
 * The admin catalogue directory and import runs for one kind. The ANU listing
 * refresh is stubbed at the route so the test needs no network.
 */
test("administrators browse the programme directory and import runs", async ({
  page,
  administrator,
}) => {
  await login(page, administrator);

  await page.goto("/admin/programmes");
  await expect(
    page.getByRole("heading", { name: "Programmes", level: 1, exact: true }),
  ).toBeAttached();
  await expect(page.getByRole("tab", { name: "Directory" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // The local seed publishes one programme, so the directory lists it even
  // before the ANU listing has been fetched.
  const programmeRow = page.getByRole("row", { name: /LOCAL-PROGRAMME/ });
  await expect(programmeRow).toBeVisible();
  await expect(
    programmeRow.getByText("Published", { exact: true }),
  ).toBeVisible();

  // The ANU listing is stubbed so the refresh completes without network.
  await page.route("**/api/admin/catalogue-directory", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: [
        'data: {"type":"started"}',
        'data: {"type":"complete","result":{"entryCount":1,"added":0}}',
        "",
      ].join("\n\n"),
    });
  });
  await page.getByRole("button", { name: "Refresh listing" }).click();
  await expect(
    page.getByText(/Directory refreshed: 1 programmes/),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Import runs" }).click();
  await expect(page).toHaveURL(/\/admin\/programmes\/imports/);
  await expect(
    page.getByRole("heading", {
      name: "Programme import runs",
      level: 1,
      exact: true,
    }),
  ).toBeAttached();
  await expect(
    page.getByText(/No programme imports yet|Run #/).first(),
  ).toBeVisible();

  await page.goto("/admin/courses?status=published");
  await expect(page.getByRole("row", { name: /COMP1110/ })).toBeVisible();
  await page.getByRole("checkbox", { name: "Select COMP1110" }).check();
  await expect(page.getByRole("status")).toContainText("1 of 10 selected");
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
});
