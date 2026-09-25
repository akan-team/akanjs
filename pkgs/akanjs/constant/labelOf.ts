/**
 * The one line a human scans for. A model that writes its own `Light<Model>.label()` owns the answer, since
 * display logic is the Light class's job; otherwise it is derived from what the model already declared — the
 * `text: "title"` search role names exactly that field, so an agent-facing label costs no new declaration.
 * Falls back to the conventional `title`/`name` keys; the id is the caller's floor.
 */
export const labelOf = (model: unknown, value: unknown): string | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const written = source.label;
  if (typeof written === "function") {
    try {
      const label = (written as () => unknown).call(source);
      if (typeof label === "string" && label) return label;
    } catch {
      // A projected row carries only the fields the query selected, so a label method reading one it did not
      // get throws. Fall through to the declared paths rather than take the whole listing down.
    }
  }
  const paths = (model as { text?: { title?: Iterable<string> } } | null)?.text?.title;
  const titlePath = [...(paths ?? [])].find((path) => !path.includes(".") && !path.includes("["));
  for (const key of [titlePath, "title", "name"]) {
    if (!key) continue;
    const candidate = source[key];
    if (typeof candidate === "string" && candidate) return candidate;
  }
  return undefined;
};
