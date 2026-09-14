import Link from "next/link";
import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LinkedTableRow } from "@/ui/common/linked-table-row";

function renderRow() {
  const navigate = vi.fn((event) => event.preventDefault());
  const action = vi.fn();
  render(
    <table>
      <tbody>
        <LinkedTableRow>
          <td>
            <Link
              href="/courses/AATD1001?year=2026"
              data-row-link
              onClick={navigate}
            >
              SoCIETIE Initiative
            </Link>
          </td>
          <td>2026</td>
          <td>
            <label>
              <input type="checkbox" />
              Select course
            </label>
          </td>
          <td>
            <button onClick={action}>
              <span>Actions</span>
            </button>
          </td>
          <td>
            <a href="#prerequisite">Prerequisite</a>
          </td>
        </LinkedTableRow>
      </tbody>
    </table>,
  );
  return { navigate, action };
}

test("preserves selection, nested actions, other links and keyboard access", async () => {
  const user = userEvent.setup();
  const { navigate, action } = renderRow();
  await user.tab();
  expect(
    screen.getByRole("link", { name: "SoCIETIE Initiative" }),
  ).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(navigate).toHaveBeenCalledTimes(1);
  navigate.mockClear();
  await user.click(screen.getByText("Select course"));
  expect(screen.getByRole("checkbox")).toBeChecked();
  await user.click(screen.getByText("Actions"));
  expect(action).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("link", { name: "Prerequisite" }));
  expect(navigate).not.toHaveBeenCalled();
});
