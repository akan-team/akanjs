import { deepObjectify } from "akanjs/common";

export class EditSeed {
  static keyOf(edit: Record<string, unknown>, modelObjKey: string, viewAtKey: string): string {
    const modelObj = edit[modelObjKey] as { id: string; updatedAt?: unknown } | undefined;
    if (edit.refName && modelObj)
      // The record's version, not `<model>ViewAt`: that is stamped per fetch, so every refresh would read as new.
      return `edit:${modelObj.id}@${EditSeed.#timeOf(modelObj.updatedAt) ?? EditSeed.#timeOf(edit[viewAtKey])}`;
    return `new:${EditSeed.#stableStringify(deepObjectify(edit, { serializable: true, convertDate: "string" }))}`;
  }

  static #timeOf(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const time = new Date(value as string).getTime();
    return Number.isNaN(time) ? null : time;
  }

  static #stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
    if (Array.isArray(value)) return `[${value.map((item) => EditSeed.#stableStringify(item)).join(",")}]`;
    const source = value as Record<string, unknown>;
    const entries = Object.keys(source)
      .filter((key) => source[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${EditSeed.#stableStringify(source[key])}`);
    return `{${entries.join(",")}}`;
  }
}
