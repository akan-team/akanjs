import { AkanError } from "akanjs/base";

export type SignalContractErrorCode =
  | "undefinedReturn"
  | "bytesThroughAny"
  | "wrongTransport"
  | "notRegistered"
  | "noHandler";

export class SignalContractError extends AkanError<SignalContractErrorCode> {}
