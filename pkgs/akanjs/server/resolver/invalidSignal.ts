import { AkanError } from "akanjs/base";

export const invalidSignal = (message: string) => {
  const error = new AkanError("invalidSignal", message);
  Error.captureStackTrace(error, invalidSignal);
  return error;
};
