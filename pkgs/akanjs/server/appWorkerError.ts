import { AkanError } from "akanjs/base";

export type AppWorkerErrorCode = "workerNotDeclared" | "workerNotConnected";

export class AppWorkerError extends AkanError<AppWorkerErrorCode> {}
