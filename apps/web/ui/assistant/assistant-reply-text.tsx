import Link from "next/link";
import type { ReactNode } from "react";
import type { AssistantCourseReference } from "@/lib/assistant/attachments";
import { parseReply } from "@/lib/assistant/reply-format";
import type { ReplyInline } from "@/lib/assistant/reply-format";
import { AssistantCourseLink } from "./assistant-course-link";

const LINK =
  "font-medium text-primary underline decoration-primary/30 underline-offset-2 transition-colors hover:decoration-primary";

function Inline({
  parts,
  courses,
}: {
  parts: ReplyInline[];
  courses: Map<string, AssistantCourseReference>;
}) {
  return parts.map((part, index) => {
    if (part.kind === "text") return part.text;
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
 * whichever catalogue year publishes it. Page paths become page links.
 */
export function AssistantReplyText({
  text,
  courses = [],
  trailing,
}: {
  text: string;
  courses?: AssistantCourseReference[];
  /** Placed after the last word, such as a typing caret. */
  trailing?: ReactNode;
}) {
  const byCode = new Map(courses.map((course) => [course.code, course]));
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
                <Inline parts={item} courses={byCode} />
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
            <Inline parts={line} courses={byCode} />
          </span>
        ))}
        {index === blocks.length - 1 ? trailing : null}
      </p>
    ),
  );
}
