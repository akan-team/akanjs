/**
 * A `pick` or a `get` that matched nothing. Typed so a caller can tell "you asked for something that is not
 * there" from "we broke" — an agent-facing transport in particular must not log a stack and answer "the server
 * failed" every time a model guesses an id.
 *
 * The message is unchanged from the bare `Error` this replaces, because callers already match on it, and the
 * `statusCode` does not reach the HTTP layer: `isExceptionLike` wants a `toJSON` too, so a missing document
 * stays a 500 there until someone decides framework-wide that it should be a 404.
 */
export class NoDocumentError extends Error {
  readonly statusCode = 404;
}
