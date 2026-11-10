import { AkanError } from "akanjs/base";

export type DocumentStoreErrorCode =
  | "invalidQuery"
  | "invalidSchema"
  | "invalidDocument"
  | "unstorableValue"
  | "tableMissing"
  | "searchUnavailable"
  | "searchMisconfigured";

export class DocumentStoreError extends AkanError<DocumentStoreErrorCode> {
  constructor(code: DocumentStoreErrorCode, message: string, options?: { cause?: unknown }) {
    super(code, message, { statusCode: code === "unstorableValue" ? 400 : 500, cause: options?.cause });
  }
}
