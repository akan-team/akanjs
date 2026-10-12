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

  static merge(levels: ResolveHeadResult[]): ResolveHeadResult {
    const present = levels.filter((level) => RouteHead.#nodeOf(level) != null || RouteHead.#snapshotOf(level));
    if (present.length <= 1) return present[0];
    const node = RouteHead.mergeNodes(present.map((level) => RouteHead.#nodeOf(level)));
    const snapshots = present.map((level) => RouteHead.#snapshotOf(level)).filter((snapshot) => !!snapshot);
    if (!snapshots.length) return node;
    return { node, headSnapshot: RouteHead.#mergeSnapshots(snapshots) } satisfies ResolvedHead;
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
    const kept = RouteHead.#keepDeepest(levels, (child) =>
      isValidElement(child) && typeof child.type === "string"
        ? RouteHead.keyOf(child.type, child.props as TagProps)
        : null,
    );
    // Re-keyed: keys written on different levels can collide once the tags share one parent.
    const children = kept.map(({ item, level, idx }) =>
      isValidElement(item) ? cloneElement(item as ReactElement, { key: `head:${level}:${idx}` }) : item,
    );
    return createElement(Fragment, null, ...children);
  }

  static #mergeSnapshots(snapshots: AkanHeadSnapshotV1[]): AkanHeadSnapshotV1 {
    const kept = RouteHead.#keepDeepest(
      snapshots.map((snapshot) => snapshot.nodes),
      (node: AkanHeadSnapshotNode) => RouteHead.keyOf(node.tag, node.attrs ?? {}),
    );
    return { version: 1, nodes: kept.map(({ item }) => item) };
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
