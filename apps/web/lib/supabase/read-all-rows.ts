import type { PostgrestError } from "@supabase/supabase-js";

/** Matches `max_rows` in `supabase/config.toml`; a shorter page ends the read. */
const ROW_PAGE_SIZE = 1000;

/**
 * Identifier lists travel in the query string, and the database gateway
 * rejects long URLs, so `.in()` filters are split into batches of this size.
 */
const IDENTIFIER_BATCH_SIZE = 200;

type PageResult<Row> = PromiseLike<{
  data: Row[] | null;
  error: PostgrestError | null;
}>;

/** Reads every page of a query. `readPage` must apply a stable `order`. */
export async function readAllRows<Row>(
  readPage: (from: number, to: number) => PageResult<Row>,
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += ROW_PAGE_SIZE) {
    const { data, error } = await readPage(from, from + ROW_PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < ROW_PAGE_SIZE) return { data: rows, error: null };
  }
}

/** Reads every row matching an identifier list, in batches and pages. */
export async function readRowsForIds<Id, Row>(
  ids: readonly Id[],
  readPage: (batch: Id[], from: number, to: number) => PageResult<Row>,
) {
  const batches: Id[][] = [];
  for (let index = 0; index < ids.length; index += IDENTIFIER_BATCH_SIZE) {
    batches.push(ids.slice(index, index + IDENTIFIER_BATCH_SIZE));
  }
  const results = await Promise.all(
    batches.map((batch) =>
      readAllRows((from, to) => readPage(batch, from, to)),
    ),
  );
  const error = results.find((result) => result.error)?.error ?? null;
  return { data: results.flatMap((result) => result.data), error };
}
