import { AkanError } from "akanjs/base";

/**
 * A `pick` or `get` that matched nothing, so a caller can tell a missing document from a failure. Callers match on
 * the message, which names the table and the id or query; the wire carries only the dictionary key, as a 404.
 */
export class NoDocumentError extends AkanError<"documentNotFound"> {
  readonly error = "base.error.documentNotFound";

  constructor(message = "", options?: ErrorOptions) {
    super("documentNotFound", message, { statusCode: 404, cause: options?.cause });
  }

  override get forwarded() {
    return true;
  }

  override toJSON() {
    return { error: this.error, statusCode: this.statusCode };
  }
}
