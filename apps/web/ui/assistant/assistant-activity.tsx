import { LoaderCircle } from "lucide-react";
import styles from "./assistant-conversation.module.css";

type Step = { label: string; done: boolean };

/**
 * What Compass is doing right now, as one line that changes in place: the
 * running lookup, then "Putting it together" once the lookups are done.
 */
export function AssistantActivity({ steps }: { steps: Step[] }) {
  const running = steps.findLast((step) => !step.done);
  const label = running
    ? running.label
    : steps.length
      ? "Putting it together"
      : "Thinking";
  return (
    <p
      role="status"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none"
      />
      {/* The fade runs on the wrapper; the shimmer owns the text's own
          animation, and one element cannot run both. */}
      <span
        key={label}
        className="duration-200 animate-in fade-in-0 motion-reduce:animate-none"
      >
        <span className={styles.shimmer}>{label}...</span>
      </span>
    </p>
  );
}
