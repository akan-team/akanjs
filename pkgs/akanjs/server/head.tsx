import type { ResolvedHead, ResolveHeadResult } from "akanjs/client";
import { isRecord } from "akanjs/common";
import { AKAN_RSC_HEAD_SNAPSHOT_VERSION, type AkanHeadSnapshotV1 } from "./routeState";

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

function isResolvedHead(value: unknown): value is ResolvedHead {
  return isRecord(value) && "node" in value;
}

export function resolveHeadResult(value: ResolveHeadResult): ResolvedHead {
  if (isResolvedHead(value)) return value;
  return { node: value };
}
