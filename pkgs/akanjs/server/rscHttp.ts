export const RSC_CONTENT_TYPE = "text/x-component; charset=utf-8";
const RSC_REDIRECT_ROW_RE = /^([0-9a-z]+):E(\{[^\n]*"digest":"AKAN_REDIRECT(?:;[^"]*)?"[^\n]*\})(\n?)$/;
const AKAN_REDIRECT_DIGEST_PREFIX = "AKAN_REDIRECT";

export interface RscRedirectRow {
  rowId: string;
  location?: string;
  method?: "replace" | "push";
  status?: 303 | 307 | 308;
}

export function encodeAkanRedirectDigest(input: {
  location: string;
  method: "replace" | "push";
  status: 303 | 307 | 308;
}): string {
  return [AKAN_REDIRECT_DIGEST_PREFIX, input.method, String(input.status), encodeURIComponent(input.location)].join(
    ";",
  );
}

export function decodeAkanRedirectDigest(digest: unknown): Omit<RscRedirectRow, "rowId"> {
  if (typeof digest !== "string" || !digest.startsWith(AKAN_REDIRECT_DIGEST_PREFIX)) return {};
  const [, method, rawStatus, encodedLocation] = digest.split(";");
  const out: Omit<RscRedirectRow, "rowId"> = {};
  if (method === "replace" || method === "push") out.method = method;
  const status = Number(rawStatus);
  if (status === 303 || status === 307 || status === 308) out.status = status;
  if (encodedLocation) {
    try {
      out.location = decodeURIComponent(encodedLocation);
    } catch {
      out.location = encodedLocation;
    }
  }
  return out;
}

export function isRscPayloadResponse(res: Response): boolean {
  if (!res.body) return false;
  if (res.ok) return true;
  return res.status === 404 && (res.headers.get("Content-Type") ?? "").toLowerCase().startsWith("text/x-component");
}

export function getRscPayloadStream(res: Response): ReadableStream<Uint8Array> | null {
  if (!isRscPayloadResponse(res)) return null;
  return res.body;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

export function guardRscRedirectRows(
  stream: ReadableStream<Uint8Array>,
  options: { onRedirect?: (redirect: RscRedirectRow) => void } = {},
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const encoder = new TextEncoder();
  let buffered: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  let redirected = false;

  const getRedirectRow = (row: Uint8Array): RscRedirectRow | null => {
    try {
      const match = RSC_REDIRECT_ROW_RE.exec(decoder.decode(row));
      if (!match?.[1] || !match[2]) return null;
      let redirect: Omit<RscRedirectRow, "rowId"> = {};
      try {
        const payload = JSON.parse(match[2]) as { digest?: unknown; location?: unknown; message?: unknown };
        redirect = decodeAkanRedirectDigest(payload.digest);
        if (!redirect.location && typeof payload.location === "string") redirect.location = payload.location;
        else if (!redirect.location && typeof payload.message === "string")
          redirect.location = /^Redirect to (.+)$/.exec(payload.message)?.[1];
      } catch {}
      return { rowId: match[1], ...redirect };
    } catch {
      return null;
    }
  };

  const enqueueCompleteRows = (chunk: Uint8Array, controller: TransformStreamDefaultController<Uint8Array>) => {
    buffered = concatBytes(buffered, chunk);
    let rowStart = 0;
    for (let index = 0; index < buffered.byteLength; index += 1) {
      if (buffered[index] !== 10) continue;
      const row = buffered.slice(rowStart, index + 1);
      const redirect = getRedirectRow(row);
      if (redirect) {
        if (!redirected) {
          redirected = true;
          options.onRedirect?.(redirect);
        }
        controller.enqueue(encoder.encode(`${redirect.rowId}:null\n`));
        rowStart = index + 1;
        continue;
      }
      controller.enqueue(row);
      rowStart = index + 1;
    }
    buffered = rowStart === 0 ? buffered : buffered.slice(rowStart);
  };

  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        enqueueCompleteRows(chunk, controller);
      },
      flush(controller) {
        if (buffered.byteLength === 0) return;
        const redirect = getRedirectRow(buffered);
        if (redirect) {
          if (!redirected) {
            redirected = true;
            options.onRedirect?.(redirect);
          }
          controller.enqueue(encoder.encode(`${redirect.rowId}:null`));
          return;
        }
        controller.enqueue(buffered);
        buffered = new Uint8Array(0);
      },
    }),
  );
}
