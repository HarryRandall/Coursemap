"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@coursemap/ui/primitives/button";

export function CatalogueImportButton({
  kind = "course",
  code,
  year,
  disabled,
  onStarted,
  label = "Import from ANU",
}: {
  kind?: "course" | "programme" | "major" | "minor" | "specialisation";
  code: string;
  year: number;
  disabled?: boolean;
  onStarted?: () => void;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  async function start() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    try {
      const response = await fetch(
        kind === "course"
          ? "/api/admin/course-imports"
          : "/api/admin/academic-structure-imports",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "course"
              ? { academicYear: year, courseCodes: [code] }
              : {
                  academicYear: year,
                  structureKind: kind,
                  structureCodes: [code],
                },
          ),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "The import could not be started.");
      toast.success(`${code} was queued for import.`);
      if (onStarted) onStarted();
      else router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The import could not be started.",
      );
      router.refresh();
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled || pending}
      onClick={() => void start()}
    >
      {pending ? (
        <LoaderCircle
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ) : (
        <Download className="size-4" aria-hidden="true" />
      )}
      {pending ? "Starting import..." : label}
    </Button>
  );
}
