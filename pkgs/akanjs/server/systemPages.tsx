import type { ReactNode } from "react";
import { createSubRouteIndexDocument, getSubRouteIndexHref, type SubRouteIndexOptions } from "./subRouteIndexDocument";
import {
  createSystemPageDocument,
  SYSTEM_PAGE_STATUS_COPY,
  type SystemPageKind,
  type SystemPageOptions,
} from "./systemPageDocument";

export interface SystemPageResponseOptions extends SystemPageOptions {
  method?: string;
}

export interface SubRouteIndexResponseOptions extends SubRouteIndexOptions {
  method?: string;
}

export { createSystemPageDocument, getSystemPageHomeHref } from "./systemPageDocument";

export async function createSystemPageResponse(options: SystemPageResponseOptions): Promise<Response> {
  return await renderDocumentResponse({
    status: SYSTEM_PAGE_STATUS_COPY[options.kind].status,
    method: options.method,
    document: () => createSystemPageDocument(options),
    fallbackText: () => createSystemPageFallbackText(options.kind),
  });
}

export async function createSubRouteIndexResponse(options: SubRouteIndexResponseOptions): Promise<Response> {
  return await renderDocumentResponse({
    status: 200,
    method: options.method,
    document: () => createSubRouteIndexDocument(options),
    fallbackText: () => options.basePaths.map((basePath) => getSubRouteIndexHref(options.locale, basePath)).join("\n"),
  });
}

export function createSystemPageHeaders(): Headers {
  return new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
}

export function createSystemPageFallbackText(kind: SystemPageKind): string {
  const copy = SYSTEM_PAGE_STATUS_COPY[kind];
  return `${copy.status} ${copy.eyebrow}`;
}

async function renderDocumentResponse({
  status,
  method,
  document,
  fallbackText,
}: {
  status: number;
  method?: string;
  document: () => ReactNode;
  fallbackText: () => string;
}): Promise<Response> {
  const headers = createSystemPageHeaders();
  if (method === "HEAD") return new Response(null, { status, headers });

  try {
    const { renderToReadableStream } = await import("react-dom/server.browser");
    const stream = await renderToReadableStream(document());
    return new Response(stream, { status, headers });
  } catch {
    return new Response(fallbackText(), {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}
