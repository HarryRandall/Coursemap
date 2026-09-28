import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import {
  EXAMPLE_SOCIETY_EVENTS,
  EXAMPLE_SOCIETIES,
} from "@/tests/fixtures/societies";
import { SocietyEvents } from "@/ui/societies/society-events";

test("students can still open the local event page when its artwork fails", () => {
  const event = EXAMPLE_SOCIETY_EVENTS.find(
    (item) => item.sourceId === "73879",
  )!;
  render(
    <SocietyEvents
      events={[
        {
          ...event,
          society: EXAMPLE_SOCIETIES.find(
            (club) => club.slug === event.societySlug,
          ),
        },
      ]}
    />,
  );
  const artwork = screen
    .getAllByAltText("")
    .find((image) => image.getAttribute("src") === event.artworkUrl)!;
  fireEvent.error(artwork);
  expect(
    screen
      .getByRole("link", { name: `View ${event.title}` })
      .getAttribute("href"),
  ).toBe(`/societies/events/${event.id}`);
  expect(screen.getByText(event.host)).toBeTruthy();
  expect(
    screen
      .getAllByAltText("")
      .some((image) => image.getAttribute("src") === event.artworkUrl),
  ).toBe(false);
});

test("event cards offer separate event and society links without nesting them", () => {
  const event = EXAMPLE_SOCIETY_EVENTS[0]!;
  render(<SocietyEvents events={[event]} />);
  const eventLink = screen.getByRole("link", { name: `View ${event.title}` });
  const societyLink = screen.getByRole("link", { name: `View ${event.host}` });
  expect(eventLink).toHaveAttribute("href", `/societies/events/${event.id}`);
  expect(societyLink).toHaveAttribute(
    "href",
    `/societies/${event.societySlug}`,
  );
  expect(eventLink.contains(societyLink)).toBe(false);
});
