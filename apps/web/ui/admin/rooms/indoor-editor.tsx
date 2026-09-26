"use client";
import { buildingDrawingAngle } from "@/lib/rooms/indoor-orientation";

import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { PanelRight, PanelRightOpen } from "lucide-react";
import { EditorActions } from "@/ui/admin/rooms/editor-header";
import {
  CanvasControls,
  EditorHint,
  type SnapSettings,
} from "@/ui/admin/rooms/editor-status-bar";
import styles from "@/ui/admin/rooms/indoor-editor.module.css";
import {
  IndoorMapSurface,
  type IndoorMapSurfaceHandle,
} from "@/ui/admin/rooms/indoor-map-surface";
import { Inspector, type InspectorTab } from "@/ui/admin/rooms/inspector";
import { LevelPill } from "@/ui/admin/rooms/level-pill";
import type { SelectionDetailsHandlers } from "@/ui/admin/rooms/properties-panel";
import {
  ToolRail,
  toolDefinition,
  toolForShortcut,
  type IndoorTool,
} from "@/ui/admin/rooms/tool-rail";
import { useEditorPointer } from "@/ui/admin/rooms/use-editor-pointer";
import { useIndoorPalette } from "@/ui/admin/rooms/use-indoor-palette";
import { useUnsavedNavigation } from "@/ui/admin/rooms/use-unsaved-navigation";
import type { IndoorLayerGroup } from "@/ui/rooms/indoor-3d-layers";
import { AppShell } from "@/ui/shell/app-shell";
import { Button } from "@coursemap/ui/primitives/button";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@coursemap/ui/primitives/sheet";
import { cn } from "@/lib/cn";
import { buildIndoorScene } from "@/lib/rooms/indoor-3d";
import {
  createIndoorEditorState,
  indoorEditorReducer,
  routingSignature,
} from "@/lib/rooms/indoor-editor-state";
import {
  createIndoorDocumentForFootprint,
  projectBuildingFootprint,
  remapIndoorDocumentToFootprint,
  type IndoorFootprintProjection,
} from "@/lib/rooms/indoor-footprint";
import {
  buildIndoorRouteGraph,
  indoorAuthoredRouteEdgeIds,
  type CampusIndoorDocument,
} from "@/lib/rooms/indoor-map";
import {
  saveCampusIndoorMap,
  type CampusIndoorMapEditorRecord,
} from "@/lib/rooms/indoor-map-admin";
import {
  publishBlockedMessage,
  validateIndoorDocument,
  type IndoorIssue,
} from "@/lib/rooms/indoor-validate";
import {
  isCampusMapBuildingGeometry,
  type CampusMapData,
  type CampusMapPlace,
} from "@/lib/rooms/campus-map";
import { showToast } from "@/ui/common/toast";

/** Old links used `?tab=`; the 3D views map onto the perspective toggle. */
function perspectiveFromSearch(value: string | null) {
  return value === "floors" || value === "preview";
}

/** The real building footprint is the only authoring frame. */
function buildingFootprint(
  mapData: CampusMapData,
  buildingPlaceId: string,
): IndoorFootprintProjection | null {
  const feature = mapData.features.find(
    (candidate) =>
      candidate.featureKind === "building" &&
      candidate.placeId === buildingPlaceId &&
      isCampusMapBuildingGeometry(candidate.geometry),
  );
  if (!feature || !isCampusMapBuildingGeometry(feature.geometry)) return null;

  try {
    return projectBuildingFootprint(feature.geometry);
  } catch {
    return null;
  }
}

function documentForFootprint(
  record: CampusIndoorMapEditorRecord,
  footprint: IndoorFootprintProjection | null,
): CampusIndoorDocument {
  if (!footprint) return record.document;
  if (record.document.levels.length === 0) {
    return createIndoorDocumentForFootprint(footprint);
  }
  return remapIndoorDocumentToFootprint(record.document, footprint);
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.getAttribute("role") === "textbox"
  );
}

export function IndoorEditor({
  building,
  mapData,
  record,
}: {
  building: CampusMapPlace;
  mapData: CampusMapData;
  record: CampusIndoorMapEditorRecord;
}) {
  const searchParams = useSearchParams();
  const footprint = useMemo(
    () => buildingFootprint(mapData, building.id),
    [building.id, mapData],
  );
  const [state, dispatch] = useReducer(indoorEditorReducer, undefined, () =>
    createIndoorEditorState(
      documentForFootprint(record, footprint),
      record.name,
      footprint,
    ),
  );
  const [perspective, setPerspective] = useState(() =>
    perspectiveFromSearch(searchParams.get("tab")),
  );
  const [tool, setTool] = useState<IndoorTool>("select");
  const [snapSettings, setSnapSettings] = useState<SnapSettings>({
    grid: true,
    geometry: true,
  });
  const [hiddenLayers, setHiddenLayers] = useState<
    ReadonlySet<IndoorLayerGroup>
  >(() => new Set());
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("selection");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const inspectorId = useId();
  const [savedRecord, setSavedRecord] = useState(record);
  const [savingStatus, setSavingStatus] = useState<
    "draft" | "published" | null
  >(null);
  const unsavedNavigation = useUnsavedNavigation(state.dirty);
  const rootRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<IndoorMapSurfaceHandle>(null);
  const palette = useIndoorPalette(rootRef);

  const { document } = state;
  const level =
    document.levels.find((candidate) => candidate.id === state.levelId) ??
    document.levels[0];
  // Pitched 3D unprojects onto the ground plane, so geometry edits are
  // plan-only and the tools rest until the author returns to plan view.
  const editingEnabled = !perspective;
  const [manualDrawingAngle, setDrawingAngle] = useState<number | null>(null);
  const drawingAngle =
    manualDrawingAngle ?? buildingDrawingAngle(footprint?.outline ?? []);
  const authoredRouteEdgeIds = useMemo(
    () => indoorAuthoredRouteEdgeIds(document),
    [document],
  );

  const signature = routingSignature(document);
  const routedDocument = useMemo(
    () => {
      try {
        return buildIndoorRouteGraph(document);
      } catch {
        return document;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  const scene = useMemo(
    () =>
      footprint
        ? buildIndoorScene(routedDocument, footprint, {
            explode: perspective ? 2.25 : 1,
            activeLevelId: level?.id ?? null,
            showInactiveLevels: perspective,
            routeEdgeIds: authoredRouteEdgeIds,
            highlightConnectorIds:
              state.selection?.kind === "connector"
                ? new Set([state.selection.id])
                : undefined,
            highlightSpaceIds:
              state.selection?.kind === "space"
                ? new Set([state.selection.id])
                : undefined,
          })
        : null,
    [
      authoredRouteEdgeIds,
      footprint,
      level?.id,
      perspective,
      routedDocument,
      state.selection,
    ],
  );

  const pointer = useEditorPointer({
    document,
    routedDocument,
    footprint,
    level,
    tool,
    selection: state.selection,
    editingEnabled,
    drawingAngle,
    snapSettings,
    dispatch,
    onToolDone: () => setTool("select"),
  });
  const cancelPointer = pointer.cancel;

  const issues = useMemo(() => validateIndoorDocument(document), [document]);
  const publishBlocked = publishBlockedMessage(issues);

  const selectTool = useCallback(
    (nextTool: IndoorTool) => {
      cancelPointer();
      setPerspective(false);
      setTool(nextTool);
    },
    [cancelPointer],
  );

  // Single-key tool shortcuts work anywhere in the editor except inside a
  // text field, and the modifier combinations stay with the browser. Enter,
  // Escape and Backspace finish, cancel or trim a drawing from anywhere too:
  // after clicking a tool button the focus is on that button, and the author
  // should not have to know that before pressing Enter.
  const pointerKeyDown = pointer.onKeyDown;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        !(event.target instanceof HTMLElement) ||
        !rootRef.current?.contains(event.target) ||
        event.target.closest('[role="dialog"], [role="menu"], [role="listbox"]')
      )
        return;
      if (event.metaKey || event.ctrlKey || event.altKey) {
        if (
          (event.metaKey || event.ctrlKey) &&
          !event.altKey &&
          event.key.toLowerCase() === "z" &&
          !isTypingTarget(event.target)
        ) {
          event.preventDefault();
          dispatch({ type: event.shiftKey ? "redo" : "undo" });
        }
        return;
      }
      if (isTypingTarget(event.target)) return;
      // Keep native keyboard activation on controls, including Radix triggers.
      if (
        event.target.closest(
          'button, a, [role="tab"], [role="checkbox"], [role="combobox"]',
        )
      )
        return;
      if (
        event.key === "Enter" ||
        event.key === "Escape" ||
        event.key === "Backspace" ||
        event.key === "Delete"
      ) {
        pointerKeyDown(event);
        return;
      }
      if (!editingEnabled) return;
      const shortcutTool = toolForShortcut(event.key);
      if (shortcutTool && event.key.length === 1) {
        event.preventDefault();
        selectTool(shortcutTool);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editingEnabled, pointerKeyDown, selectTool]);

  const pointerSelect = pointer.onSelect;
  const handlePick = useCallback(
    (picked: Parameters<typeof pointerSelect>[0]) => {
      if (perspective) dispatch({ type: "select", selection: picked });
      else pointerSelect(picked);
      // A fresh pick is what the author wants to look at, so the inspector
      // follows it rather than staying on layers or issues.
      if (picked) setInspectorTab("selection");
    },
    [pointerSelect, perspective],
  );

  function selectLevel(levelId: string) {
    pointer.cancel();
    setTool("select");
    dispatch({ type: "level/select", levelId });
  }

  function changePerspective(next: boolean) {
    pointer.cancel();
    setTool("select");
    setPerspective(next);
  }

  function focusIssue(issue: IndoorIssue) {
    if (issue.levelId && issue.levelId !== level?.id) {
      dispatch({ type: "level/select", levelId: issue.levelId });
    }
    if (issue.target && issue.target.kind !== "level") {
      dispatch({
        type: "select",
        selection: { kind: issue.target.kind, id: issue.target.id },
      });
    }
  }

  async function save(status: "draft" | "published", name: string) {
    setSavingStatus(status);
    if (name !== state.name) dispatch({ type: "map/rename", name });
    const sourceDocument = document;
    const sourceName = name;
    try {
      const saved = buildIndoorRouteGraph(sourceDocument);
      const result = await saveCampusIndoorMap({
        buildingPlaceId: building.id,
        name,
        document: saved,
        revision: savedRecord.revision,
        status,
      });
      if (result.ok) {
        showToast(result.message);
        setSavedRecord((current) => ({
          ...current,
          name,
          status,
          revision: result.revision,
          updatedAt: new Date().toISOString(),
        }));
        dispatch({
          type: "saved",
          document: saved,
          name,
          sourceDocument,
          sourceName,
        });
      } else {
        showToast(result.message, "error");
      }
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : "Couldn't save this floor plan",
        "error",
      );
    } finally {
      setSavingStatus(null);
    }
  }

  const selectionHandlers: SelectionDetailsHandlers = {
    updateSpace: (id, patch) => dispatch({ type: "space/update", id, patch }),
    rotateSpace: (id, degrees) =>
      dispatch({ type: "space/rotate", id, degrees }),
    updateWall: (id, patch) => dispatch({ type: "wall/update", id, patch }),
    updateOpening: (id, patch) =>
      dispatch({ type: "opening/update", id, patch }),
    updateConnector: (id, patch) =>
      dispatch({ type: "connector/update", id, patch }),
    remove: () => dispatch({ type: "delete" }),
  };

  function renderInspector(onCollapse?: () => void) {
    return (
      <Inspector
        className="h-full min-h-0 flex-1"
        document={document}
        handlers={selectionHandlers}
        hiddenLayers={hiddenLayers}
        issues={issues}
        onCollapse={onCollapse}
        onFocusIssue={focusIssue}
        onTabChange={setInspectorTab}
        onToggleLayer={(group, visible) =>
          setHiddenLayers((current) => {
            const next = new Set(current);
            if (visible) next.delete(group);
            else next.add(group);
            return next;
          })
        }
        selection={state.selection}
        tab={inspectorTab}
      />
    );
  }

  const statusHint = !editingEnabled
    ? "Drag to orbit. Lift movement is illustrative. Switch to plan view to draw."
    : tool === "select"
      ? state.selection?.kind === "space"
        ? "Drag the room to move it. Rotate it from the inspector. Delete removes it."
        : state.selection
          ? "Edit the selection in the inspector. Delete removes it."
          : toolDefinition(tool).hint
      : toolDefinition(tool).hint;

  const canvasControls = (
    <CanvasControls
      onFit={() => surfaceRef.current?.resetView()}
      onPerspectiveChange={changePerspective}
      onSnapChange={setSnapSettings}
      onZoomIn={() => surfaceRef.current?.zoomIn()}
      onZoomOut={() => surfaceRef.current?.zoomOut()}
      perspective={perspective}
      snap={snapSettings}
      drawingAngle={drawingAngle}
      onDrawingAngleChange={(angle) => {
        cancelPointer();
        setDrawingAngle(angle);
      }}
    />
  );

  return (
    <AppShell
      actions={
        <EditorActions
          canRedo={state.future.length > 0}
          canUndo={state.past.length > 0}
          currentStatus={
            savedRecord.status === "published" ? "published" : "draft"
          }
          name={state.name}
          onRedo={() => dispatch({ type: "redo" })}
          onSave={(status, name) => void save(status, name)}
          onUndo={() => dispatch({ type: "undo" })}
          publishBlocked={publishBlocked}
          savingStatus={savingStatus}
        />
      }
      admin
      currentBreadcrumbLabel={building.name}
      fill
      fullBleed
    >
      <h1 className="sr-only">{building.name} floor plan</h1>
      <ConfirmDialog
        confirmLabel="Leave page"
        description="Your unsaved indoor map changes will be lost."
        destructive
        onConfirm={unsavedNavigation.confirmNavigation}
        onOpenChange={(open) => {
          if (!open) unsavedNavigation.cancelNavigation();
        }}
        open={unsavedNavigation.navigationPending}
        title="Leave without saving?"
      />
      <div
        className={cn(
          styles.theme,
          "flex min-h-[calc(100dvh-4rem)] flex-col bg-background md:min-h-0 md:flex-1",
        )}
        ref={rootRef}
      >
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <ToolRail
            disabled={!level}
            footer={canvasControls}
            onSelect={selectTool}
            tool={tool}
          />

          <section
            aria-label="Floor plan canvas"
            className="relative flex min-h-[28rem] min-w-0 flex-1 flex-col md:min-h-0"
          >
            {level && footprint ? (
              <IndoorMapSurface
                centre={building.coordinates}
                className="min-h-0 flex-1"
                draft={editingEnabled ? pointer.drag : null}
                drawing={
                  editingEnabled &&
                  (tool !== "select" || pointer.drag.kind !== "idle")
                }
                frameOutline={level.outline}
                hiddenLayers={hiddenLayers}
                onKeyDown={editingEnabled ? pointer.onKeyDown : undefined}
                onPick={handlePick}
                onScaleChange={pointer.onUnitsPerPixel}
                onWorldDoubleClick={
                  editingEnabled ? pointer.onDoubleClick : undefined
                }
                onWorldPointerDown={
                  editingEnabled ? pointer.onPointerDown : undefined
                }
                onWorldPointerMove={
                  editingEnabled ? pointer.onPointerMove : undefined
                }
                onWorldPointerUp={
                  editingEnabled ? pointer.onPointerUp : undefined
                }
                palette={palette}
                perspective={perspective}
                drawingAngle={drawingAngle}
                showGrid={snapSettings.grid && editingEnabled}
                projection={footprint}
                ref={surfaceRef}
                scene={scene}
                spaces={document.spaces.filter(
                  (space) => space.levelId === level.id,
                )}
              />
            ) : (
              <div className="grid flex-1 place-items-center p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {footprint
                    ? "Add a floor to start drawing this building."
                    : "This building has no footprint to draw on."}
                </p>
              </div>
            )}

            <LevelPill
              activeLevelId={state.levelId}
              className="absolute bottom-3 left-3"
              levels={document.levels}
              onAdd={() => dispatch({ type: "level/add" })}
              onMove={(levelId, direction) =>
                dispatch({ type: "level/move", levelId, direction })
              }
              onRemove={(levelId) =>
                dispatch({ type: "level/remove", levelId })
              }
              onSelect={selectLevel}
              onUpdate={(levelId, patch) =>
                dispatch({ type: "level/update", levelId, patch })
              }
            />

            <div className="absolute top-3 right-3 lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button aria-label="Open inspector" size="icon">
                    <PanelRight aria-hidden="true" size={18} />
                  </Button>
                </SheetTrigger>
                <SheetContent className="flex flex-col gap-0 p-0">
                  <SheetHeader className="shrink-0 border-b border-border px-4 py-3 pr-14">
                    <SheetTitle>Inspector</SheetTitle>
                    <SheetDescription className="sr-only">
                      Selection details, layer visibility and issues.
                    </SheetDescription>
                  </SheetHeader>
                  {renderInspector()}
                </SheetContent>
              </Sheet>
            </div>

            {inspectorOpen ? null : (
              <div className="absolute top-3 right-3 hidden lg:block">
                <Button
                  aria-controls={inspectorId}
                  aria-expanded={false}
                  aria-label="Show inspector"
                  onClick={() => setInspectorOpen(true)}
                  size="icon"
                >
                  <PanelRightOpen aria-hidden="true" size={18} />
                </Button>
              </div>
            )}

            <EditorHint
              className="pointer-events-none absolute inset-x-0 bottom-3 pl-14"
              hint={statusHint}
              warning={editingEnabled ? pointer.boundaryMessage : null}
            />
          </section>

          <aside
            aria-label="Inspector"
            className={cn(
              "hidden w-80 shrink-0 border-l border-border xl:w-88",
              inspectorOpen && "lg:block",
            )}
            id={inspectorId}
          >
            {renderInspector(() => setInspectorOpen(false))}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
