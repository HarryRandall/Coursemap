"use client";

import { PublicRecordError } from "@/ui/catalogue/public-record-error";

export default function Error({ reset }: { reset: () => void }) {
  return <PublicRecordError kind="course" onRetry={reset} />;
}
