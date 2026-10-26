import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

test("totals tuition by year in dollars and notes estimated fees", () => {
  render(
    <AssistantVisualCard
      visual={{
        kind: "columns",
        title: "Estimated tuition by year",
        format: "currency",
        items: [
          { label: "2025", value: 9_000 },
          { label: "2026", value: 9_500 },
        ],
        note: "Includes 2 courses ANU lists no fee for.",
      }}
    />,
  );
  const figure = screen.getByRole("figure", {
    name: "Estimated tuition by year",
  });
  expect(figure).toHaveTextContent("$18,500");
  expect(figure).toHaveTextContent("Includes 2 courses ANU lists no fee for.");
  expect(
    screen.getByRole("img", {
      name: "Estimated tuition by year: 2025 $9,000, 2026 $9,500",
    }),
  ).toBeInTheDocument();
});

test("switches a results trend between GPA and WAM without sharing a scale", async () => {
  const user = userEvent.setup();
  render(
    <AssistantVisualCard
      visual={{
        kind: "line",
        title: "Your results by study period",
        series: [
          {
            name: "GPA",
            min: 0,
            max: 7,
            points: [
              { label: "S1 '25", value: 5.5 },
              { label: "S2 '25", value: 6 },
            ],
          },
          {
            name: "WAM",
            min: 0,
            max: 100,
            points: [{ label: "S1 '25", value: 68.4 }],
          },
        ],
      }}
    />,
  );
  expect(screen.getByText("6.00")).toBeVisible();
  expect(screen.getByText(/up 0.50 since S1 '25/)).toBeVisible();
  expect(screen.getByRole("tab", { name: "GPA" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.click(screen.getByRole("tab", { name: "WAM" }));
  expect(screen.getByRole("tab", { name: "WAM" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("68.4")).toBeVisible();
});
