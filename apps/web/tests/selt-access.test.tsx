import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SeltAccess } from "../ui/admin/selt/selt-access";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const RENDERED_AT = "2026-10-07T00:00:00Z";
const tokens = [
  {
    id: "0b7e2d1c-1111-4222-8333-44445555abcd",
    createdAt: "2026-10-06T22:00:00Z",
    expiresAt: "2026-10-07T09:00:00Z",
    revokedAt: null,
    createdBy: "Harry",
    reports: 42,
    lastUploadAt: "2026-10-06T23:00:00Z",
  },
  {
    id: "0b7e2d1c-1111-4222-8333-44445555ef01",
    createdAt: "2026-10-01T00:00:00Z",
    expiresAt: "2026-10-01T12:00:00Z",
    revokedAt: "2026-10-01T02:00:00Z",
    createdBy: null,
    reports: 0,
    lastUploadAt: null,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  refresh.mockReset();
});

it("lists tokens by masked handle and only offers revoking active ones", () => {
  render(<SeltAccess tokens={tokens} renderedAt={RENDERED_AT} />);
  const rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]!).getByText("selt_••••abcd")).toBeInTheDocument();
  expect(within(rows[0]!).getByText("Active · 9 h left")).toBeInTheDocument();
  expect(
    within(rows[0]!).getByRole("button", { name: "Revoke" }),
  ).toBeInTheDocument();
  expect(within(rows[1]!).getByText("Revoked")).toBeInTheDocument();
  expect(within(rows[1]!).getByText("Never")).toBeInTheDocument();
  expect(
    within(rows[1]!).queryByRole("button", { name: "Revoke" }),
  ).not.toBeInTheDocument();
});

it("shows a new token once with the command for this site", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ token: "synthetic-import-token" })),
  );
  render(<SeltAccess tokens={[]} renderedAt={RENDERED_AT} />);
  expect(screen.getByText("No tokens yet")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create token" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByTestId("selt-token")).toHaveTextContent(
    "synthetic-import-token",
  );
  expect(dialog).toHaveTextContent(`--site ${window.location.origin} --all`);
  expect(refresh).toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(screen.queryByText("synthetic-import-token")).not.toBeInTheDocument();
});

it("reports a failed action without showing a token", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        { error: "Catalogue import permission is required." },
        { status: 403 },
      ),
    ),
  );
  render(<SeltAccess tokens={[]} renderedAt={RENDERED_AT} />);
  fireEvent.click(screen.getByRole("button", { name: "Create token" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Catalogue import permission is required.",
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
