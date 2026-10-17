/**
 * A `pick` or `get` that matched nothing, so a caller can tell a missing document from a failure. Callers match on
 * the message, which names the table and the id or query; the wire carries only the dictionary key, as a 404.
 */
export class NoDocumentError extends Error {
  readonly statusCode = 404;

  toJSON() {
    return { error: "base.error.documentNotFound", statusCode: this.statusCode };
  }
}
