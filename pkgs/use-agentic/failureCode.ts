//? Bounded as akanjs's `FailureCode` bounds it, duck-typed as this package imports no framework: a dictionary key
//? (`<module>.error.<key>`) or a camelCase token. Security: prose-free, since a code rides outside any content fence.
const errKey = /^[A-Za-z][\w$-]{0,63}\.error\.[\w$.-]{1,120}$/;
const token = /^[a-z][A-Za-z0-9]{0,63}$/;

export const isFailureCode = (value: unknown): value is string =>
  typeof value === "string" && (errKey.test(value) || token.test(value));

//? akanjs's `AkanError.codeOfStatus` table, so a refusal answered before any stream opens is named as the stream names it.
const statusCodes: { readonly [status: number]: string } = {
  400: "badRequest",
  401: "unauthorized",
  403: "forbidden",
  404: "notFound",
  409: "conflict",
  413: "payloadTooLarge",
  415: "unsupportedMediaType",
  429: "tooManyRequests",
  500: "internalError",
  502: "badGateway",
  503: "serviceUnavailable",
  504: "gatewayTimeout",
};

export const codeOfStatus = (status: number): string => statusCodes[status] ?? `http${status}`;

const isKey = (value: unknown): value is string => typeof value === "string" && errKey.test(value);

//? Named as the stream names it. Security: a 401/403's key names the authorization structure, so only a kept error's
//? `code` outranks its status; only a generalized answer carries one.
export const codeOfAnswer = (status: number, body: unknown): string => {
  const fields = (typeof body === "object" && body !== null ? body : {}) as {
    code?: unknown;
    error?: unknown;
    message?: unknown;
  };
  const kept = typeof fields.code === "string" && token.test(fields.code) ? fields.code : undefined;
  if (status === 401 || status === 403) return kept ?? codeOfStatus(status);
  return [fields.error, fields.message, fields.code].find(isKey) ?? kept ?? codeOfStatus(status);
};

export const failureCodeOf = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;
  const { code, error } = value as { code?: unknown; error?: unknown };
  if (typeof error === "string" && errKey.test(error)) return error;
  return typeof code === "string" && token.test(code) ? code : undefined;
};
