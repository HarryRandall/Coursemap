import { Button } from "@coursemap/ui/primitives/button";
import ReuiLink from "next/link";
import type { ReactNode } from "react";

import { CatalogueIllustration } from "@/ui/common/catalogue-illustration";
import { ErrorIllustration } from "@/ui/common/error-illustration";

export function CatalogueEmpty({
  title,
  description,
  filtered = false,
  error = false,
  clearHref,
  onSync,
  children,
}: {
  title: string;
  description: string;
  filtered?: boolean;
  error?: boolean;
  clearHref?: string;
  onSync?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto rounded-xl border-2 border-dotted border-border bg-card px-5 py-8 text-center">
      {error ? <ErrorIllustration kind="server" /> : <CatalogueIllustration />}
      <h2 className="text-lg font-semibold">
        {filtered ? "No matches this time." : title}
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        {filtered ? "Try another search or clear your filters." : description}
      </p>
      {filtered && clearHref ? (
        <Button asChild variant="outline">
          <ReuiLink href={clearHref}>Clear filters</ReuiLink>
        </Button>
      ) : onSync ? (
        <Button onClick={onSync} variant="outline" type="button">
          Run sync now
        </Button>
      ) : (
        children
      )}
    </div>
  );
}
