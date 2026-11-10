import { AkanError } from "akanjs/base";

export type PromptErrorCode = "invalidPrompt" | "unmaskedResource" | "inlineFailed";

export class PromptError extends AkanError<PromptErrorCode> {
  constructor(code: PromptErrorCode, message: string) {
    super(code, message, { statusCode: code === "inlineFailed" ? 502 : 500 });
  }
}
