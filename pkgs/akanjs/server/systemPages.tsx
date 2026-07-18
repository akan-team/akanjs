import {
  createSystemPageDocument,
  SYSTEM_PAGE_STATUS_COPY,
  type SystemPageKind,
  type SystemPageOptions,
} from "./systemPageDocument";

export interface SystemPageResponseOptions extends SystemPageOptions {
  method?: string;
}

export { createSystemPageDocument, getSystemPageHomeHref } from "./systemPageDocument";

export async function createSystemPageResponse(options: SystemPageResponseOptions): Promise<Response> {
  const status = SYSTEM_PAGE_STATUS_COPY[options.kind].status;
  const headers = createSystemPageHeaders();
  if (options.method === "HEAD") return new Response(null, { status, headers });

  try {
    const { renderToReadableStream } = await import("react-dom/server.browser");
    const stream = await renderToReadableStream(createSystemPageDocument(options));
    return new Response(stream, { status, headers });
  } catch {
    return new Response(createSystemPageFallbackText(options.kind), {
      status,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
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
