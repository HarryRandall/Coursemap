"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { catalogueRecordFromReference } from "@/lib/catalogue/record-reference";
import { publicCatalogueRecordPath } from "@/lib/coursemap/catalogue-kinds";
import { CourseReferenceText } from "@/ui/courses/course-reference";

type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

const LIST_ITEM = /^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/u;
const HEADING = /^\s*#{1,6}\s+(.*)$/u;
const INLINE =
  /\*\*(.+?)\*\*|\*(\S(?:.*?\S)?)\*|\[([^\]]+)\]\(([^)\s]+)\)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/u;

/**
 * Splits imported Markdown into the blocks the model actually writes:
 * headings, paragraphs and flat lists. Lines within a paragraph are joined,
 * because ANU wraps prose at arbitrary points.
 */
function markdownBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const endParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  for (const line of markdown.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) {
      endParagraph();
      continue;
    }
    const heading = HEADING.exec(trimmed);
    if (heading) {
      endParagraph();
      blocks.push({ kind: "heading", text: heading[1] });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      endParagraph();
      const ordered = item[1] !== undefined;
      const previous = blocks.at(-1);
      if (previous?.kind === "list" && previous.ordered === ordered) {
        previous.items.push(item[2]);
      } else {
        blocks.push({ kind: "list", ordered, items: [item[2]] });
      }
      continue;
    }
    paragraph.push(trimmed);
  }
  endParagraph();
  return blocks;
}

function Inline({
  text,
  academicYear,
  availableCourseCodes,
}: {
  text: string;
  academicYear: number;
  availableCourseCodes: ReadonlySet<string>;
}) {
  const parts: ReactNode[] = [];
  let rest = text;
  let key = 0;
  const plain = (value: string) => {
    if (!value) return;
    parts.push(
      <CourseReferenceText
        key={key++}
        academicYear={academicYear}
        text={value}
        availableCourseCodes={availableCourseCodes}
      />,
    );
  };
  for (let match = INLINE.exec(rest); match; match = INLINE.exec(rest)) {
    plain(rest.slice(0, match.index));
    const [whole, bold, italic, linkText, linkTarget, email] = match;
    const inner = (value: string) => (
      <Inline
        text={value}
        academicYear={academicYear}
        availableCourseCodes={availableCourseCodes}
      />
    );
    if (bold !== undefined) {
      parts.push(<strong key={key++}>{inner(bold)}</strong>);
    } else if (italic !== undefined) {
      parts.push(<em key={key++}>{inner(italic)}</em>);
    } else if (linkText !== undefined && linkTarget !== undefined) {
      const record = catalogueRecordFromReference(linkTarget);
      if (record) {
        parts.push(
          <Link
            key={key++}
            href={publicCatalogueRecordPath(
              record.kind,
              academicYear,
              record.code,
            )}
            prefetch={false}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2"
          >
            {linkText}
          </Link>,
        );
      } else if (/^(?:https?:|mailto:)/u.test(linkTarget)) {
        parts.push(
          <a
            key={key++}
            href={linkTarget}
            target={linkTarget.startsWith("mailto:") ? undefined : "_blank"}
            rel="noopener noreferrer"
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2"
          >
            {linkText}
          </a>,
        );
      } else {
        plain(linkText);
      }
    } else if (email !== undefined) {
      parts.push(
        <a
          key={key++}
          href={`mailto:${email}`}
          className="font-medium text-primary underline decoration-primary/40 underline-offset-2"
        >
          {email}
        </a>,
      );
    }
    rest = rest.slice(match.index + whole.length);
  }
  plain(rest);
  return <>{parts}</>;
}

/**
 * Imported catalogue prose, rendered from the small Markdown vocabulary the
 * model writes. Record links and course codes open in Coursemap, other links
 * leave for the page they name, and nothing is ever rendered as raw HTML.
 */
export function CatalogueMarkdown({
  markdown,
  academicYear,
  availableCourseCodes,
}: {
  markdown: string;
  academicYear: number;
  availableCourseCodes: ReadonlySet<string>;
}) {
  const inline = (text: string) => (
    <Inline
      text={text}
      academicYear={academicYear}
      availableCourseCodes={availableCourseCodes}
    />
  );
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground/80">
      {markdownBlocks(markdown).map((block, index) => {
        if (block.kind === "heading") {
          return (
            <h3
              key={index}
              className="pt-1 text-sm font-semibold text-foreground"
            >
              {inline(block.text)}
            </h3>
          );
        }
        if (block.kind === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={index}
              className={
                block.ordered
                  ? "list-decimal space-y-1.5 pl-5"
                  : "list-disc space-y-1.5 pl-5"
              }
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{inline(item)}</li>
              ))}
            </List>
          );
        }
        return <p key={index}>{inline(block.text)}</p>;
      })}
    </div>
  );
}
