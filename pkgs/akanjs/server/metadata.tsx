import type { AkanMetadata, Head, ResolvedHead, ResolveHeadResult } from "akanjs/client";
import { AKAN_RSC_HEAD_SNAPSHOT_VERSION, type AkanHeadSnapshotNode, type AkanHeadSnapshotV1 } from "./routeState";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeStringArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function createMetaNode(attrs: Record<string, string | undefined>): AkanHeadSnapshotNode | null {
  if (attrs.content === undefined || attrs.content === "") return null;
  const normalizedAttrs = Object.fromEntries(
    Object.entries(attrs).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""),
  );
  return Object.keys(normalizedAttrs).length > 0 ? { tag: "meta", attrs: normalizedAttrs } : null;
}

function createLinkNode(attrs: Record<string, string | undefined>): AkanHeadSnapshotNode | null {
  if (attrs.href === undefined || attrs.href === "") return null;
  const normalizedAttrs = Object.fromEntries(
    Object.entries(attrs).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""),
  );
  return Object.keys(normalizedAttrs).length > 0 ? { tag: "link", attrs: normalizedAttrs } : null;
}

function createOpenGraphHeadSnapshotNodes(metadata: AkanMetadata): AkanHeadSnapshotNode[] {
  const openGraph = metadata.openGraph;
  if (!openGraph) return [];
  const nodes: AkanHeadSnapshotNode[] = [];
  const pushMeta = (property: string, content: string | undefined) => {
    const node = createMetaNode({ property, content });
    if (node) nodes.push(node);
  };
  pushMeta("og:title", openGraph.title);
  pushMeta("og:description", openGraph.description);
  pushMeta("og:type", openGraph.type);
  pushMeta("og:url", openGraph.url);
  pushMeta("og:site_name", openGraph.siteName);
  for (const image of normalizeStringArray(openGraph.images)) {
    const node = createMetaNode({ property: "og:image", content: image });
    if (node) nodes.push(node);
  }
  return nodes;
}

function createTwitterHeadSnapshotNodes(metadata: AkanMetadata): AkanHeadSnapshotNode[] {
  const twitter = metadata.twitter;
  if (!twitter) return [];
  const nodes: AkanHeadSnapshotNode[] = [];
  const pushMeta = (name: string, content: string | undefined) => {
    const node = createMetaNode({ name, content });
    if (node) nodes.push(node);
  };
  pushMeta("twitter:card", twitter.card);
  pushMeta("twitter:title", twitter.title);
  pushMeta("twitter:description", twitter.description);
  for (const image of normalizeStringArray(twitter.images)) {
    const node = createMetaNode({ name: "twitter:image", content: image });
    if (node) nodes.push(node);
  }
  return nodes;
}

function createAlternateHeadSnapshotNodes(metadata: AkanMetadata): AkanHeadSnapshotNode[] {
  const alternates = metadata.alternates;
  if (!alternates) return [];
  const nodes: AkanHeadSnapshotNode[] = [];
  const canonical = createLinkNode({ rel: "canonical", href: alternates.canonical });
  if (canonical) nodes.push(canonical);
  if (alternates.languages) {
    for (const [lang, href] of Object.entries(alternates.languages)) {
      const alternate = createLinkNode({ rel: "alternate", hrefLang: lang, href });
      if (alternate) nodes.push(alternate);
    }
  }
  return nodes;
}

export function isAkanMetadata(value: unknown): value is AkanMetadata {
  if (!isRecord(value)) return false;
  return (
    "title" in value ||
    "description" in value ||
    "robots" in value ||
    "openGraph" in value ||
    "twitter" in value ||
    "alternates" in value
  );
}

export function createAkanMetadataHeadSnapshot(metadata: AkanMetadata): AkanHeadSnapshotV1 {
  const nodes: AkanHeadSnapshotNode[] = [];
  if (metadata.title) nodes.push({ tag: "title", text: metadata.title });
  const description = createMetaNode({ name: "description", content: metadata.description });
  if (description) nodes.push(description);
  const robots = createMetaNode({ name: "robots", content: metadata.robots });
  if (robots) nodes.push(robots);
  nodes.push(...createOpenGraphHeadSnapshotNodes(metadata));
  nodes.push(...createTwitterHeadSnapshotNodes(metadata));
  nodes.push(...createAlternateHeadSnapshotNodes(metadata));
  return { version: AKAN_RSC_HEAD_SNAPSHOT_VERSION, nodes };
}

export function createAkanLocaleAlternateHeadSnapshot(languages: Record<string, string>): AkanHeadSnapshotV1 {
  return {
    version: AKAN_RSC_HEAD_SNAPSHOT_VERSION,
    nodes: Object.entries(languages).map(([lang, href]) => ({
      tag: "link",
      attrs: { rel: "alternate", hrefLang: lang, href },
    })),
  };
}

export function mergeAkanHeadSnapshots(
  ...snapshots: Array<AkanHeadSnapshotV1 | null | undefined>
): AkanHeadSnapshotV1 | undefined {
  const nodes = snapshots.flatMap((snapshot) => snapshot?.nodes ?? []);
  return snapshots.some(Boolean) ? { version: AKAN_RSC_HEAD_SNAPSHOT_VERSION, nodes } : undefined;
}

export function renderAkanHeadSnapshot(snapshot: AkanHeadSnapshotV1, options: { markRouteOwned?: boolean } = {}): Head {
  const markRouteOwned = options.markRouteOwned ?? true;
  return (
    <>
      {snapshot.nodes.map((node, index) => {
        const marker = markRouteOwned
          ? {
              "data-akan-head": "route",
              "data-akan-head-key": `${node.tag}:${index}`,
            }
          : {};
        if (node.tag === "title") {
          return (
            <title key={`${node.tag}:${index}`} {...marker}>
              {node.text ?? ""}
            </title>
          );
        }
        if (node.tag === "meta") {
          return <meta key={`${node.tag}:${index}`} {...node.attrs} {...marker} />;
        }
        return <link key={`${node.tag}:${index}`} {...node.attrs} {...marker} />;
      })}
    </>
  );
}

export function renderMetadata(metadata: AkanMetadata): Head {
  return renderAkanHeadSnapshot(createAkanMetadataHeadSnapshot(metadata));
}

export function hasExplicitLanguageAlternates(metadata: AkanMetadata | null | undefined): boolean {
  return Boolean(metadata?.alternates?.languages && Object.keys(metadata.alternates.languages).length > 0);
}

export function shouldRenderLocaleAlternates(options: {
  isSpecialRoute?: boolean;
  hasExplicitLanguageAlternates?: boolean;
}): boolean {
  return options.isSpecialRoute !== true && options.hasExplicitLanguageAlternates !== true;
}

export function isResolvedHead(value: unknown): value is ResolvedHead {
  return isRecord(value) && "node" in value && "hasExplicitLanguageAlternates" in value;
}

export function resolveMetadataHead(metadata: AkanMetadata): ResolvedHead {
  const headSnapshot = createAkanMetadataHeadSnapshot(metadata);
  return {
    node: renderAkanHeadSnapshot(headSnapshot),
    hasExplicitLanguageAlternates: hasExplicitLanguageAlternates(metadata),
    headSnapshot,
  };
}

export function resolveHeadExport(
  value: Head | AkanMetadata | null | undefined,
  options: { includeHeadSnapshot?: boolean } = {},
): ResolvedHead {
  if (!isAkanMetadata(value)) return { node: value, hasExplicitLanguageAlternates: false };
  if (options.includeHeadSnapshot !== false) return resolveMetadataHead(value);
  return {
    node: renderAkanHeadSnapshot(createAkanMetadataHeadSnapshot(value), { markRouteOwned: false }),
    hasExplicitLanguageAlternates: hasExplicitLanguageAlternates(value),
  };
}

export function resolveHeadResult(value: ResolveHeadResult): ResolvedHead {
  if (isResolvedHead(value)) return value;
  return resolveHeadExport(value as Head | AkanMetadata | null | undefined);
}

export function normalizeHead(value: Head | AkanMetadata | null | undefined): Head | null | undefined {
  return isAkanMetadata(value) ? renderMetadata(value) : value;
}
