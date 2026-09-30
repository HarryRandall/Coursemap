"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { copyPreviousCourseListsAction } from "@/lib/admin/course-lists-actions";
import { showToast } from "@/ui/common/toast";

export function CopyCourseListsButton({
  count,
  fromYear,
  year,
}: {
  count: number;
  fromYear: number;
  year: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function copy() {
    setPending(true);
    try {
      const result = await copyPreviousCourseListsAction(year);
      showToast(result.message);
      if (result.ok) router.refresh();
    } catch {
      showToast("The earlier lists could not be copied. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button disabled={pending} onClick={copy} type="button" variant="outline">
      <Copy aria-hidden="true" size={15} />
      {pending
        ? "Copying"
        : `Copy ${count} ${count === 1 ? "list" : "lists"} from ${fromYear}`}
    </Button>
  );
}
