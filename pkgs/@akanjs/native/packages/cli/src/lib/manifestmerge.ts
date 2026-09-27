// Merges the manifests of pinned AARs into what akan-native's generated manifest takes (akanjs readiness O8),
// the part of Gradle's manifest merger these libraries need (docs/research/android-aar-closure.md §5.2):
// - ${applicationId} is replaced, the tools: namespace is dropped
// - uses-permission and permission once per name; <queries> entries in one element
// - components (activity, service, receiver, provider) with the same android:name become one, their
//   meta-data once per name and their intent filters once each: Firebase declares
//   ComponentDiscoveryService in four AARs, each with its own registrar meta-data, and finds its
//   components by reading all of them
// - application meta-data once per name; of the application's attributes only appComponentFactory
//   (androidx.core's), which Gradle would add as well

import { attr, parseXml, serializeXml, type XmlElement } from "./xml.ts";

export interface LibraryManifest {
  /** For messages. */
  from: string;
  xml: string;
}

export interface MergedManifest {
  /** uses-permission names. */
  permissions: string[];
  /** XML at the <manifest> level: permission definitions and one <queries>. */
  manifestXml: string[];
  /** XML inside <application>: components and meta-data. */
  applicationXml: string[];
  /** Attributes for <application>, e.g. android:appComponentFactory. */
  applicationAttrs: [string, string][];
  /** Component classes, for R8 keep rules. */
  components: string[];
}

const COMPONENTS = new Set(["activity", "activity-alias", "service", "receiver", "provider"]);
const KEPT_APPLICATION_ATTRS = ["android:appComponentFactory"];

/** Replaces ${applicationId} and drops tools: attributes, in place, through the whole tree. */
function clean(element: XmlElement, applicationId: string): XmlElement {
  element.attrs = element.attrs
    .filter(([n]) => !n.startsWith("tools:") && n !== "xmlns:tools")
    .map(([n, v]) => [n, v.replaceAll("${applicationId}", applicationId)]);
  for (const c of element.children) clean(c, applicationId);
  return element;
}

const key = (e: XmlElement) => serializeXml(e);

/** Adds `extra`'s attributes that `target` lacks and its children under the merge rules. */
function mergeInto(target: XmlElement, extra: XmlElement): void {
  for (const [n, v] of extra.attrs) if (attr(target, n) === undefined) target.attrs.push([n, v]);
  for (const child of extra.children) {
    const name = attr(child, "android:name");
    const same = target.children.find(
      (c) =>
        c.name === child.name &&
        (child.name === "meta-data" ? attr(c, "android:name") === name : key(c) === key(child)),
    );
    if (!same) target.children.push(child);
  }
}

export function mergeLibraryManifests(manifests: LibraryManifest[], applicationId: string): MergedManifest {
  const permissions: string[] = [];
  const permissionDefs = new Map<string, XmlElement>();
  const queries: XmlElement = { name: "queries", attrs: [], children: [] };
  const components = new Map<string, XmlElement>();
  const metaData = new Map<string, XmlElement>();
  const other = new Map<string, XmlElement>();
  const applicationAttrs: [string, string][] = [];

  for (const { from, xml } of manifests) {
    let root: XmlElement;
    try {
      root = clean(parseXml(xml), applicationId);
    } catch (error) {
      throw new Error(`${from}: ${(error as Error).message}`);
    }
    for (const child of root.children) {
      const name = attr(child, "android:name");
      if (child.name === "uses-permission" || child.name === "uses-permission-sdk-23") {
        if (name && !permissions.includes(name)) permissions.push(name);
      } else if (child.name === "permission") {
        if (name && !permissionDefs.has(name)) permissionDefs.set(name, child);
      } else if (child.name === "queries") {
        mergeInto(queries, child);
      } else if (child.name === "application") {
        for (const a of KEPT_APPLICATION_ATTRS) {
          const value = attr(child, a);
          if (value && !applicationAttrs.some(([n]) => n === a)) applicationAttrs.push([a, value]);
        }
        for (const item of child.children) {
          const itemName = attr(item, "android:name");
          if (COMPONENTS.has(item.name) && itemName) {
            const id = `${item.name} ${itemName}`;
            const existing = components.get(id);
            if (existing) mergeInto(existing, item);
            else components.set(id, item);
          } else if (item.name === "meta-data" && itemName) {
            if (!metaData.has(itemName)) metaData.set(itemName, item);
          } else if (!other.has(key(item))) other.set(key(item), item);
        }
      }
      // uses-sdk and uses-feature: akan-native's manifest sets the SDK levels; no library declares features.
    }
  }

  const indent = (e: XmlElement, depth: string) => serializeXml(e, "").replaceAll("\n", `\n${depth}`);
  return {
    permissions,
    manifestXml: [
      ...[...permissionDefs.values()].map((e) => indent(e, "    ")),
      ...(queries.children.length ? [indent(queries, "    ")] : []),
    ],
    applicationXml: [...components.values(), ...metaData.values(), ...other.values()].map((e) => indent(e, "        ")),
    applicationAttrs,
    components: [...components.values()].map((e) => attr(e, "android:name")!).filter((n) => n.includes(".")),
  };
}
