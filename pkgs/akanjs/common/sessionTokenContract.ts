//* How a caller with no cookie session asks sign-in and refresh for body tokens; a server-rendered page never sends it.
export const sessionTokenContract = {
  header: "x-akan-session-tokens",
  body: "body",
  makeHeaders: (): Record<string, string> => ({ "x-akan-session-tokens": "body" }),
  asksForBody: (headers: Headers): boolean => headers.get("x-akan-session-tokens") === "body",
} as const;
