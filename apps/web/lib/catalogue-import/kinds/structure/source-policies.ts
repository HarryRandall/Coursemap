/** Separate explicit enrolment and grading policies, retaining every word for display. */
export function separateStructurePolicies(text: string) {
  const paragraphs = text.split(/\n\s*\n/u);
  const preamble =
    /^(?:Courses marked with an asterisk \(\*\)|\*Asterisked courses) have 1000-level prerequisites which must be selected in the first year of study and will contribute towards satisfying the 1000-level course requirements of the Bachelor of Science or Bachelor of Science \(Advanced\) \(Honours\)\.$/u;
  let prerequisiteMarkers = false;
  const prerequisiteAdvice: string[] = [];
  if (preamble.test(paragraphs[0] ?? "")) {
    const rootIndex = paragraphs.findIndex((paragraph) =>
      /^(?:This|The) .+requires the completion of /u.test(paragraph),
    );
    const before = paragraphs.slice(1, rootIndex);
    if (
      rootIndex > 1 &&
      before.every(
        (paragraph) =>
          paragraph ===
            "The courses listed below will cover most 1000-level requirements for 2000-3000-level courses listed in this major." ||
          paragraph
            .split("\n")
            .every((line) =>
              /^- [A-Z]{4}1\d{3}\b.+\(prerequisite for [^\n]+\)$/u.test(line),
            ),
      )
    ) {
      prerequisiteMarkers = true;
      prerequisiteAdvice.push(...paragraphs.splice(0, rootIndex));
    }
  }
  const requirements: string[] = [];
  const policies: string[] = [...prerequisiteAdvice];
  let policyList = false;
  for (const paragraph of paragraphs) {
    const policy =
      /^This (?:major|minor|specialisation)s? (?:(?:may|can|must) (?:only )?be (?:taken|undertaken) in conjunction with [^\n]+|is incompatible with [^\n]+|is only available to students [^\n]+)$/iu.test(
        paragraph,
      );
    const grading =
      /^HONS\d{4} Final Honours\s*Grade\b[\s\S]*will be used to calculate the Class of Honours/iu.test(
        paragraph,
      );
    if (
      policy ||
      grading ||
      (policyList && /^(?:- [^\n]+\n?)+$/u.test(paragraph))
    ) {
      policies.push(paragraph);
      policyList = policy ? /[:@]$/u.test(paragraph) : policyList && !grading;
    } else {
      policyList = false;
      requirements.push(paragraph);
    }
  }
  return {
    requirements: requirements.join("\n\n"),
    policies,
    prerequisiteMarkers,
  };
}
