const PUBLIC_READ_BATCH_SIZE = 100;
const DETAIL_READ_BATCH_SIZE = 4;

/** Bounds code visibility checks, which run catalogue access policies per row. */
export async function readPublishedCodeBatches<T>(
  ids: readonly number[],
  read: (batch: number[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += PUBLIC_READ_BATCH_SIZE) {
    const { data, error } = await read(
      ids.slice(start, start + PUBLIC_READ_BATCH_SIZE),
    );
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

/** A cold plan can request many projections, each including a requisite graph. */
export async function readPublishedDetailBatches<T, U>(
  selections: readonly T[],
  read: (selection: T) => Promise<U>,
): Promise<U[]> {
  const rows: U[] = [];
  for (
    let start = 0;
    start < selections.length;
    start += DETAIL_READ_BATCH_SIZE
  ) {
    rows.push(
      ...(await Promise.all(
        selections.slice(start, start + DETAIL_READ_BATCH_SIZE).map(read),
      )),
    );
  }
  return rows;
}
