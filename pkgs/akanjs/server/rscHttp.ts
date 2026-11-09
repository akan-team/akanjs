import { mapFlightLineRows } from "./flightRowReader";

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

export function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBuffer> {
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

  return mapFlightLineRows(stream, (row, tag) => {
    const redirect = tag === "E" ? getRedirectRow(row) : null;
    if (!redirect) return row;
    if (!redirected) {
      redirected = true;
      options.onRedirect?.(redirect);
    }
    return encoder.encode(`${redirect.rowId}:null${row[row.byteLength - 1] === 10 ? "\n" : ""}`);
  });
}
