import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AssistantVisualCard } from "@/ui/assistant/assistant-visual-card";

test("places a GPA on ANU's grade bands against the requirement", () => {
  render(
    <AssistantVisualCard
      visual={{
        kind: "meter",
        title: "Your GPA against COMP3500",
        value: 5.2,
        max: 7,
        target: 6,
        unit: "GPA",
      }}
    />,
  );
  const figure = screen.getByRole("figure", {
    name: "Your GPA against COMP3500",
  });
  expect(figure).toHaveTextContent("5.20");
  expect(figure).toHaveTextContent("Credit average");
  expect(figure).toHaveTextContent("0.80 below 6");
  expect(figure).toHaveTextContent("Distinction");
  expect(
    screen.getByLabelText(
      "GPA 5.20 of 7, credit average, 0.80 below the 6 required",
    ),
  ).toBeInTheDocument();
});
