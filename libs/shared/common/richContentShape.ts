interface ShapeNode {
  type?: unknown;
  text?: unknown;
  format?: unknown;
  detail?: unknown;
  mode?: unknown;
  style?: unknown;
  children?: unknown;
  listType?: unknown;
  language?: unknown;
}

/**
 * What a document says, with what the editor recomputes on its own left out — the equality a markdown round-trip
 * has to preserve for `RichMarkdownWriter` to call it lossless.
 */
export class RichContentShape {
  // Derived on load or on the next edit: text direction, a paragraph's first-child format, the bullet marker
  // state, and the node version. None of them is something a person wrote.
  static readonly #bookkeeping: ReadonlySet<string> = new Set(["$", "direction", "textFormat", "textStyle", "version"]);

  static same(left: unknown, right: unknown) {
    return (
      JSON.stringify(RichContentShape.#sorted(RichContentShape.normalize(left))) ===
      JSON.stringify(RichContentShape.#sorted(RichContentShape.normalize(right)))
    );
  }

  static normalize(value: unknown): unknown {
    if (Array.isArray(value)) return RichContentShape.#children(value);
    if (!value || typeof value !== "object") return value;
    const node = value as ShapeNode & Record<string, unknown>;
    if (node.type === "code")
      return { type: "code", language: node.language || undefined, text: RichContentShape.codeText(node) };
    const shaped: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(node)) {
      if (RichContentShape.#bookkeeping.has(key) || field === null || field === undefined) continue;
      shaped[key] =
        key === "children" && Array.isArray(field)
          ? RichContentShape.#children(field, node)
          : RichContentShape.normalize(field);
    }
    // `start` and `left` are the same edge in a left-to-right document, and the editor writes either.
    if (shaped.format === "start" || shaped.format === "left") shaped.format = "";
    if (node.type === "akan-mention") RichContentShape.#omit(shaped, ["text", "href", "imageUrl"]);
    // rel/target record how a link was made — the toolbar writes `noreferrer`, a pasted page brings its own `_blank`.
    if (node.type === "link") RichContentShape.#omit(shaped, ["rel", "target"]);
    if (node.type === "listitem") RichContentShape.#omit(shaped, ["value"]);
    return shaped;
  }

  /** A code block's text, whichever way it is split: `code-highlight` tokens, plain text, line breaks and tabs. */
  static codeText(node: ShapeNode) {
    const children = Array.isArray(node.children) ? (node.children as ShapeNode[]) : [];
    return children
      .map((child) => {
        if (child.type === "linebreak") return "\n";
        if (child.type === "tab") return "\t";
        return typeof child.text === "string" ? child.text : "";
      })
      .join("");
  }

  static #children(children: unknown[], parent?: ShapeNode) {
    const merged = children.reduce<ShapeNode[]>((nodes, child) => {
      if (!child || typeof child !== "object") return nodes;
      const node = child as ShapeNode;
      if (node.type === "text" && node.text === "") return nodes;
      const last = nodes.at(-1);
      if (last && RichContentShape.#joinable(last, node))
        nodes[nodes.length - 1] = { ...last, text: `${String(last.text)}${String(node.text)}` };
      else nodes.push(node);
      return nodes;
    }, []);
    return merged.map((node) => {
      const shaped = RichContentShape.normalize(node) as Record<string, unknown>;
      if (node.type !== "listitem" || parent?.type !== "list") return shaped;
      const nested = Array.isArray(node.children) && (node.children as ShapeNode[])[0]?.type === "list";
      // Only a checklist's own items carry a box; an item left unticked may store `false` or nothing at all.
      if (parent.listType === "check" && !nested) shaped.checked = !!shaped.checked;
      else delete shaped.checked;
      return shaped;
    });
  }

  static #joinable(left: ShapeNode, right: ShapeNode) {
    return (
      left.type === "text" &&
      right.type === "text" &&
      left.format === right.format &&
      left.detail === right.detail &&
      left.mode === right.mode &&
      left.style === right.style
    );
  }

  static #omit(shaped: Record<string, unknown>, keys: string[]) {
    for (const key of keys) delete shaped[key];
  }

  static #sorted(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(RichContentShape.#sorted);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, field]) => field !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, field]) => [key, RichContentShape.#sorted(field)]),
    );
  }
}
