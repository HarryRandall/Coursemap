/**
 * An error whose message was written for the person who caused it, such as a
 * missing permission or a choice to correct. Routes show it as it is.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

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
 * Returns copy that is safe to show whoever caused a failure, and logs any
 * failure that was not written for them. Database messages can name tables,
 * constraints and private values, so the browser sees a `UserFacingError`'s
 * own message, the message listed for the error's SQLSTATE, the database's
 * message for a SQLSTATE the caller's functions only raise with authored
 * text, or the fallback.
 */
export function publicErrorMessage(
  error: unknown,
  fallback: string,
  {
    messages = {},
    authoredSqlStates = new Set<string>(),
  }: {
    messages?: Readonly<Record<string, string>>;
    authoredSqlStates?: ReadonlySet<string>;
  } = {},
) {
  if (error instanceof UserFacingError) return error.message;
  console.error(fallback, error);
  const code = sqlState(error);
  if (code && messages[code]) return messages[code];
  if (
    code &&
    authoredSqlStates.has(code) &&
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  )
    return error.message;
  return fallback;
}
