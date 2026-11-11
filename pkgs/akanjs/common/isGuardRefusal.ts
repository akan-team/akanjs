import { AkanError } from "akanjs/base";

// Security: fails closed, so any 401/403 not known to be kept reads as a guard's. Restored from the wire, a kept one
// names its `code`, as only a generalized answer carries one.
export const isGuardRefusal = (error: unknown): error is { statusCode: 401 | 403 } => {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  if (statusCode !== 401 && statusCode !== 403) return false;
  if (AkanError.is(error)) return error.forwarded;
  const toJSON = (error as { toJSON?: unknown }).toJSON;
  if (typeof toJSON !== "function") return true;
  try {
    return typeof (toJSON.call(error) as { code?: unknown } | null)?.code !== "string";
  } catch {
    return true;
  }
};
