"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus } from "lucide-react";
import { Badge } from "@coursemap/ui/components/badge";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@coursemap/ui/primitives/card";
import { badgeVariantForTone } from "@/lib/ui";
import type { SeltAdminToken } from "@/lib/selt/admin";
import {
  remainingLabel,
  seltTokenHandle,
  seltTokenState,
} from "@/lib/selt/admin-format";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coursemap/ui/primitives/table";
import { ConfirmDialog } from "@/ui/common/confirm-dialog";
import { SeltTokenDialog } from "@/ui/admin/selt/selt-token-dialog";
import { formatCanberraDateTime } from "@/lib/canberra-format";

async function postAction(body: Record<string, string>) {
  const response = await fetch("/api/admin/selt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The SELT action failed.");
  return result;
}

function importCommand(origin: string) {
  return `~/.venvs/coursemap-selt/bin/python apps/web/scripts/selt/import-reports.py --site ${origin} --all`;
}

export function SeltAccess({
  tokens,
  renderedAt,
}: {
  tokens: SeltAdminToken[];
  /**
   * When the server read the tokens. Status is measured from this so the
   * server and client render the same markup; a refresh updates it.
   */
  renderedAt: string;
}) {
  const router = useRouter();
  const [created, setCreated] = useState<{
    token: string;
    command: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const now = new Date(renderedAt);

  async function run(body: Record<string, string>) {
    setBusy(true);
    setError("");
    try {
      const result = await postAction(body);
      if (result.token) {
        setCreated({
          token: result.token,
          command: importCommand(window.location.origin),
        });
      }
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "The SELT action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>
            <h2>Import tokens</h2>
          </CardTitle>
          <CardDescription>
            Tokens let the local import script upload drafts. ANU credentials
            stay on your Mac.
          </CardDescription>
          <CardAction>
            <Button
              disabled={busy}
              onClick={() => void run({ action: "create" })}
            >
              <Plus aria-hidden="true" />
              Create token
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {tokens.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <KeyRound className="text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No tokens yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Create one to run the local import script.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableCaption className="sr-only">Import tokens</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Uploads</TableHead>
                    <TableHead>Last upload</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((entry) => {
                    const state = seltTokenState(entry, now);
                    const handle = seltTokenHandle(entry.id);
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <span className="flex min-w-0 items-center gap-2.5">
                            <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted/50">
                              <KeyRound size={14} aria-hidden="true" />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-mono text-[13px]">
                                {handle}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {entry.createdBy ?? "Unknown administrator"}
                              </span>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          {state.kind === "active" ? (
                            <Badge variant={badgeVariantForTone.success}>
                              Active · {remainingLabel(state.remainingMs)}
                            </Badge>
                          ) : (
                            <Badge variant={badgeVariantForTone.neutral}>
                              {state.kind === "revoked" ? "Revoked" : "Expired"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatCanberraDateTime(entry.createdAt)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {entry.reports}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {entry.lastUploadAt
                            ? formatCanberraDateTime(entry.lastUploadAt)
                            : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          {state.kind === "active" ? (
                            <ConfirmDialog
                              title={`Revoke ${handle}?`}
                              description="Uploads using this token stop at once. Reports it already uploaded are kept."
                              confirmLabel="Revoke token"
                              destructive
                              onConfirm={() =>
                                run({ action: "revoke", id: entry.id })
                              }
                              trigger={
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  disabled={busy}
                                >
                                  Revoke
                                </Button>
                              }
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SeltTokenDialog
        token={created?.token ?? null}
        command={created?.command ?? ""}
        onClose={() => setCreated(null)}
      />
    </div>
  );
}
