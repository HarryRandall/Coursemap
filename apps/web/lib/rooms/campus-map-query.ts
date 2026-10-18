const CAMPUS_MAP_QUERY_BATCH_SIZE = 75;

export function batchCampusMapQueryValues<T>(
  values: readonly T[],
  batchSize = CAMPUS_MAP_QUERY_BATCH_SIZE,
) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new RangeError(
      "Campus map query batch size must be a positive integer.",
    );
  }

  const batches: T[][] = [];
  for (let index = 0; index < values.length; index += batchSize) {
    batches.push(values.slice(index, index + batchSize));
  }
  return batches;
}

/** Two public streams can run together without flooding the database. */
export async function readCampusMapQueryBatches<T, U>(
  values: readonly T[],
  read: (batch: T[]) => PromiseLike<U>,
): Promise<U[]> {
  const batches = batchCampusMapQueryValues(values);
  const results: U[] = [];
  for (let index = 0; index < batches.length; index += 2) {
    results.push(
      ...(await Promise.all(batches.slice(index, index + 2).map(read))),
    );
  }
  return results;
}
