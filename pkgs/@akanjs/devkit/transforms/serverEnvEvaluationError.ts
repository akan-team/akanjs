export type ServerEnvEvaluationFailure = "threw" | "exited" | "timedOut";

export class ServerEnvEvaluationError extends Error {
  constructor(
    readonly reason: ServerEnvEvaluationFailure,
    message: string,
  ) {
    super(message);
    this.name = "ServerEnvEvaluationError";
  }
}
