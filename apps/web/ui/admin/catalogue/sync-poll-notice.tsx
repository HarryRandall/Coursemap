"use client";

import { Button } from "@coursemap/ui/primitives/button";

export function SyncPollNotice({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="status">
      <span>Still running. Refresh to check.</span>
      <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
        Refresh to check
      </Button>
    </div>
  );
}
