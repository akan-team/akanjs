// RFC 6750 §2.1: a case-insensitive scheme, one or more spaces, then one token and nothing after it. Every reader of
// `Authorization` takes this one grammar, since a token one layer reads and another ignores skips the ignoring layer's
// checks.
export const bearerTokenOf = (authorization: string | null | undefined): string | null =>
  /^Bearer +(\S+)$/i.exec(authorization ?? "")?.[1] ?? null;
