import { cloneElement, createElement, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import type { AkanHeadSnapshotNode, AkanHeadSnapshotV1, ResolvedHead, ResolveHeadResult } from "../csrTypes";

type TagProps = Record<string, unknown>;

/** Merges the `.head()` of every route level, root first: a deeper level takes over each singleton tag it writes. */
export class RouteHead {
  // A page writes these once; any other link (a stylesheet, a preload) accumulates down the chain.
  static readonly #singletonLinkRels = new Set([
    "canonical",
    "manifest",
    "icon",
    "shortcut icon",
    "apple-touch-icon",
    "mask-icon",
  ]);
  // Each names one URL, so a layout's would claim that URL for every page below it.
  static readonly #pageIdentityKeys = new Set(["link:canonical", "meta:property:og:url"]);

  static merge(levels: ResolveHeadResult[]): ResolveHeadResult {
    const present = levels.filter((level) => RouteHead.#nodeOf(level) != null || RouteHead.#snapshotOf(level));
    if (present.length <= 1) return present[0];
    const node = RouteHead.mergeNodes(present.map((level) => RouteHead.#nodeOf(level)));
    if (!present.some((level) => RouteHead.#snapshotOf(level))) return node;
    const snapshotLevels: AkanHeadSnapshotNode[][] = [];
    for (const level of present) {
      const nodes = RouteHead.#snapshotOf(level)?.nodes ?? RouteHead.#snapshotNodesOf(RouteHead.#nodeOf(level));
      //? A tag no snapshot carries (a script, a component) would vanish from the shell, so the merged node renders.
      if (!nodes) return node;
      snapshotLevels.push(nodes);
    }
    return { node, headSnapshot: RouteHead.#mergeSnapshots(snapshotLevels) } satisfies ResolvedHead;
  }

  /** `merge` of a page's head over its layouts': a canonical or `og:url` comes from the page or not at all. */
  static mergePage(layouts: ResolveHeadResult, page: ResolveHeadResult): ResolveHeadResult {
    return RouteHead.merge([RouteHead.#withoutPageIdentity(layouts), page]);
  }

  /** What makes two tags the same tag; `null` for one that never replaces another. */
  static keyOf(tag: string, props: TagProps): string | null {
    if (tag === "title" || tag === "base") return tag;
    if (tag === "meta") {
      if (props.charSet !== undefined || props.charset !== undefined) return "meta:charset";
      for (const attr of ["name", "property", "httpEquiv", "itemProp"]) {
        const value = props[attr];
        if (typeof value === "string" && value) return `meta:${attr}:${value.toLowerCase()}`;
      }
      return null;
    }
    if (tag !== "link" || typeof props.rel !== "string") return null;
    const rel = props.rel.toLowerCase();
    if (RouteHead.#singletonLinkRels.has(rel)) return `link:${rel}`;
    const hrefLang = props.hrefLang ?? props.hreflang;
    if (rel === "alternate" && typeof hrefLang === "string") return `link:alternate:${hrefLang.toLowerCase()}`;
    return null;
  }

  static #nodeOf(level: ResolveHeadResult): ReactNode {
    return RouteHead.#isResolved(level) ? level.node : level;
  }

  static #snapshotOf(level: ResolveHeadResult): AkanHeadSnapshotV1 | undefined {
    return RouteHead.#isResolved(level) ? level.headSnapshot : undefined;
  }

  static #isResolved(level: ResolveHeadResult): level is ResolvedHead {
    return typeof level === "object" && level !== null && !isValidElement(level) && "node" in level;
  }

  /** `merge` for plain JSX heads, root first. */
  static mergeNodes(nodes: ReactNode[]): ReactNode {
    const present = nodes.filter((node) => node !== null && node !== undefined);
    if (present.length <= 1) return present[0];
    const levels = present.map((node) => RouteHead.#flatten(node));
    const kept = RouteHead.#keepDeepest(levels, (child) => RouteHead.#keyOfNode(child));
    // Re-keyed: keys written on different levels can collide once the tags share one parent.
    const children = kept.map(({ item, level, idx }) =>
      isValidElement(item) ? cloneElement(item as ReactElement, { key: `head:${level}:${idx}` }) : item,
    );
    return createElement(Fragment, null, ...children);
  }

  static #keyOfNode(child: ReactNode): string | null {
    return isValidElement(child) && typeof child.type === "string"
      ? RouteHead.keyOf(child.type, child.props as TagProps)
      : null;
  }

  static #withoutPageIdentity(level: ResolveHeadResult): ResolveHeadResult {
    const isIdentity = (key: string | null) => key !== null && RouteHead.#pageIdentityKeys.has(key);
    const node = RouteHead.#nodeOf(level);
    const children = RouteHead.#flatten(node);
    const kept = children.filter((child) => !isIdentity(RouteHead.#keyOfNode(child)));
    const keptNode =
      kept.length === children.length ? node : kept.length > 0 ? createElement(Fragment, null, ...kept) : null;
    const snapshot = RouteHead.#snapshotOf(level);
    if (!snapshot) return keptNode;
    const nodes = snapshot.nodes.filter((item) => !isIdentity(RouteHead.keyOf(item.tag, item.attrs ?? {})));
    return { node: keptNode, headSnapshot: { ...snapshot, nodes } };
  }

  static #mergeSnapshots(levels: AkanHeadSnapshotNode[][]): AkanHeadSnapshotV1 {
    const kept = RouteHead.#keepDeepest(levels, (node: AkanHeadSnapshotNode) =>
      RouteHead.keyOf(node.tag, node.attrs ?? {}),
    );
    return { version: 1, nodes: kept.map(({ item }) => item) };
  }

  static #snapshotNodesOf(node: ReactNode): AkanHeadSnapshotNode[] | null {
    const nodes: AkanHeadSnapshotNode[] = [];
    for (const child of RouteHead.#flatten(node)) {
      const snapshotNode = RouteHead.#snapshotNodeOf(child);
      if (!snapshotNode) return null;
      nodes.push(snapshotNode);
    }
    return nodes;
  }

  static #snapshotNodeOf(child: ReactNode): AkanHeadSnapshotNode | null {
    if (!isValidElement(child)) return null;
    const tag = child.type;
    if (tag !== "title" && tag !== "meta" && tag !== "link") return null;
    const { children, ...props } = child.props as TagProps;
    if (tag === "title")
      return typeof children === "string" || typeof children === "number" ? { tag, text: String(children) } : null;
    if (children !== undefined && children !== null) return null;
    const attrs: Record<string, string> = {};
    for (const [name, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue;
      if (typeof value !== "string" && typeof value !== "number") return null;
      attrs[name] = String(value);
    }
    return { tag, attrs };
  }

  static #keepDeepest<T>(levels: T[][], keyOf: (item: T) => string | null) {
    const owner = new Map<string, number>();
    levels.forEach((items, level) => {
      for (const item of items) {
        const key = keyOf(item);
        if (key) owner.set(key, level);
      }
    });
    return levels.flatMap((items, level) =>
      items
        .map((item, idx) => ({ item, level, idx }))
        .filter(({ item }) => {
          const key = keyOf(item);
          return !key || owner.get(key) === level;
        }),
    );
  }

  static #flatten(node: ReactNode): ReactNode[] {
    if (node === null || node === undefined || typeof node === "boolean") return [];
    if (Array.isArray(node)) return node.flatMap((child: ReactNode) => RouteHead.#flatten(child));
    if (isValidElement(node) && node.type === Fragment)
      return RouteHead.#flatten((node.props as { children?: ReactNode }).children);
    return [node];
  }
}
