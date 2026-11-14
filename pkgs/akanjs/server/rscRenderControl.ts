import type { AkanNotFoundError, AkanRedirectError } from "akanjs/client";
import type { ClientManifest } from "./artifact";
import type { RscRenderTrace } from "./ssrTypes";

export interface RscRenderRequest extends RscRenderTrace {
  requestId: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /** Names the manifest to render against; the host sends that manifest itself once per worker process. */
  manifestRevision?: number;
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
