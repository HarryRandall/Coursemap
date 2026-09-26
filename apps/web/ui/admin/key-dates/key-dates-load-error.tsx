import { CircleAlert } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@coursemap/ui/components/alert";

export function KeyDatesLoadError({ year }: { year: number }) {
  return (
    <Alert role="alert" variant="warning">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>Key dates could not be loaded</AlertTitle>
      <AlertDescription>
        The calendar data for {year} is unavailable. Reload the page to try
        again.
      </AlertDescription>
    </Alert>
  );
}
