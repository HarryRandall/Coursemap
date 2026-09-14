import { ExternalLink } from "lucide-react";

export function CourseSourceEvidence({
  texts,
  sourceUrl,
}: {
  texts: string[];
  sourceUrl?: string | null;
}) {
  const excerpts = [
    ...new Set(texts.map((text) => text.trim()).filter(Boolean)),
  ];
  if (!excerpts.length && !sourceUrl) return null;
  return (
    <details className="border-t border-border/60 px-5 py-3 sm:px-6">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
        Source evidence
      </summary>
      <div className="mt-3 space-y-3 border-l-2 border-primary/20 pl-4">
        {excerpts.map((text, index) => (
          <p
            key={index}
            className="text-sm leading-6 break-words whitespace-pre-wrap"
          >
            {text}
          </p>
        ))}
        {sourceUrl ? (
          <a
            className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            View ANU page <ExternalLink className="size-3" aria-hidden="true" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    </details>
  );
}
