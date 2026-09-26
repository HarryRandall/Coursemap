"use client";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  childIndex,
  findInTree,
  findParentId,
  moveInTree,
  type ReviewedRuleTree,
} from "@/lib/coursemap/requisite-conditions";
import { ConditionChip } from "@/ui/admin/requisites/requisite-rule-controls";
import {
  DRAG_PREVIEW_ACTIONS,
  DRAG_PREVIEW_HANDLE,
  type DragController,
  type DragPointer,
  dropTargetAtPoint,
} from "@/ui/admin/requisites/requisite-drag";
import { GroupBlock } from "@/ui/admin/requisites/requisite-group-block";
import { scrollParent } from "@/lib/scroll-parent";

type DropTarget = { groupId: string; id: string; index: number };
export function RequisiteRuleTree({
  canEdit,
  onChange,
  tree,
}: {
  canEdit: boolean;
  onChange: (tree: ReviewedRuleTree) => void;
  tree: ReviewedRuleTree;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overSlot, setOverSlot] = useState<string | null>(null);
  const [dragPointer, setDragPointer] = useState<DragPointer | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const floatingCardRef = useRef<HTMLDivElement | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      pointerCleanupRef.current?.();
    },
    [],
  );

  function cancel() {
    pointerCleanupRef.current?.();
    pointerCleanupRef.current = null;
    dropTargetRef.current = null;
    setActiveId(null);
    setOverSlot(null);
    setDragPointer(null);
  }

  function dropAt(moving: string, groupId: string, requestedIndex: number) {
    let index = requestedIndex;
    const fromIndex = childIndex(tree, moving);
    if (
      findParentId(tree, moving) === groupId &&
      fromIndex != null &&
      fromIndex < index
    ) {
      index -= 1;
    }
    onChange(moveInTree(tree, moving, groupId, index));
  }

  function previewDrop(movingId: string, target: DropTarget | null) {
    const parentId = findParentId(tree, movingId);
    const index = childIndex(tree, movingId);
    const next =
      target &&
      !(
        target.groupId === parentId &&
        index != null &&
        (target.index === index || target.index === index + 1)
      )
        ? target
        : null;
    dropTargetRef.current = next;
    setOverSlot((current) =>
      current === next?.id ? current : (next?.id ?? null),
    );
  }

  function finishPointerDrag(movingId: string, cancelled = false) {
    const target = dropTargetRef.current;
    cancel();
    if (!cancelled && target) {
      dropAt(movingId, target.groupId, target.index);
    }
  }

  function startPointerDrag(
    movingId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (!event.isPrimary || event.button !== 0 || pointerCleanupRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.focus();

    const card = event.currentTarget.closest<HTMLElement>(
      "[data-requisite-condition]",
    );
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const scroller = scrollParent(card);
    setActiveId(movingId);
    previewDrop(movingId, null);
    setDragPointer({
      height: rect.height,
      initialX: event.clientX,
      initialY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
    });

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("keydown", handleKeyDown);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      moveEvent.preventDefault();
      if (floatingCardRef.current) {
        floatingCardRef.current.style.transform = `translate3d(${moveEvent.clientX - (event.clientX - rect.left)}px, ${moveEvent.clientY - (event.clientY - rect.top)}px, 0)`;
      }
      const bounds =
        scroller === document.scrollingElement
          ? { top: 0, bottom: window.innerHeight }
          : scroller.getBoundingClientRect();
      if (moveEvent.clientY < bounds.top + 72) {
        scroller.scrollBy({ top: -12, behavior: "auto" });
      }
      if (moveEvent.clientY > bounds.bottom - 72) {
        scroller.scrollBy({ top: 12, behavior: "auto" });
      }
      previewDrop(
        movingId,
        dropTargetAtPoint(moveEvent.clientX, moveEvent.clientY),
      );
    };
    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === event.pointerId) {
        finishPointerDrag(movingId);
      }
    };
    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId === event.pointerId) {
        finishPointerDrag(movingId, true);
      }
    };
    const handleKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") finishPointerDrag(movingId, true);
    };

    pointerCleanupRef.current = cleanup;
    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("keydown", handleKeyDown);
  }

  const activeNode = activeId ? findInTree(tree, activeId) : null;
  const activeCondition = activeNode?.type === "condition" ? activeNode : null;

  const drag: DragController = {
    activeCondition,
    activeId,
    cancel,
    dragPointer,
    overSlot,
    start: startPointerDrag,
    dropAt,
  };

  return (
    <>
      <GroupBlock
        canEdit={canEdit}
        canRemove={false}
        drag={drag}
        group={tree}
        onChange={onChange}
        tree={tree}
      />
      {dragPointer && activeCondition ? (
        <div className="pointer-events-none fixed inset-0 z-[120] cursor-grabbing select-none">
          <div
            aria-hidden="true"
            className="absolute top-0 left-0 rounded-md bg-card opacity-95 shadow-xl ring-1 ring-border will-change-transform"
            inert
            ref={floatingCardRef}
            style={{
              transform: `translate3d(${dragPointer.initialX - dragPointer.offsetX}px, ${dragPointer.initialY - dragPointer.offsetY}px, 0)`,
              width: dragPointer.width,
            }}
          >
            <ConditionChip
              actions={DRAG_PREVIEW_ACTIONS}
              canEdit
              condition={activeCondition}
              drag={DRAG_PREVIEW_HANDLE}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
