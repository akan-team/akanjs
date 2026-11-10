import { AkanError } from "akanjs/base";

export type SignalDeclarationErrorCode =
  | "handlerAlreadySet"
  | "nullableLastArg"
  | "liveAlreadySet"
  | "invalidArgType"
  | "invalidErrors"
  | "baseMismatch"
  | "missingModel"
  | "missingSlice";

export class SignalDeclarationError extends AkanError<SignalDeclarationErrorCode> {}
