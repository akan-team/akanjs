import { AkanError } from "akanjs/base";

export type InsightQueryErrorCode = "invalidInsightQuery" | "insightTimeout" | "insightUnavailable";

export class InsightQueryError extends AkanError<InsightQueryErrorCode> {
  static readonly #statuses: Record<InsightQueryErrorCode, number> = {
    invalidInsightQuery: 400,
    insightTimeout: 504,
    insightUnavailable: 500,
  };

  constructor(code: InsightQueryErrorCode, message: string, options?: { cause?: unknown }) {
    super(code, message, { statusCode: InsightQueryError.#statuses[code], cause: options?.cause });
  }

  //? Security: a refusal and a timeout are fixed sentences or name only the author's own keywords and columns, never the
  //? driver's text, so they go out whole; an unavailable connection names roles and settings, so it goes out as its code.
  override get forwarded() {
    return this.code !== "insightUnavailable";
  }
}
