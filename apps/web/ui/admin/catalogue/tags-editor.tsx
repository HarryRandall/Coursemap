"use client";

import { Button } from "@coursemap/ui/primitives/button";
import { Input } from "@coursemap/ui/primitives/input";
import { Plus, X } from "lucide-react";
import { useId, useState } from "react";

type Tag = { position: number; name: string };

/**
 * A course's tags as removable chips with a field to add one. A tag is one
 * category however it is capitalised, so adding a differently cased repeat
 * does nothing rather than splitting the category in two.
 */
export function TagsEditor({
  tags,
  readOnly,
  onChange,
}: {
  tags: readonly Tag[];
  readOnly: boolean;
  onChange: (tags: Tag[]) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const renumber = (names: string[]) =>
    names.map((name, index) => ({ position: index + 1, name }));

  function add() {
    const name = draft.replace(/\s+/gu, " ").trim();
    if (!name) return;
    setDraft("");
    if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
      return;
    }
    onChange(renumber([...tags.map((tag) => tag.name), name]));
  }

  return (
    <div className="flex flex-col gap-3">
      {tags.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {tags.map((tag) => (
            <li
              key={tag.name}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card py-0.5 pr-1 pl-2 text-xs font-medium"
            >
              {tag.name}
              {readOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove tag ${tag.name}`}
                  onClick={() =>
                    onChange(
                      renumber(
                        tags
                          .filter((other) => other.name !== tag.name)
                          .map((other) => other.name),
                      ),
                    )
                  }
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No tags recorded.</p>
      )}
      {readOnly ? null : (
        <form
          className="flex max-w-sm items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            New tag
          </label>
          <Input
            id={inputId}
            value={draft}
            maxLength={60}
            placeholder="Add a tag, such as Science"
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="outline" disabled={!draft.trim()}>
            <Plus aria-hidden="true" />
            Add
          </Button>
        </form>
      )}
    </div>
  );
}
