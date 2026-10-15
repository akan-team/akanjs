import { RichNode, type RichNodeLike } from "./richNode";
import { RichUrl } from "./richUrl";

interface UrlNode extends RichNodeLike {
  url?: unknown;
  src?: unknown;
  poster?: unknown;
  embedUrl?: unknown;
  provider?: unknown;
  href?: unknown;
  imageUrl?: unknown;
}

/**
 * A stored document with what no writer may put in one taken out: a child that is not a node, a subtree
 * nested past `RichNode.maxDepth`, and a url its sink does not take (see `RichUrl`). A link whose target
 * fails keeps its text; a media node whose source fails is dropped; an embed that names no allowed
 * player keeps its box, emptied. Anything that is not a document — a legacy block map — is left as it is.
 *
 * Unchanged subtrees come back as the same objects, so a clean document costs one walk and no copies.
 */
export class RichSanitizer {
  static readonly #mediaTypes: ReadonlySet<string> = new Set(["akan-image", "akan-video", "akan-file"]);

  static sanitize<T>(value: T): T {
    if (Array.isArray(value)) {
      const nodes = value.filter(RichNode.isNode);
      return (nodes.length === value.length ? value : nodes) as T;
    }
    if (!RichNode.isDocument(value)) return value;
    const [root] = RichSanitizer.#node(value.root, 0);
    return root === value.root ? value : ({ ...value, root } as T);
  }

  static #nodes(children: unknown[], depth: number) {
    let changed = false;
    const nodes: RichNodeLike[] = [];
    for (const child of children) {
      const kept = RichSanitizer.#node(child, depth);
      if (kept.length !== 1 || kept[0] !== child) changed = true;
      nodes.push(...kept);
    }
    return changed ? nodes : (children as RichNodeLike[]);
  }

  static #node(value: unknown, depth: number): RichNodeLike[] {
    if (!RichNode.isNode(value) || depth > RichNode.maxDepth) return [];
    const node = value as UrlNode;
    const children = Array.isArray(node.children) ? RichSanitizer.#nodes(node.children, depth + 1) : node.children;
    if ((node.type === "link" || node.type === "autolink") && !RichUrl.link(node.url))
      return Array.isArray(children) ? children : [];
    if (node.type && RichSanitizer.#mediaTypes.has(node.type) && node.src !== "" && !RichUrl.media(node.src)) return [];
    const patch = RichSanitizer.#patchOf(node);
    if (children === node.children && !patch) return [node];
    return [{ ...node, ...patch, children }];
  }

  static #patchOf(node: UrlNode): Partial<UrlNode> | null {
    switch (node.type) {
      case "akan-video":
        return node.poster && !RichUrl.media(node.poster) ? { poster: undefined } : null;
      case "akan-embed":
        return RichSanitizer.#embedPatchOf(node);
      case "akan-mention": {
        const href = node.href && !RichUrl.internalPath(node.href) ? { href: null } : null;
        const imageUrl = node.imageUrl && !RichUrl.media(node.imageUrl) ? { imageUrl: null } : null;
        return href || imageUrl ? { ...href, ...imageUrl } : null;
      }
      default:
        return null;
    }
  }

  static #embedPatchOf(node: UrlNode): Partial<UrlNode> | null {
    const url = node.url && !RichUrl.external(node.url) ? { url: "" } : null;
    if (!node.embedUrl) return url;
    const resolved = RichUrl.embed(node.embedUrl);
    if (!resolved) return { ...url, embedUrl: "", provider: undefined };
    if (resolved.embedUrl === node.embedUrl && resolved.type === node.provider) return url;
    return { ...url, embedUrl: resolved.embedUrl, provider: resolved.type };
  }
}
