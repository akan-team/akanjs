import { AkanError } from "akanjs/base";

export class StageFailedError extends AkanError<"stageFailed"> {
  readonly errors: Error[];

  constructor(message: string, errors: Error[]) {
    super("stageFailed", message);
    this.errors = errors;
  }
}
