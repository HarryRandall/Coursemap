import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { CircleAlert, TriangleAlert } from "lucide-react";
import type { ReviewNote } from "@/lib/catalogue/review-notes";

/**
 * What the model said about one change, shown on its card so it is cleared
 * with the decision rather than left standing at the top of the tab.
 */
export function CardNotes({ notes }: { notes: readonly ReviewNote[] }) {
  if (!notes.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1 text-sm">
      {notes.map((note, index) => (
        <li
          key={`${note.fieldPath ?? "record"}-${index}`}
          className="flex gap-2 text-warning-foreground dark:text-warning"
        >
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <span>{note.message}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Parts of the latest ANU check the model could not read, which have no
 * change of their own to carry the note. They clear on the next check.
 */
export function UnreadParts({ errors }: { errors: readonly ReviewNote[] }) {
  if (!errors.length) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>
        {errors.length === 1
          ? "1 part could not be read and was left empty"
          : `${errors.length} parts could not be read and were left empty`}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 flex flex-col gap-1.5">
          {errors.map((note, index) => (
            <li key={`${note.fieldPath ?? "record"}-${index}`}>
              <span className="font-medium text-foreground">{note.label}:</span>{" "}
              {note.message}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
