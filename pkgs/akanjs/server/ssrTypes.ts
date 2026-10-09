import type { AkanRequestStore, AkanTheme } from "akanjs/fetch";

export interface SsrManifestEntry {
  id: string;
  chunks: string[];
  name: string;
  async?: boolean;
}

export interface SsrManifest {
  moduleLoading: { prefix: string; crossOrigin?: string } | null;
  moduleMap: Record<string, Record<string, SsrManifestEntry>>;
}

export interface SsrChunkRegistryStats {
  ssrChunkRegistrySize: number;
  ssrChunkLoadCount: number;
  ssrChunkCacheHitCount: number;
  ssrChunkEvictionCount: number;
}

export interface SsrLateRedirect {
  type: "redirect";
  location: string;
  method: "replace" | "push";
  status: 303 | 307 | 308;
}

export type SsrLateControl = SsrLateRedirect | { type: "not-found" };

export interface RscTraceMetadata {
  navId?: string;
  pathname: string;
  routeId: string;
  cache: "hit" | "miss" | "bypass";
  cacheReason?: string;
  cacheKeyHash?: string;
  partial?: "full" | "candidate" | "patch" | "fallback";
  partialReason?: string;
  partialCommonPrefixLength?: number;
  patchStartIndex?: number;
  patchSegmentPath?: string;
  patchStartSegment?: string;
  patchHeadSafe?: boolean;
  patchHeadSnapshot?: string;
  routeState?: string;
  /** The route's `pageConfig.ssr === "block"`, carried here because the host never resolves pageConfig itself. */
  ssrBlocking?: boolean;
}

export interface SsrFromRscInput {
  request?: Request;
  requestStore?: AkanRequestStore;
  rscStream: ReadableStream<Uint8Array>;
  ssrManifest: SsrManifest;
  bootstrapModules?: string[];
  extraBootstrapInline?: string;
  // One React across route chunks: their externalized specifiers resolve to the base build's vendor entries.
  // Injected by a stream transform, not React children: the spec needs the import map before any module fetch.
  importmap?: Record<string, string>;
  theme?: AkanTheme;
  injectThemeInitScript?: boolean;
  lateControl?: Promise<SsrLateControl | null>;
  onCancel?: (reason?: unknown) => void;
  /** Buffers until `stream.allReady` (`pageConfig.ssr: "block"`); `AKAN_SSR_WAIT_FOR_ALL_READY=1` forces it globally. */
  waitForAllReady?: boolean;
  /** Buffers like `waitForAllReady` and writes every Suspense boundary in place, for a reader that runs no script. */
  inlineBoundaries?: boolean;
}

export interface SsrDocumentOptions {
  bootstrap: string;
  waitForAllReady?: boolean;
  inlineBoundaries?: boolean;
  onError: (error: unknown, phase?: string) => void;
}
