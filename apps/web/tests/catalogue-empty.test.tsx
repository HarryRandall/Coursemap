import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import { CatalogueEmpty } from "@/ui/admin/catalogue-table/catalogue-empty";

test("uses stable artwork for catalogue empty states", () => {
  const { container, rerender } = render(
    <CatalogueEmpty title="No courses" description="Nothing here yet." />,
  );
  expect(container.querySelector("svg")).toBeInTheDocument();
  expect(container).not.toHaveTextContent("0.");

  rerender(
    <CatalogueEmpty
      filtered
      title="No courses"
      description="Nothing here yet."
    />,
  );
  expect(container.querySelector("svg")).toBeInTheDocument();
  expect(container.querySelectorAll("svg")).toHaveLength(1);
});
