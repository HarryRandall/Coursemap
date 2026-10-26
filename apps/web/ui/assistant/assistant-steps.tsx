import { Check, ChevronRight, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import styles from "./assistant-conversation.module.css";

type Step = { label: string; done: boolean };

function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-1.5 border-l border-border pl-3">
      {steps.map((step, index) => (
        <li key={index} className="flex items-center gap-2 text-xs">
          {step.done ? (
            <Check
              aria-hidden="true"
              className="size-3.5 shrink-0 text-success"
            />
          ) : (
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            />
          )}
          <span
            className={cn(step.done ? "text-muted-foreground" : styles.shimmer)}
          >
            {step.label}
            <span className="sr-only">
              {step.done ? ", done" : ", running"}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The lookups behind a reply. They stay open while Compass works and fold
 * into one line once the answer is written.
 */
export function AssistantSteps({
  steps,
  live,
}: {
  steps: Step[];
  live: boolean;
}) {
  if (!steps.length) return null;
  if (live) return <StepList steps={steps} />;
  if (steps.length === 1)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check aria-hidden="true" className="size-3.5 text-success" />
        {steps[0].label}
      </p>
    );
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md py-0.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none"
        />
        {steps.length === 1 ? steps[0].label : `Used ${steps.length} lookups`}
      </summary>
      <div className="mt-2">
        <StepList steps={steps} />
      </div>
    </details>
  );
}
