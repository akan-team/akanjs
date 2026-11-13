import { AkanError } from "akanjs/base";

export type RemoteErrorCode =
  | "remoteUrlRejected"
  | "remoteUnauthorized"
  | "remoteUnavailable"
  | "remoteTooLarge"
  | "remoteProtocol"
  | "remoteOAuth";

export class RemoteError extends AkanError<RemoteErrorCode, { challenge?: string; status?: number }> {
  constructor(code: RemoteErrorCode, message: string, data?: { challenge?: string; status?: number }) {
    super(code, message, { statusCode: code === "remoteUnauthorized" ? 401 : 502, ...(data ? { data } : {}) });
    this.name = "RemoteError";
  }
}
