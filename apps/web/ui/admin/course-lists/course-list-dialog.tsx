"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@coursemap/ui/primitives/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@coursemap/ui/primitives/dialog";
import { Input } from "@coursemap/ui/primitives/input";
import { Label } from "@coursemap/ui/primitives/label";
import { Textarea } from "@coursemap/ui/primitives/textarea";
import {
  fetchCourseListCodesAction,
  saveCourseListAction,
} from "@/lib/admin/course-lists-actions";
import type {
  AdminCourseList,
  CourseListSuggestion,
  CourseListTemplate,
} from "@/lib/catalogue/course-lists";
import { showToast } from "@/ui/common/toast";

/**
 * Creates or edits a list's draft. Codes can be typed, pasted from any page
 * or read from the source link; saving never publishes. A new list can start
 * from a suggestion, such as the same list in an earlier year.
 */
export function CourseListDialog({
  initial,
  list,
  suggestions = [],
  trigger,
  year,
}: {
  initial?: CourseListTemplate;
  list?: AdminCourseList;
  suggestions?: CourseListSuggestion[];
  trigger: ReactNode;
  year: number;
}) {
  const id = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [codesText, setCodesText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"fetch" | "save" | null>(null);

  function changeOpen(next: boolean) {
    if (next) {
      fill(
        list
          ? {
              name: list.name,
              sourceUrl: list.sourceUrl,
              codes: list.draftCodes,
            }
          : (initial ?? { name: "", sourceUrl: null, codes: [] }),
      );
      setError(null);
    }
    setOpen(next);
  }

  function fill(template: CourseListTemplate) {
    setName(template.name);
    setSourceUrl(template.sourceUrl ?? "");
    setCodesText(template.codes.join("\n"));
  }

  async function fetchCodes() {
    setPending("fetch");
    setError(null);
    try {
      const result = await fetchCourseListCodesAction(sourceUrl);
      if (!result.ok || !result.codes) {
        setError(result.message);
        return;
      }
      setCodesText(result.codes.join("\n"));
      showToast(`${result.message} Review them, then save.`);
    } catch {
      setError("The source page could not be fetched. Try again.");
    } finally {
      setPending(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("save");
    setError(null);
    try {
      const result = await saveCourseListAction(year, {
        id: list?.id,
        name,
        sourceUrl,
        codesText,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      showToast(result.message);
      setOpen(false);
      router.refresh();
    } catch {
      setError("The course list could not be saved. Try again.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog onOpenChange={changeOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form className="grid gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>
              {list ? `Edit ${list.name}` : `New course list for ${year}`}
            </DialogTitle>
            <DialogDescription>
              Colleges publish lists such as elective lists on their own sites.
              Degree rules count the list as a tag with this exact name.
            </DialogDescription>
          </DialogHeader>
          {!list && suggestions.length > 0 ? (
            <div className="grid gap-1.5">
              <p className="text-sm font-medium">Start from</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion.label}
                    onClick={() => fill(suggestion.template)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {suggestion.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              autoFocus
              id={`${id}-name`}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-source`}>Source link</Label>
            <div className="flex gap-2">
              <Input
                id={`${id}-source`}
                inputMode="url"
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://"
                type="url"
                value={sourceUrl}
              />
              <Button
                disabled={!sourceUrl.trim() || pending !== null}
                onClick={fetchCodes}
                type="button"
                variant="outline"
              >
                <Download aria-hidden="true" size={15} />
                {pending === "fetch" ? "Reading" : "Read codes"}
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-codes`}>Courses</Label>
            <Textarea
              className="min-h-40 font-mono text-sm"
              id={`${id}-codes`}
              onChange={(event) => setCodesText(event.target.value)}
              placeholder="Paste course codes or the list's page text"
              value={codesText}
            />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={pending !== null} type="submit">
              {pending === "save" ? "Saving" : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
