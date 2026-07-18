import type { AkanHeadSnapshotNode, AkanHeadSnapshotV1 } from "./routeState";
import type { AkanSegmentPatchFailureReason } from "./rscNavigationState";

const AKAN_ROUTE_HEAD_SELECTOR = '[data-akan-head="route"]';

export interface PreparedAkanHeadSnapshotPatch {
  existing: HTMLElement[];
  replacement: HTMLElement[];
}

function createHeadElement(node: AkanHeadSnapshotNode, index: number): HTMLElement {
  const element = document.createElement(node.tag);
  element.setAttribute("data-akan-head", "route");
  element.setAttribute("data-akan-head-key", `${node.tag}:${index}`);
  for (const [key, value] of Object.entries(node.attrs ?? {})) {
    element.setAttribute(key, value);
  }
  if (node.tag === "title") element.textContent = node.text ?? "";
  return element;
}

export function getAkanHeadSnapshotPatchFailureReason(
  snapshot: AkanHeadSnapshotV1,
): Extract<AkanSegmentPatchFailureReason, "head-missing" | "head-invalid"> | null {
  if (typeof document === "undefined" || !document.head) return "head-invalid";
  const existing = document.head.querySelector(AKAN_ROUTE_HEAD_SELECTOR);
  if (!existing) return "head-missing";
  if (!Array.isArray(snapshot.nodes)) return "head-invalid";
  return null;
}

export function canApplyAkanHeadSnapshotPatch(snapshot: AkanHeadSnapshotV1): boolean {
  return getAkanHeadSnapshotPatchFailureReason(snapshot) === null;
}

export function prepareAkanHeadSnapshotPatch(snapshot: AkanHeadSnapshotV1): PreparedAkanHeadSnapshotPatch | null {
  try {
    if (getAkanHeadSnapshotPatchFailureReason(snapshot)) return null;
    const existing = [...document.head.querySelectorAll<HTMLElement>(AKAN_ROUTE_HEAD_SELECTOR)];
    if (!existing[0]) return null;
    return {
      existing,
      replacement: snapshot.nodes.map((node, index) => createHeadElement(node, index)),
    };
  } catch {
    return null;
  }
}

export function commitPreparedAkanHeadSnapshotPatch(prepared: PreparedAkanHeadSnapshotPatch): boolean {
  try {
    const anchor = prepared.existing[0];
    if (!anchor) return false;
    const fragment = document.createDocumentFragment();
    for (const node of prepared.replacement) fragment.appendChild(node);
    document.head.insertBefore(fragment, anchor);
    for (const node of prepared.existing) node.remove();
    return true;
  } catch {
    return false;
  }
}

export function rollbackPreparedAkanHeadSnapshotPatch(prepared: PreparedAkanHeadSnapshotPatch): void {
  try {
    const anchor = prepared.replacement.find((node) => node.parentNode === document.head) ?? null;
    if (anchor) {
      const fragment = document.createDocumentFragment();
      for (const node of prepared.existing) fragment.appendChild(node);
      document.head.insertBefore(fragment, anchor);
    }
    for (const node of prepared.replacement) node.remove();
  } catch {
    // Full fallback will repair the document head on the next successful commit.
  }
}

export function applyAkanHeadSnapshotPatch(snapshot: AkanHeadSnapshotV1): boolean {
  const prepared = prepareAkanHeadSnapshotPatch(snapshot);
  return prepared ? commitPreparedAkanHeadSnapshotPatch(prepared) : false;
}
