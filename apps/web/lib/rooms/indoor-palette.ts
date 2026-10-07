/**
 * Colours the indoor map layers paint with.
 *
 * MapLibre cannot read CSS custom properties, so the editor resolves the
 * semantic tokens at runtime into this structure and re-applies it when the
 * theme changes. The public Room Finder, which draws on a light basemap, uses
 * the defaults below. Nothing here touches the DOM.
 */
export type IndoorPalette = Readonly<{
  /** Canvas colour behind the footprint. */
  background: string;
  slab: string;
  wallStructural: string;
  wallPartition: string;
  wallGlazing: string;
  perimeter: string;
  door: string;
  gap: string;
  entrance: string;
  connector: string;
  route: string;
  highlight: string;
  labelText: string;
  labelHighlight: string;
  labelHalo: string;
  labelMuted: string;
  /** Faces enclosed by walls that nobody has classified yet. */
  unclassified: string;
  /** Fill for each space category, falling back to `spaceFallback`. */
  spaceFills: Readonly<Record<string, string>>;
  spaceFallback: string;
  /** Live gesture colours, keyed by what the gesture is drawing. */
  draftArea: string;
  draftWall: string;
  draftPath: string;
  draftVertexStroke: string;
  /** Selection outline and handles. */
  selection: string;
}>;

/** The palette every token is expected to define. */
export const INDOOR_PALETTE_KEYS = [
  "background",
  "slab",
  "wallStructural",
  "wallPartition",
  "wallGlazing",
  "perimeter",
  "door",
  "gap",
  "entrance",
  "connector",
  "route",
  "highlight",
  "labelText",
  "labelHighlight",
  "labelHalo",
  "labelMuted",
  "unclassified",
  "spaceFallback",
  "draftArea",
  "draftWall",
  "draftPath",
  "draftVertexStroke",
  "selection",
] as const satisfies readonly Exclude<keyof IndoorPalette, "spaceFills">[];

/**
 * Space fills by category. Legacy documents only carry a coarse `kind`, so the
 * kinds are listed too and the renderer tries the category first.
 */
export const INDOOR_SPACE_FILL_KEYS = [
  "room",
  "corridor",
  "open-area",
  "service",
  "void",
  "lecture-theatre",
  "tutorial-room",
  "computer-lab",
  "laboratory",
  "office",
  "meeting-room",
  "study-space",
  "kitchen",
  "toilets",
  "plant",
  "misc",
  "foyer",
  "stairwell",
  "lift-shaft",
  "ramp",
] as const;

/** The light palette the public map has always used. */
export const DEFAULT_INDOOR_PALETTE: IndoorPalette = {
  background: "#f4f4f5",
  slab: "#d4d4d8",
  wallStructural: "#52525b",
  wallPartition: "#a1a1aa",
  wallGlazing: "#7dd3fc",
  perimeter: "#52525b",
  door: "#7c3aed",
  gap: "#0284c7",
  entrance: "#059669",
  connector: "#8b5cf6",
  route: "#f59e0b",
  highlight: "#7c3aed",
  labelText: "#3f3f46",
  labelHighlight: "#5b21b6",
  labelHalo: "#ffffff",
  labelMuted: "#71717a",
  unclassified: "#a1a1aa",
  spaceFills: {
    room: "#ede9fe",
    corridor: "#dbeafe",
    "open-area": "#dcfce7",
    service: "#fef3c7",
    void: "#f4f4f5",
    "lecture-theatre": "#ddd6fe",
    "tutorial-room": "#e9d5ff",
    "computer-lab": "#c7d2fe",
    laboratory: "#bae6fd",
    office: "#fde68a",
    "meeting-room": "#fed7aa",
    "study-space": "#bbf7d0",
    kitchen: "#fecdd3",
    toilets: "#e0f2fe",
    plant: "#e7e5e4",
    misc: "#ede9fe",
    foyer: "#dcfce7",
    stairwell: "#f5d0fe",
    "lift-shaft": "#f5d0fe",
    ramp: "#dbeafe",
  },
  spaceFallback: "#ede9fe",
  draftArea: "#7c3aed",
  draftWall: "#52525b",
  draftPath: "#d97706",
  draftVertexStroke: "#ffffff",
  selection: "#7c3aed",
};

/** A MapLibre `match` expression choosing a fill per category, then per kind. */
export function spaceFillExpression(
  palette: IndoorPalette,
): import("maplibre-gl").ExpressionSpecification {
  const categoryBranches = Object.entries(palette.spaceFills).flatMap(
    ([key, colour]) => [key, colour],
  );
  return [
    "case",
    ["boolean", ["get", "highlight"], false],
    palette.highlight,
    ["boolean", ["get", "unclassified"], false],
    palette.unclassified,
    [
      "match",
      ["coalesce", ["get", "category"], ["get", "kind"], ""],
      ...categoryBranches,
      palette.spaceFallback,
    ],
  ] as unknown as import("maplibre-gl").ExpressionSpecification;
}
