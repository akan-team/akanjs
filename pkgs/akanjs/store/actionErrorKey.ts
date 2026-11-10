import { isRecord } from "akanjs/common";

export const actionErrorKey = (error: unknown) => {
  if (typeof error === "string") return error;
  if (!isRecord(error)) return String(error);
  if (typeof error.error === "string") return error.error;
  if (typeof error.message === "string") return error.message;
  return String(error);
};
