import Link from "next/link";
import type { ReactNode } from "react";
import type {
  AssistantCourseReference,
  AssistantSociety,
} from "@/lib/assistant/attachments";
import { parseReply } from "@/lib/assistant/reply-format";
import type { ReplyInline } from "@/lib/assistant/reply-format";
import { AssistantCourseLink } from "./assistant-course-link";
import { AssistantSocietyLink } from "./assistant-society-link";

const LINK =
  "font-medium text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary";

type SocietyNames = {
  pattern: RegExp;
  byName: Map<string, AssistantSociety>;
};

/**
 * Matches the societies Compass found by their full names, longest first so
 * "ANU Computer Science Society" wins over a shorter name inside it.
 */
function societyNames(societies: AssistantSociety[]): SocietyNames | null {
  if (!societies.length) return null;
  const names = [...societies]
    .sort((left, right) => right.name.length - left.name.length)
    .map((society) => society.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"));
  return {
    pattern: new RegExp(`(${names.join("|")})`, "giu"),
    byName: new Map(
      societies.map((society) => [society.name.toLowerCase(), society]),
    ),
  };
}

function TextWithSocieties({
  text,
  societies,
}: {
  text: string;
  societies: SocietyNames | null;
}) {
  if (!societies) return text;
  return text.split(societies.pattern).map((part, index) => {
    const society =
      index % 2 ? societies.byName.get(part.toLowerCase()) : undefined;
    return society ? (
      <AssistantSocietyLink
        key={index}
        society={society}
        text={part}
        className={LINK}
      />
    ) : (
      part
    );
  });
}

function Inline({
  parts,
  courses,
  societies,
}: {
  parts: ReplyInline[];
  courses: Map<string, AssistantCourseReference>;
  societies: SocietyNames | null;
}) {
  return parts.map((part, index) => {
    if (part.kind === "text")
      return (
        <TextWithSocieties key={index} text={part.text} societies={societies} />
      );
    if (part.kind === "strong")
      return (
        <strong key={index} className="font-semibold">
          {part.text}
        </strong>
      );
    if (part.kind === "page")
      return (
        <Link key={index} href={part.href} className={LINK}>
          {part.text}
        </Link>
      );
    const course = courses.get(part.code);
    return course ? (
      <AssistantCourseLink key={index} course={course} className={LINK} />
    ) : (
      <Link key={index} href={`/courses?q=${part.code}`} className={LINK}>
        {part.code}
      </Link>
    );
  });
}

/**
 * A Compass reply as paragraphs and lists. Course codes link to the course
 * Compass looked up, or else to the course search, which finds the code in
 * whichever catalogue year publishes it. Societies Compass found and page
 * paths become links too.
 */
export function AssistantReplyText({
  text,
  courses = [],
  societies = [],
  trailing,
}: {
  text: string;
  courses?: AssistantCourseReference[];
  societies?: AssistantSociety[];
  /** Placed after the last word, such as a typing caret. */
  trailing?: ReactNode;
}) {
  const byCode = new Map(courses.map((course) => [course.code, course]));
  const names = societyNames(societies);
  const blocks = parseReply(text);
  return blocks.map((block, index) =>
    block.kind === "list" ? (
      (() => {
        const List = block.ordered ? "ol" : "ul";
        return (
          <List
            key={index}
            className={
              block.ordered
                ? "list-decimal space-y-1.5 pl-5 marker:text-muted-foreground"
                : "list-disc space-y-1.5 pl-5 marker:text-muted-foreground"
            }
          >
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className="pl-1">
                <Inline parts={item} courses={byCode} societies={names} />
                {index === blocks.length - 1 &&
                itemIndex === block.items.length - 1
                  ? trailing
                  : null}
              </li>
            ))}
          </List>
        );
      })()
    ) : (
      <p key={index}>
        {block.lines.map((line, lineIndex) => (
          <span key={lineIndex}>
            {lineIndex ? <br /> : null}
            <Inline parts={line} courses={byCode} societies={names} />
          </span>
        ))}
        {index === blocks.length - 1 ? trailing : null}
      </p>
    ),
  );
}
