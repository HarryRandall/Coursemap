import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ValueDiff } from "@/ui/admin/catalogue/value-diff";

test("a scalar change reads as one pair of values", () => {
  render(
    <ValueDiff
      fieldPath="course.details.title"
      oldValue="Algorithms"
      newValue="Advanced Algorithms"
    />,
  );
  expect(screen.getByText("Algorithms")).toBeInTheDocument();
  expect(screen.getByText("Advanced Algorithms")).toBeInTheDocument();
});

test("only the changed field of a collection row is shown", () => {
  const before = [
    { classNumber: "1", deliveryMode: "In person", location: "Manning Clark" },
    { classNumber: "2", deliveryMode: "In person", location: "Hanna Neumann" },
  ];
  const after = [
    { classNumber: "1", deliveryMode: "Online", location: "Manning Clark" },
    { classNumber: "2", deliveryMode: "In person", location: "Hanna Neumann" },
  ];
  render(
    <ValueDiff
      fieldPath="course.sessions"
      oldValue={before}
      newValue={after}
    />,
  );

  // The one altered field is named, with its own before and after.
  expect(screen.getByText("Item 1 · Delivery mode")).toBeInTheDocument();
  expect(screen.getByText("In person")).toBeInTheDocument();
  expect(screen.getByText("Online")).toBeInTheDocument();

  // The untouched row never appears, and neither does a JSON dump of it.
  expect(screen.queryByText(/Item 2/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Hanna Neumann/)).not.toBeInTheDocument();
});

test("an added row is labelled as added", () => {
  render(
    <ValueDiff
      fieldPath="course.fees"
      oldValue={[{ audience: "Domestic", amount: "1000" }]}
      newValue={[
        { audience: "Domestic", amount: "1000" },
        { audience: "International", amount: "2000" },
      ]}
    />,
  );
  expect(screen.getByText("Item 2 (added)")).toBeInTheDocument();
  expect(screen.getByText("International")).toBeInTheDocument();
});

test("a value the walk cannot reduce falls back to the raw values", () => {
  const wide = Array.from({ length: 80 }, (_, index) => ({
    key: `value-${index}`,
  }));
  render(
    <ValueDiff fieldPath="course.sessions" oldValue={[]} newValue={wide} />,
  );
  // Nothing was dropped: the reviewer still sees both sides in full.
  expect(screen.getByLabelText("Current course.sessions")).toBeInTheDocument();
  expect(screen.getByLabelText("Imported course.sessions")).toBeInTheDocument();
});
