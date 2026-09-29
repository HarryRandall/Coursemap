"use client";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Button } from "@coursemap/ui/primitives/button";
import { LoaderCircle, Pause, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CatalogueProviderState } from "@/lib/coursemap/admin-operations";
import { formatTimestamp } from "./operations-format";

export function ProviderRecovery({ state }: { state: CatalogueProviderState }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!state.paused && state.heldCount === 0 && !pending && !error) return null;
  const recover = () =>
    startTransition(async () => {
      setError(null);
      let revision = state.revision;
      let resume = state.paused;
      for (;;) {
        try {
          const response = await fetch("/api/admin/catalogue-provider", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ revision, resume }),
          });
          const result = (await response.json()) as {
            error?: string;
            dispatchError?: string | null;
            dispatched?: number;
            state?: CatalogueProviderState;
          };
          if (!response.ok || !result.state)
            throw new Error(
              result.error ?? "The imports could not be resumed.",
            );
          if (result.dispatchError) throw new Error(result.dispatchError);
          if (result.state.paused)
            throw new Error(
              result.state.message ??
                "Imports paused again. Resolve the provider issue before resuming.",
            );
          if (result.state.heldCount === 0) break;
          if (result.dispatched === 0)
            throw new Error(
              "Recovery made no progress. Refresh Activity and try again.",
            );
          revision = result.state.revision;
          resume = false;
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "The imports could not be resumed.",
          );
          break;
        }
      }
      router.refresh();
    });
  return (
    <Alert variant="warning">
      <Pause aria-hidden="true" />
      <AlertTitle>
        {state.paused
          ? "Catalogue imports are paused"
          : "Paused imports are ready to recover"}
      </AlertTitle>
      <AlertDescription>
        <p>
          {state.heldCount} unfinished{" "}
          {state.heldCount === 1 ? "sync is" : "syncs are"} preserved.
        </p>
        {state.paused ? (
          <>
            <p>{state.message}</p>
            <p>
              Paused {formatTimestamp(state.pausedAt)}. Fix the provider issue
              before resuming.
            </p>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </AlertDescription>
      <AlertAction>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={recover}
        >
          {pending ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
          {pending
            ? "Resuming imports"
            : state.paused
              ? "Resume imports"
              : "Recover paused imports"}
        </Button>
      </AlertAction>
    </Alert>
  );
}
