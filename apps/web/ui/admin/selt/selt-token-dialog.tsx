"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@coursemap/ui/primitives/dialog";
import { CopyButton } from "@/ui/common/copy-button";

/** Shows a newly created token once, with the command that uses it. */
export function SeltTokenDialog({
  token,
  command,
  onClose,
}: {
  token: string | null;
  command: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={token !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import token created</DialogTitle>
          <DialogDescription>
            Paste it at the import script&apos;s hidden prompt. It expires in 12
            hours and can only upload drafts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs text-warning-foreground dark:text-warning">
            <TriangleAlert size={14} aria-hidden="true" />
            Copy it now. Coursemap only stores a hash, so it cannot be shown
            again.
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2 pl-3">
            <code
              data-testid="selt-token"
              className="min-w-0 flex-1 truncate font-mono text-[13px] select-all"
            >
              {token}
            </code>
            <CopyButton value={token ?? ""} label="token" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              Run on your Mac
            </p>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2 pl-3">
              <code className="min-w-0 flex-1 font-mono text-xs leading-relaxed break-all">
                {command}
              </code>
              <CopyButton value={command} label="command" variant="ghost" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
