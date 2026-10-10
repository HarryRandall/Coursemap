import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CampusMap } from "@/ui/rooms/campus-map";
import type { CampusMapCampus } from "@/lib/rooms/campus-map";

const state = vi.hoisted(() => ({
  theme: undefined as string | undefined,
  events: new Map<string, () => void>(),
  create: vi.fn(),
  addSource: vi.fn(),
}));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: state.theme }),
}));
vi.mock("maplibre-gl", () => ({
  setWorkerUrl: vi.fn(),
  NavigationControl: class {},
  AttributionControl: class {},
  Map: class {
    constructor() {
      state.create();
    }
    once(event: string, callback: () => void) {
      state.events.set(event, callback);
    }
    on() {}
    addControl() {}
    setMissingStyleImageResolver() {}
    getCenter() {
      return { lng: 149.12, lat: -35.28 };
    }
    getBearing() {
      return 0;
    }
    getPitch() {
      return 35;
    }
    getZoom() {
      return 16;
    }
    getStyle() {
      return { layers: [] };
    }
    addSource(...args: unknown[]) {
      state.addSource(...args);
    }
    addLayer() {}
    moveLayer() {}
    getLayer() {
      return undefined;
    }
    getSource() {
      return undefined;
    }
    getContainer() {
      return document.createElement("div");
    }
    remove() {}
  },
}));
const campus: CampusMapCampus = {
  id: "anu",
  slug: "anu",
  name: "ANU",
  bounds: [149.1, -35.3, 149.14, -35.26],
  boundary: {
    type: "Polygon",
    coordinates: [
      [
        [149.1, -35.3],
        [149.14, -35.3],
        [149.14, -35.26],
        [149.1, -35.3],
      ],
    ],
  },
  initialCoordinates: [149.12, -35.28],
  initialZoom: 16,
  minZoom: 12,
  maxZoom: 22,
  sourceIdentifier: "test",
  sourceUrl: "",
  sourceLicense: "",
};
function mapView() {
  return (
    <CampusMap
      campus={campus}
      layers={[]}
      visibleLayerSlugs={new Set()}
      places={[]}
      features={[]}
      route={null}
      routeEndpoints={null}
      onSelect={vi.fn()}
      onClearSelection={vi.fn()}
    />
  );
}
beforeEach(() => {
  state.theme = "dark";
  state.events.clear();
  state.create.mockClear();
  state.addSource.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

test("waits for the theme before creating the map", async () => {
  state.theme = undefined;
  const view = render(mapView());
  expect(screen.getByRole("status")).toHaveTextContent("Loading map...");
  expect(screen.getByLabelText(/Interactive vector map/)).not.toBeVisible();
  expect(state.create).not.toHaveBeenCalled();
  state.theme = "dark";
  view.rerender(mapView());
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
});

test("keeps the map hidden until the themed frame has finished rendering", async () => {
  render(mapView());
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  act(() => state.events.get("style.load")?.());
  expect(screen.getByRole("status")).toBeVisible();
  expect(screen.getByLabelText(/Interactive vector map/)).not.toBeVisible();
  act(() => state.events.get("idle")?.());
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Interactive vector map/)).toBeVisible();
});

test("replaces a stalled loader with an error without exposing the unfinished map", async () => {
  vi.useFakeTimers();
  render(mapView());
  await act(() => vi.dynamicImportSettled());
  act(() => state.events.get("style.load")?.());
  act(() => vi.advanceTimersByTime(12_000));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByText("The vector map could not be loaded.")).toBeVisible();
  expect(screen.getByLabelText(/Interactive vector map/)).not.toBeVisible();
  act(() => state.events.get("idle")?.());
  expect(
    screen.queryByText("The vector map could not be loaded."),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText(/Interactive vector map/)).toBeVisible();
});

test("credits Mapterhorn on the terrain source", async () => {
  render(mapView());
  await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
  act(() => state.events.get("style.load")?.());
  expect(state.addSource).toHaveBeenCalledWith(
    "coursemap-terrain-hillshade-source",
    expect.objectContaining({
      type: "raster-dem",
      attribution: '<a href="https://mapterhorn.com">Mapterhorn</a>',
    }),
  );
});
