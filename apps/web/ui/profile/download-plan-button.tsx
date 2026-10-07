"use client";
import { Download } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import { useCoursemap } from "@/app/providers";

/** Saves the student's profile, courses and choices as a JSON file. */
export function DownloadPlanButton() {
  const { state } = useCoursemap();
  const download = () => {
    const file = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `coursemap-plan-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button type="button" variant="outline" onClick={download}>
      <Download aria-hidden="true" />
      Download my data
    </Button>
  );
}
