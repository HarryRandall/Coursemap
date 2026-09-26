export type LayoutRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Lays values out largest first: the largest takes a full-height column on the
 * left (the two largest when there are four or more), and the rest stack in a
 * final column, largest on top. Widths and heights follow the values, so the
 * area reads as a treemap while smaller sections sit beneath each other rather
 * than becoming thin columns. Returns one rectangle per value, in input order.
 */
export function compositionLayout(
  values: readonly number[],
  width: number,
  height: number,
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

  let x = 0;
  columns.forEach((column) => {
    const columnTotal = column.reduce((sum, item) => sum + item.value, 0);
    const columnWidth = (columnTotal / total) * width;
    let y = 0;
    column.forEach((item) => {
      const itemHeight = (item.value / columnTotal) * height;
      rects[item.index] = { x, y, width: columnWidth, height: itemHeight };
      y += itemHeight;
    });
    x += columnWidth;
  });
  return rects;
}
