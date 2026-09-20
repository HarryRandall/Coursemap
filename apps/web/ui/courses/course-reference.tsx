"use client";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { Hint } from "@/ui/common/hint";

export function CourseReferenceText({
  academicYear,
  text,
  availableCourseCodes,
}: {
  academicYear: number;
  text: string;
  availableCourseCodes: ReadonlySet<string>;
}) {
  return text.split(/([A-Z]{4}\d{4}[A-Z]?)/gu).map((part, index) => {
    if (!/^[A-Z]{4}\d{4}[A-Z]?$/u.test(part)) {
      return <span key={index}>{part}</span>;
    }
    if (availableCourseCodes.has(part)) {
      return (
        <Link
          key={index}
          href={`/courses/${part}?year=${academicYear}`}
          prefetch={false}
          className="rounded font-mono font-semibold text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary"
        >
          {part}
        </Link>
      );
    }
    return (
      <Hint key={index} label={`${part}: course details unavailable`}>
        <span className="inline-flex items-center gap-1 rounded bg-muted px-1 font-mono font-semibold text-muted-foreground">
          <LockKeyhole size={10} aria-hidden="true" />
          {part}
          <span className="sr-only">Course details unavailable</span>
        </span>
      </Hint>
    );
  });
}
