"use client";

import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import javascript from "highlight.js/lib/languages/javascript";
import css from "highlight.js/lib/languages/css";
import json from "highlight.js/lib/languages/json";
import styles from "./source-code.module.css";

hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("css", css);
hljs.registerLanguage("json", json);

export function SourceCode({
  content,
  kind,
  label,
}: {
  content: string;
  kind: string;
  label: string;
}) {
  const highlighted = useMemo(() => {
    let language = kind === "raw_html" ? "xml" : "markdown";
    if (kind === "model_input") {
      try {
        JSON.parse(content);
        language = "json";
      } catch {
        /* Model prompts use Markdown structure. */
      }
    }
    // The highlighter escapes source text, including HTML, before adding spans.
    return hljs.highlight(content, { language, ignoreIllegals: true }).value;
  }, [content, kind]);

  return (
    <pre aria-label={label} tabIndex={0} className={styles.source}>
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}
