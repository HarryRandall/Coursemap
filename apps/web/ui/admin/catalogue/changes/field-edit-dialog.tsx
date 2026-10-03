"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import { fieldLabel } from "@/lib/coursemap/catalogue-kinds";
import { CatalogueContentEditor } from "../content-editor";
import { useCatalogueEditor } from "../catalogue-editor-context";

export function FieldEditDialog({
  fieldPath,
  onClose,
  returnFocus,
}: {
  fieldPath: string;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const editor = useCatalogueEditor();
  const router = useRouter();
  const scalar = /^(course|structure)\.details\./.test(fieldPath);
  const { editing, beginEditing } = editor;
  useEffect(() => {
    if (!editing) beginEditing();
  }, [editing, beginEditing]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (!editor.dirty && editor.saveState !== "saving") router.refresh();
          onClose();
        }
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
        className={`flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 ${scalar ? "sm:max-w-xl" : "sm:max-w-3xl"}`}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pr-12 pb-4 text-left">
          <DialogTitle>{fieldLabel(fieldPath)}</DialogTitle>
        </DialogHeader>
        {/* Leave room for the first control's focus ring inside the scroll boundary. */}
        <div className="min-h-0 overflow-y-auto px-6 pt-1 pb-6">
          <CatalogueContentEditor fieldPath={fieldPath} />
        </div>
        <DialogFooter className="m-0 shrink-0 flex-row items-center justify-between gap-3 border-t px-6 py-4">
          <p
            role="status"
            className={`mr-auto min-w-0 text-sm ${editor.saveError ? "text-destructive" : "text-muted-foreground"}`}
          >
            {editor.saveError ??
              (editor.dirty || editor.saveState === "saving"
                ? "Saving..."
                : "Saved to draft")}
          </p>
          <Button
            className="shrink-0"
            disabled={editor.dirty || editor.saveState === "saving"}
            onClick={() => {
              router.refresh();
              onClose();
            }}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
