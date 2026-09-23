import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";
import { Badge } from "@coursemap/ui/components/badge";
import { CircleAlert, Gauge, TriangleAlert } from "lucide-react";
import type { ReviewNote, UncertainField } from "@/lib/catalogue/review-notes";

function NoteList({ notes }: { notes: readonly ReviewNote[] }) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {notes.map((note, index) => (
        <li key={`${note.fieldPath ?? "record"}-${index}`}>
          <span className="font-medium text-foreground">{note.label}:</span>{" "}
          {note.message}
        </li>
      ))}
    </ul>
  );
}

function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * What the model flagged on the latest ANU check, and the fields it was least
 * sure of. Review is the only check on a model-owned sync, so this leads the
 * Changes tab: it says where to look before any change is accepted. Nothing
 * is shown when the model flagged nothing.
 */
export function ModelNotes({
  errors,
  warnings,
  uncertain,
}: {
  errors: readonly ReviewNote[];
  warnings: readonly ReviewNote[];
  uncertain: readonly UncertainField[];
}) {
  if (!errors.length && !warnings.length && !uncertain.length) return null;
  return (
    <section
      aria-labelledby="model-notes-heading"
      className="flex flex-col gap-3"
    >
      <h2
        id="model-notes-heading"
        className="text-sm font-semibold tracking-wide uppercase"
      >
        What to check
      </h2>
      {errors.length ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>
            {plural(errors.length, "part", "parts")} could not be read and{" "}
            {errors.length === 1 ? "was" : "were"} left empty
          </AlertTitle>
          <AlertDescription>
            <NoteList notes={errors} />
          </AlertDescription>
        </Alert>
      ) : null}
      {warnings.length ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>
            {plural(warnings.length, "thing", "things")} to compare with the ANU
            page
          </AlertTitle>
          <AlertDescription>
            <NoteList notes={warnings} />
          </AlertDescription>
        </Alert>
      ) : null}
      {uncertain.length ? (
        <Alert>
          <Gauge aria-hidden="true" />
          <AlertTitle>Least certain fields</AlertTitle>
          <AlertDescription>
            <ul className="mt-2 flex flex-col gap-2">
              {uncertain.map((field) => (
                <li key={field.fieldPath} className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {field.label}
                    </span>
                    <Badge variant="warning-light">
                      {Math.round(field.confidence * 100)}% sure
                    </Badge>
                  </span>
                  {field.excerpt ? (
                    <q className="text-xs text-muted-foreground">
                      {field.excerpt}
                    </q>
                  ) : null}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
