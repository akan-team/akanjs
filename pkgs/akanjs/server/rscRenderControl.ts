import type { AkanNotFoundError, AkanRedirectError } from "akanjs/client";
import type { ClientManifest } from "./artifact";

export interface RscRenderRequest {
  requestId: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  clientManifest?: ClientManifest;
  prefetch?: boolean;
}

export function isAkanRedirectError(error: unknown): error is AkanRedirectError {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    (error as { digest?: unknown }).digest === "AKAN_REDIRECT" &&
    "location" in error &&
    typeof (error as { location?: unknown }).location === "string" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  );
}

export function isAkanNotFoundError(error: unknown): error is AkanNotFoundError {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    (error as { digest?: unknown }).digest === "AKAN_NOT_FOUND"
  );
}
