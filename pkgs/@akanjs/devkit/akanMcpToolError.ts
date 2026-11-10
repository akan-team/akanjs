import { AkanError } from "akanjs/base";
import type { McpFailure } from "akanjs/common";

export type AkanMcpToolErrorCode = "invalidArgument" | "toolUnavailable" | "unknownTool";

export class AkanMcpToolError extends AkanError<AkanMcpToolErrorCode> {
  constructor(code: AkanMcpToolErrorCode, message: string) {
    super(code, message, { statusCode: 400 });
  }

  static failureOf(error: unknown): McpFailure {
    return AkanError.is(error)
      ? { code: error.code, statusCode: error.statusCode }
      : { code: "toolFailed", statusCode: 500 };
  }
}
