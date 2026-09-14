"use client";
import { Hint } from "@/ui/common/hint";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@coursemap/ui/primitives/dialog";

import { TriangleAlert, X } from "lucide-react";
import { useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * Confirmation for an action with broad visibility or data impact. The
 * description says what actually happens so the decision is made on facts.
 */
export function ConfirmDialog({
  cancelLabel = "Cancel",
  confirmLabel,
  description,
  destructive = false,
  onConfirm,
  open,
  onOpenChange,
  returnFocusRef,
  title,
  trigger,
}: {
  cancelLabel?: string;
  confirmLabel: string;
  description: ReactNode;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  title: string;
  trigger?: ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalOpen, setInternalOpen] = useState(false);
  const resolvedOpen = open ?? internalOpen;

  function changeOpen(nextOpen: boolean) {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      changeOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The action could not be completed. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog onOpenChange={changeOpen} open={resolvedOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        className="max-w-[min(25rem,calc(100%-2rem))]"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          contentRef.current
            ?.querySelector<HTMLButtonElement>("[data-confirm-cancel]")
            ?.focus();
        }}

        ref={contentRef}
        showCloseButton={false}
      >
        <DialogHeader className="min-w-0 gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {destructive ? (
              <span
                aria-hidden="true"
                className="grid size-8 shrink-0 place-items-center rounded-md bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300"
              >
                <TriangleAlert size={16} />
              </span>
            ) : null}
            <Hint label={title}>
              <DialogTitle
                className="min-w-0 flex-1 truncate text-base font-semibold"
                tabIndex={0}
              >
                {title}
              </DialogTitle>
            </Hint>
            <DialogClose asChild>
              <Button
                aria-label="Close"
                className="shrink-0"
                size="icon-sm"
                variant="ghost"
              >
                <X aria-hidden="true" size={17} />
              </Button>
            </DialogClose>
          </div>
          <DialogDescription asChild>
            <div className="text-sm leading-5 text-muted-foreground">
              {description}
            </div>
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter className="m-0 min-w-0 rounded-none border-0 bg-transparent p-0">
          <Button
            data-confirm-cancel
            onClick={() => changeOpen(false)}
            type="button"
            variant="outline"
          >
            {cancelLabel}
          </Button>
          <Button
            disabled={pending}
            onClick={confirm}
            type="button"
            variant={destructive ? "destructive" : "default"}
          >
            {pending ? "Working..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
