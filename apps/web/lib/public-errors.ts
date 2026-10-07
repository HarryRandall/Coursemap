/** The SQLSTATE a PostgREST or postgres.js error carries, if any. */
function sqlState(error: unknown) {
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : null;
}

/**
 * Logs a failure server-side and returns copy that is safe to show whoever
 * caused it. Database messages can name tables, constraints and private
 * values, so the browser only sees copy chosen here: the message listed for
 * the error's SQLSTATE, or the fallback.
 */
export function publicErrorMessage(
  error: unknown,
  fallback: string,
  messagesBySqlState: Readonly<Record<string, string>> = {},
) {
  console.error(fallback, error);
  const code = sqlState(error);
  return (code && messagesBySqlState[code]) || fallback;
}
