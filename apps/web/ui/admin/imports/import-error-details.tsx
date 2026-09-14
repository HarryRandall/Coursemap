import { CircleAlert } from "lucide-react";

export function ImportErrorDetails({ message }: { message: string }) {
  return (
    <details className="group w-full min-w-0 text-sm">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded text-xs font-medium text-destructive focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <CircleAlert className="size-4" aria-hidden="true" />
        <span className="group-open:hidden">Show error</span>
        <span className="hidden group-open:inline">Hide error</span>
      </summary>
      <p className="mt-2 w-full rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs break-words whitespace-normal text-foreground">
        {message}
      </p>
    </details>
  );
}
