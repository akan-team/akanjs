import { AkanError } from "akanjs/base";

/**
 * A `pick` or `get` that matched nothing, so a caller can tell a missing document from a failure. Callers match on
 * the message, which names the table and the id or query; the wire carries only the dictionary key, as a 404.
 */
export class NoDocumentError extends AkanError<"documentNotFound"> {
  readonly error = "base.error.documentNotFound";
  /** The table and id a by-id read missed; a query's miss leaves it unset. */
  readonly lookup?: { readonly refName: string; readonly id: string };

  constructor(message = "", options?: ErrorOptions & { lookup?: NoDocumentError["lookup"] }) {
    super("documentNotFound", message, { statusCode: 404, cause: options?.cause });
    this.lookup = options?.lookup;
  }

  override get forwarded() {
    return true;
  }

  override toJSON() {
    return { error: this.error, statusCode: this.statusCode };
  }
}
