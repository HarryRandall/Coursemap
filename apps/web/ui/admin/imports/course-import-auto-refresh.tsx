"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

export function CourseImportAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!active || pending) return;
    const timeout = window.setTimeout(() => {
      startTransition(() => router.refresh());
    }, 3_000);
    return () => window.clearTimeout(timeout);
  }, [active, pending, router]);

  return null;
}
