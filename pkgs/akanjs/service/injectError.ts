import { AkanError } from "akanjs/base";

export type InjectErrorCode = "notRegistered" | "notInitialized" | "invalidInject";

export class InjectError extends AkanError<InjectErrorCode> {}
