//? Same rules as the `accept` attribute: comma-separated `.ext`, `type/*` and `type/subtype` tokens, case-insensitive.
export const matchesAccept = (file: { name: string; type: string }, accept?: string) => {
  const tokens = (accept ?? "")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  if (!tokens.length) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((token) => {
    if (token === "*/*") return true;
    if (token.startsWith(".")) return name.endsWith(token);
    if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
    return type === token;
  });
};
