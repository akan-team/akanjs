//? A reference field holds an id string on the server, but a populated document can arrive in its place.
export const idOf = (ref: unknown): string | null =>
  typeof ref === "string" ? ref || null : ((ref as { id?: string } | null | undefined)?.id ?? null);
