"use client";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@coursemap/ui/primitives/collapsible";
import { ChevronDown, CircleAlert, RefreshCw } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import { type CatalogueSyncTarget, useCatalogueSync } from "./sync-button";

export type RecordSync = ReturnType<typeof useCatalogueSync>;

const RecordSyncContext = createContext<RecordSync | null>(null);

/**
 * Follows the record's sync once for everything in the header, so the menu and
 * the failure notice start and watch the same sync rather than one each.
 */
export function RecordSyncProvider({
  target,
  children,
}: {
  target: CatalogueSyncTarget;
  children: ReactNode;
}) {
  const sync = useCatalogueSync(target);
  return (
    <RecordSyncContext.Provider value={sync}>
      {children}
    </RecordSyncContext.Provider>
  );
}

/** The record's sync, or null where this person cannot sync it. */
export function useRecordSync() {
  return useContext(RecordSyncContext);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-AU", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(value));
}

/**
 * Says the last sync failed and offers to run it again. What went wrong is
 * kept behind Details, since the database's own wording helps whoever is
 * investigating and nobody else.
 */
export function FailedSyncAlert({
  errorCode,
  errorMessage,
  failedAt,
}: {
  errorCode: string | null;
  errorMessage: string | null;
  failedAt: string | null;
}) {
  const sync = useRecordSync();
  if (sync?.isActive) return null;
  return (
    <Collapsible asChild>
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>The last ANU sync failed</AlertTitle>
        <AlertDescription>
          <p>
            It stopped before it finished, so nothing on this record changed.
          </p>
          <CollapsibleContent className="w-full">
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {failedAt ? (
                <>
                  <dt className="font-medium text-foreground">Failed</dt>
                  <dd>{formatTime(failedAt)}</dd>
                </>
              ) : null}
              {errorCode ? (
                <>
                  <dt className="font-medium text-foreground">Code</dt>
                  <dd className="font-mono">{errorCode}</dd>
                </>
              ) : null}
              <dt className="font-medium text-foreground">Error</dt>
              <dd className="font-mono break-words whitespace-pre-wrap">
                {errorMessage ?? "No error was recorded."}
              </dd>
            </dl>
          </CollapsibleContent>
        </AlertDescription>
        <AlertAction>
          <CollapsibleTrigger asChild>
            <Button className="group" size="sm" type="button" variant="outline">
              Details
              <ChevronDown
                className="transition-transform group-data-[state=open]:rotate-180"
                aria-hidden="true"
              />
            </Button>
          </CollapsibleTrigger>
          {sync ? (
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={sync.busy}
              onClick={sync.start}
            >
              <RefreshCw aria-hidden="true" /> Retry sync
            </Button>
          ) : null}
        </AlertAction>
      </Alert>
    </Collapsible>
  );
}
