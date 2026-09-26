export type DiffPart = { text: string; changed: boolean };

export type DiffLine = {
  kind: "same" | "removed" | "added";
  text: string;
  /** For a removed or added line paired with its counterpart, what changed. */
  parts: DiffPart[] | null;
};

type Op<T> = { kind: DiffLine["kind"]; value: T };

/** The shortest edit from one sequence to another, by longest common subsequence. */
function editScript<T>(before: readonly T[], after: readonly T[]): Op<T>[] {
  const rows = before.length;
  const columns = after.length;
  const lengths = Array.from({ length: rows + 1 }, () =>
    new Array<number>(columns + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = columns - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        before[i] === after[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const ops: Op<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < columns) {
    if (before[i] === after[j]) {
      ops.push({ kind: "same", value: before[i]! });
      i += 1;
      j += 1;
    } else if (lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      ops.push({ kind: "removed", value: before[i]! });
      i += 1;
    } else {
      ops.push({ kind: "added", value: after[j]! });
      j += 1;
    }
  }
  for (; i < rows; i += 1) ops.push({ kind: "removed", value: before[i]! });
  for (; j < columns; j += 1) ops.push({ kind: "added", value: after[j]! });
  return ops;
}

/** Words and the space between them, so a rejoined line reads as it was. */
function tokens(text: string) {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

function parts(ops: Op<string>[], side: "removed" | "added"): DiffPart[] {
  const merged: DiffPart[] = [];
  for (const op of ops) {
    if (op.kind !== "same" && op.kind !== side) continue;
    const changed = op.kind === side;
    const last = merged.at(-1);
    if (last && last.changed === changed) last.text += op.value;
    else merged.push({ text: op.value, changed });
  }
  // A lone space kept between two changes reads as one change, not two.
  return merged.reduce<DiffPart[]>((joined, part, at) => {
    const last = joined.at(-1);
    const next = merged[at + 1];
    const bridge =
      !part.changed &&
      part.text.trim() === "" &&
      last?.changed &&
      next?.changed;
    if (last && (bridge || (last.changed && part.changed))) {
      last.text += part.text;
      last.changed = true;
    } else {
      joined.push({ ...part });
    }
    return joined;
  }, []);
}

/**
 * A line diff in the manner of git: unchanged lines as context, removals
 * before additions, and where a removed line is replaced one for one, the
 * words that changed within it.
 */
export function diffLines(
  before: readonly string[],
  after: readonly string[],
): DiffLine[] {
  const ops = editScript(before, after);
  const lines: DiffLine[] = [];
  let index = 0;
  while (index < ops.length) {
    if (ops[index]!.kind === "same") {
      lines.push({ kind: "same", text: ops[index]!.value, parts: null });
      index += 1;
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    while (index < ops.length && ops[index]!.kind !== "same") {
      const op = ops[index]!;
      (op.kind === "removed" ? removed : added).push(op.value);
      index += 1;
    }
    const paired = removed.length === added.length;
    const words = paired
      ? removed.map((line, at) => editScript(tokens(line), tokens(added[at]!)))
      : [];
    removed.forEach((text, at) =>
      lines.push({
        kind: "removed",
        text,
        parts: paired ? parts(words[at]!, "removed") : null,
      }),
    );
    added.forEach((text, at) =>
      lines.push({
        kind: "added",
        text,
        parts: paired ? parts(words[at]!, "added") : null,
      }),
    );
  }
  return lines;
}
