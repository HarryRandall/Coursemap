export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Each value's share of the total, raised to at least `minimum` where the
 * values allow it, with the rest scaled down to keep the sum at one.
 */
function shares(values: readonly number[], minimum: number) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return values.map(() => 0);
  if (minimum * values.length >= 1) return values.map(() => 1 / values.length);
  const result = values.map((value) => value / total);
  // Raising one share shrinks the others, which can push another below the
  // minimum, so repeat until every small share is settled.
  const fixed = new Set<number>();
  for (;;) {
    const small = result.findIndex(
      (share, index) => !fixed.has(index) && share < minimum,
    );
    if (small === -1) return result;
    fixed.add(small);
    const free = result.reduce(
      (sum, share, index) => (fixed.has(index) ? sum : sum + share),
      0,
    );
    const room = 1 - fixed.size * minimum;
    result.forEach((share, index) => {
      result[index] = fixed.has(index) ? minimum : (share / free) * room;
    });
  }
}

/**
 * Lays values out largest first: the largest takes a full-height column on the
 * left (the two largest when there are four or more), and the rest stack in a
 * final column, largest on top. Widths and heights follow the values, so the
 * area reads as a treemap while smaller sections sit beneath each other rather
 * than becoming thin columns. `minimumShare` keeps every column and stacked
 * block at least that fraction of the width or height, so a small section is
 * still large enough to label. Returns one rectangle per value, in input order.
 */
export function compositionLayout(
  values: readonly number[],
  width: number,
  height: number,
  minimumShare = 0,
): LayoutRect[] {
  const rects: LayoutRect[] = values.map(() => ({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  }));
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return rects;
  const order = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => b.value - a.value || a.index - b.index);
  const solo = order.length >= 4 ? 2 : Math.min(1, order.length - 1);
  const columns = [
    ...order.slice(0, solo).map((item) => [item]),
    order.slice(solo),
  ].filter((column) => column.length > 0);

  const columnShares = shares(
    columns.map((column) => column.reduce((sum, item) => sum + item.value, 0)),
    minimumShare,
  );
  let x = 0;
  columns.forEach((column, columnIndex) => {
    const columnWidth = columnShares[columnIndex] * width;
    const itemShares = shares(
      column.map((item) => item.value),
      minimumShare,
    );
    let y = 0;
    column.forEach((item, itemIndex) => {
      const itemHeight = itemShares[itemIndex] * height;
      rects[item.index] = { x, y, width: columnWidth, height: itemHeight };
      y += itemHeight;
    });
    x += columnWidth;
  });
  return rects;
}
