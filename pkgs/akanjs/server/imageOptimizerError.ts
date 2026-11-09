import { AkanError } from "akanjs/base";

export class ImageOptimizerError extends AkanError {
  constructor(statusCode: number, message: string) {
    super(AkanError.codeOfStatus(statusCode), message, { statusCode });
  }
}
