"use client";
import { ChevronDown, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addChild,
  addNestedSection,
  addSibling,
  childIndex,
  conditionSummary,
  createConditionNode,
  createGroupNode,
  deleteFromTree,
  findParentId,
  groupDepth,
  groupSentence,
  MAX_REVIEWED_GROUP_DEPTH,
  operatorJoiner,
  setGroupOperator,
  updateTree,
  type ReviewedConditionKind,
  type ReviewedConditionNode,
  type ReviewedGroupNode,
  type ReviewedRuleTree,
} from "@/lib/coursemap/requisite-conditions";
import {
  ConditionChip,
  ConditionIcon,
  GroupOperatorMenu,
  RemoveButton,
  type ConditionActions,
} from "@/ui/admin/requisites/requisite-rule-controls";
import { type DragController } from "@/ui/admin/requisites/requisite-drag";

export function OperatorControl({
  canEdit,
  group,
  onChange,
  tree,
}: {
  canEdit: boolean;
  group: ReviewedGroupNode;
  onChange: (tree: ReviewedRuleTree) => void;
  tree: ReviewedRuleTree;
}) {
  const label = operatorJoiner(group);
  const chip = cn(
    "inline-flex min-h-8 min-w-[3.75rem] cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase shadow-xs transition-colors outline-none hover:border-input hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/20 max-md:min-w-[3.5rem] max-md:px-1.5",
  );

  if (!canEdit) {
    return <span className={chip}>{label}</span>;
  }

  return (
    <GroupOperatorMenu
      group={group}
      onOperator={(operator, minimumCount) =>
        onChange(setGroupOperator(tree, group.id, operator, minimumCount))
      }
    >
      <button aria-label={`Join with ${label}`} className={chip} type="button">
        {label}
        <ChevronDown aria-hidden="true" className="size-3 opacity-70" />
      </button>
    </GroupOperatorMenu>
  );
}
export function WhereLabel() {
  return (
    <span className="relative z-10 inline-flex min-h-8 items-center text-xs font-medium text-muted-foreground">
      Where
    </span>
  );
}
export function GroupBlock({
  canEdit,
  canRemove,
  drag,
  group,
  onChange,
  tree,
}: {
  canEdit: boolean;
  canRemove: boolean;
  drag: DragController;
  group: ReviewedGroupNode;
  onChange: (tree: ReviewedRuleTree) => void;
  tree: ReviewedRuleTree;
}) {
  const depth = groupDepth(tree, group.id) ?? 1;
  const canNest = canEdit && depth < MAX_REVIEWED_GROUP_DEPTH;
  const empty = group.children.length === 0;
  const isRoot = depth === 1;

  function conditionActions(childId: string): ConditionActions {
    return {
      canNest,
      onAddCondition: (kind: ReviewedConditionKind) =>
        onChange(addSibling(tree, childId, createConditionNode(kind))),
      onAddGroup: () =>
        onChange(addSibling(tree, childId, createGroupNode("all_of"))),
      onChange: (next: ReviewedConditionNode) =>
        onChange(updateTree(tree, childId, () => next)),
      onKindChange: (kind: ReviewedConditionKind) =>
        onChange(
          updateTree(tree, childId, (previous) => ({
            type: "condition" as const,
            id: childId,
            kind,
            // A new kind keeps whether the condition is hard or soft.
            ...(previous.type === "condition" && previous.hardness
              ? { hardness: previous.hardness }
              : {}),
          })),
        ),
      onRemove: () => onChange(deleteFromTree(tree, childId)),
    };
  }

  const emptyPrompt = (
    <EmptyGroupPrompt
      canEdit={canEdit}
      onAdd={() =>
        onChange(addChild(tree, group.id, createConditionNode("course")))
      }
    />
  );

  return (
    <div
      className={cn(
        "transition-colors",
        !isRoot && "w-full max-w-full",
        isRoot
          ? "rounded-xl border border-border bg-muted/30 p-4 max-md:p-2"
          : "rounded-xl border border-border bg-card p-4 shadow-xs max-md:p-2",
      )}
      data-group-id={group.id}
      data-requisite-group=""
    >
      {isRoot ? null : (
        <NestedGroupHeader
          canEdit={canEdit}
          canRemove={canRemove}
          group={group}
          onChange={onChange}
          tree={tree}
        />
      )}
      <div className="flex w-full flex-col items-start">
        {empty ? (
          <div className="flex min-h-28 w-full items-center justify-center">
            {emptyPrompt}
          </div>
        ) : (
          <div className="relative w-full">
            {group.children.length > 1 ? (
              <span
                aria-hidden="true"
                className="absolute top-11 bottom-6 left-10 w-px bg-accent max-md:left-[1.375rem]"
              />
            ) : null}
            <DropPreview drag={drag} groupId={group.id} index={0} />
            {group.children.map((child, index) => (
              <div className="contents" key={child.id}>
                {index > 0 ? (
                  <RailJoiner
                    canEdit={canEdit}
                    group={group}
                    onChange={onChange}
                    tree={tree}
                  />
                ) : null}
                <div
                  className="grid w-full grid-cols-[5rem_minmax(0,1fr)] items-start gap-2 max-md:grid-cols-[2.75rem_minmax(0,1fr)] max-md:gap-1"
                  data-child-index={index}
                  data-parent-group-id={group.id}
                  data-requisite-child=""
                >
                  <span className="relative z-10 flex min-h-11 items-start justify-center pt-2">
                    {index === 0 && child.type === "condition" ? (
                      <WhereLabel />
                    ) : null}
                  </span>
                  {child.type === "group" ? (
                    <GroupBlock
                      canEdit={canEdit}
                      canRemove
                      drag={drag}
                      group={child}
                      onChange={onChange}
                      tree={tree}
                    />
                  ) : (
                    <>
                      {drag.activeId === child.id && drag.dragPointer ? (
                        <span
                          aria-hidden="true"
                          className="w-full rounded-md border border-dashed border-border bg-card/80"
                          style={{ height: drag.dragPointer.height }}
                        />
                      ) : (
                        <ConditionChip
                          actions={conditionActions(child.id)}
                          canEdit={canEdit}
                          condition={child}
                          drag={
                            canEdit
                              ? {
                                  dragging: false,
                                  onKeyDown: (event) => {
                                    if (
                                      !event.altKey ||
                                      (event.key !== "ArrowUp" &&
                                        event.key !== "ArrowDown")
                                    ) {
                                      return;
                                    }
                                    const parentId = findParentId(
                                      tree,
                                      child.id,
                                    );
                                    const index = childIndex(tree, child.id);
                                    if (!parentId || index == null) return;
                                    event.preventDefault();
                                    const requestedIndex =
                                      event.key === "ArrowUp"
                                        ? index - 1
                                        : index + 2;
                                    if (
                                      requestedIndex < 0 ||
                                      requestedIndex > group.children.length
                                    ) {
                                      return;
                                    }
                                    drag.dropAt(
                                      child.id,
                                      parentId,
                                      requestedIndex,
                                    );
                                  },
                                  onPointerDown: (event) =>
                                    drag.start(child.id, event),
                                }
                              : undefined
                          }
                        />
                      )}
                    </>
                  )}
                </div>
                <DropPreview drag={drag} groupId={group.id} index={index + 1} />
              </div>
            ))}
          </div>
        )}
        <GroupActions
          canEdit={canEdit}
          canNest={canNest}
          onAddCondition={() =>
            onChange(addChild(tree, group.id, createConditionNode("course")))
          }
          onAddGroup={() => onChange(addNestedSection(tree, group.id))}
        />
      </div>
    </div>
  );
}
export function DropPreview({
  drag,
  groupId,
  index,
}: {
  drag: DragController;
  groupId: string;
  index: number;
}) {
  const id = `${groupId}:${index}`;
  if (drag.overSlot !== id || !drag.activeCondition || !drag.dragPointer) {
    return null;
  }
  const summary = conditionSummary(drag.activeCondition);

  return (
    <div
      aria-hidden="true"
      className="grid w-full grid-cols-[5rem_minmax(0,1fr)] gap-2 max-md:grid-cols-[2.75rem_minmax(0,1fr)] max-md:gap-1"
      data-group-id={groupId}
      data-index={index}
      data-requisite-drop-preview=""
      style={{ minHeight: drag.dragPointer.height }}
    >
      <span aria-hidden="true" />
      <span className="pointer-events-none my-1 flex origin-top animate-drop-slot-in items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-xs font-medium text-primary ring-1 ring-primary/25 ring-inset motion-reduce:animate-none">
        <GripVertical
          aria-hidden="true"
          className="size-4 shrink-0 text-primary/50"
        />
        <ConditionIcon
          className="shrink-0 text-primary"
          kind={drag.activeCondition.kind}
          size={15}
        />
        <span className="line-clamp-2">{summary}</span>
      </span>
    </div>
  );
}
export function RailJoiner({
  canEdit,
  group,
  onChange,
  tree,
}: {
  canEdit: boolean;
  group: ReviewedGroupNode;
  onChange: (tree: ReviewedRuleTree) => void;
  tree: ReviewedRuleTree;
}) {
  return (
    <div className="grid h-11 w-full grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 max-md:grid-cols-[2.75rem_minmax(0,1fr)] max-md:gap-1">
      <span className="relative z-10 flex justify-center">
        <OperatorControl
          canEdit={canEdit}
          group={group}
          onChange={onChange}
          tree={tree}
        />
      </span>
      <span aria-hidden="true" />
    </div>
  );
}
export function GroupActions({
  canEdit,
  canNest,
  onAddCondition,
  onAddGroup,
}: {
  canEdit: boolean;
  canNest: boolean;
  onAddCondition: () => void;
  onAddGroup: () => void;
}) {
  if (!canEdit) return null;

  return (
    <div className="mt-3 flex w-full flex-wrap items-center gap-1 border-t border-border pt-3">
      <button
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm font-medium text-emerald-600 transition-colors outline-none hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-3 focus-visible:ring-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-950/60 dark:hover:text-emerald-300"
        onClick={onAddCondition}
        type="button"
      >
        <Plus aria-hidden="true" size={16} />
        Add condition
      </button>
      <button
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canNest}
        onClick={onAddGroup}
        type="button"
      >
        <Plus aria-hidden="true" size={16} />
        Add group
      </button>
    </div>
  );
}
export function NestedGroupHeader({
  canEdit,
  canRemove,
  group,
  onChange,
  tree,
}: {
  canEdit: boolean;
  canRemove: boolean;
  group: ReviewedGroupNode;
  onChange: (tree: ReviewedRuleTree) => void;
  tree: ReviewedRuleTree;
}) {
  const sentence = groupSentence(group);
  const title = canEdit ? (
    <GroupOperatorMenu
      group={group}
      onOperator={(operator, minimumCount) =>
        onChange(setGroupOperator(tree, group.id, operator, minimumCount))
      }
    >
      <button
        aria-label={`Change this group: ${sentence}`}
        className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-md px-2 text-left text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/20"
        type="button"
      >
        {sentence}
        <ChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 opacity-70"
        />
      </button>
    </GroupOperatorMenu>
  ) : (
    <span className="text-sm font-medium text-muted-foreground">
      {sentence}
    </span>
  );

  return (
    <div className="mb-2 flex items-center gap-1 border-b border-border pb-2">
      {title}
      <span className="ml-auto flex items-center">
        {canEdit && canRemove ? (
          <RemoveButton
            className="size-9"
            label="Remove group"
            onClick={() => onChange(deleteFromTree(tree, group.id))}
            variant="muted"
          />
        ) : null}
      </span>
    </div>
  );
}
export function EmptyGroupPrompt({
  canEdit,
  onAdd,
}: {
  canEdit: boolean;
  onAdd: () => void;
}) {
  if (!canEdit) {
    return (
      <span className="text-sm text-muted-foreground">No conditions yet.</span>
    );
  }

  return (
    <button
      className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-input px-4 text-sm font-medium text-muted-foreground transition-colors outline-none hover:border-input hover:bg-accent/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/20"
      onClick={onAdd}
      type="button"
    >
      <Plus aria-hidden="true" size={14} />
      Add condition
    </button>
  );
}
