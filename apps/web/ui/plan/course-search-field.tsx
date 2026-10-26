"use client";
import { Search, X } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@coursemap/ui/primitives/input-group";

/** A compact search box for the courses one rule accepts. */
export function CourseSearchField({
  label,
  value,
  onChange,
}: {
  /** What is being searched, read to screen readers, such as "Search Electives". */
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <InputGroup className="h-8">
      <InputGroupAddon>
        <Search aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={label}
        placeholder="Search courses"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-[13px]"
      />
      {value ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label="Clear search"
            onClick={() => onChange("")}
          >
            <X aria-hidden="true" />
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
