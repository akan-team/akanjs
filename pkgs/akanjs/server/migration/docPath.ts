import { sanitizeJson } from "akanjs/document";
import { stableJson } from "akanjs/service";

/** What a path holds: `[value]`, or `[]` when it holds nothing — a stored `null` is a value. */
export type DocSlot = [unknown] | [];

/** Dot paths over a parsed `_doc`; a numeric segment indexes an array. */
export class DocPath {
  static readonly #unsafe = new Set(["__proto__", "constructor", "prototype"]);

  static segments(path: string) {
    const segments = path.split(".");
    if (segments.some((segment) => !segment || DocPath.#unsafe.has(segment)))
      throw new Error(`Invalid document path "${path}"`);
    return segments;
  }

  static read(doc: Record<string, unknown>, path: string): DocSlot {
    let node: unknown = doc;
    for (const segment of DocPath.segments(path)) {
      if (!node || typeof node !== "object" || !DocPath.#holds(node, segment)) return [];
      node = (node as Record<string, unknown>)[segment];
    }
    return [node];
  }

  static #holds(node: object, segment: string) {
    if (!Array.isArray(node)) return Object.hasOwn(node, segment);
    return /^\d+$/.test(segment) && Number(segment) < node.length;
  }

  static write(doc: Record<string, unknown>, path: string, value: unknown) {
    const segments = DocPath.segments(path);
    let node: Record<string, unknown> | unknown[] = doc;
    for (const segment of segments.slice(0, -1)) {
      const next = (node as Record<string, unknown>)[segment];
      if (next && typeof next === "object") {
        node = next as Record<string, unknown>;
        continue;
      }
      if (next !== undefined && next !== null)
        throw new Error(`Cannot write "${path}": "${segment}" holds a ${typeof next}, not an object`);
      const created: Record<string, unknown> = {};
      DocPath.#assign(node, segment, created, path);
      node = created;
    }
    DocPath.#assign(node, segments[segments.length - 1] ?? "", sanitizeJson(value) ?? null, path);
  }

  static remove(doc: Record<string, unknown>, path: string) {
    const segments = DocPath.segments(path);
    let node: unknown = doc;
    for (const segment of segments.slice(0, -1)) {
      if (!node || typeof node !== "object") return;
      node = (node as Record<string, unknown>)[segment];
    }
    if (!node || typeof node !== "object") return;
    // Removing an item would shift every later index, so a logged path would no longer name what it named.
    if (Array.isArray(node)) throw new Error(`Cannot unset "${path}" inside an array; set the whole array instead`);
    delete (node as Record<string, unknown>)[segments[segments.length - 1] ?? ""];
  }

  static same(a: DocSlot, b: DocSlot) {
    if (a.length !== b.length) return false;
    return !a.length || stableJson(a[0]) === stableJson(b[0]);
  }

  /** Two paths of one write where one sits inside the other would log a value the other already changed. */
  static assertDisjoint(paths: string[]) {
    for (const path of paths) {
      const inner = paths.find((other) => other.startsWith(`${path}.`));
      if (inner) throw new Error(`"${path}" and "${inner}" overlap; write them in separate calls`);
    }
  }

  static #assign(node: Record<string, unknown> | unknown[], segment: string, value: unknown, path: string) {
    if (!Array.isArray(node)) {
      node[segment] = value;
      return;
    }
    const idx = /^\d+$/.test(segment) ? Number(segment) : -1;
    if (idx < 0 || idx > node.length)
      throw new Error(`Cannot write "${path}": "${segment}" is not an index within the array`);
    node[idx] = value;
  }
}
