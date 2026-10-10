import { Button } from "@coursemap/ui/primitives/button";

export function CourseSurveyError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4">
      <p role="alert" className="text-sm text-destructive">
        Student survey results could not be loaded.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
