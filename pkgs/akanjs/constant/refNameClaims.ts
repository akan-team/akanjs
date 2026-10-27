import { type Cls, type EnumInstance, FIELD_META, getNonArrayModel } from "akanjs/base";
import type { ConstantOriginKind } from "./constantRegistry";
import type { ConstantField, FieldObject } from "./fieldInfo";

export interface RefNameOwner {
  key: string;
  label: string;
}

interface RefNameClaim {
  owner: RefNameOwner;
  refs: Cls[];
}

interface RefNameEntry {
  kind: ConstantOriginKind;
  key: string;
  claims: Map<string, RefNameClaim>;
}

export class RefNameClaims {
  readonly #entries = new Map<string, RefNameEntry>();
  readonly #nameOf: (ref: Cls) => string | undefined;

  constructor(nameOf: (ref: Cls) => string | undefined) {
    this.#nameOf = nameOf;
  }

  //? One claim per owner, its latest kept and moved last: HMR re-evaluates a module, which re-declares, not clashes.
  claim(kind: ConstantOriginKind, key: string, refs: Cls[], owner: RefNameOwner) {
    const id = `${kind}:${key}`;
    const entry = this.#entries.get(id) ?? { kind, key, claims: new Map<string, RefNameClaim>() };
    entry.claims.delete(owner.key);
    entry.claims.set(owner.key, { owner, refs });
    this.#entries.set(id, entry);
  }

  //? Asked at boot, not at each claim: a model's relation may name a model that registers after it.
  assertConsistent() {
    const clashes = [...this.#entries.values()].flatMap((entry) => this.#clashesOf(entry));
    if (!clashes.length) return;
    throw new Error(
      `[ConstantRegistry] ${clashes.length} refName(s) declared with different shapes:\n${clashes.join("\n")}\n` +
        "A refName names one shape across an app and the libs it mounts: rename one side, or build the app's model " +
        "on the lib's through lib/__lib/lib.constant.ts.",
    );
  }

  #clashesOf({ kind, key, claims }: RefNameEntry): string[] {
    const ordered = [...claims.values()];
    const latest = ordered.at(-1);
    if (!latest) return [];
    return ordered.slice(0, -1).flatMap((earlier) => {
      const clash = this.#clashOf(kind, key, earlier, latest);
      return clash ? [clash] : [];
    });
  }

  #clashOf(kind: ConstantOriginKind, key: string, earlier: RefNameClaim, latest: RefNameClaim): string | null {
    for (const [idx, ref] of latest.refs.entries()) {
      const earlierRef = earlier.refs[idx];
      if (!earlierRef || earlierRef === ref) continue;
      const [earlierShape, latestShape] = [this.#shapeOf(kind, earlierRef), this.#shapeOf(kind, ref)];
      const [onlyEarlier, onlyLatest] = [
        RefNameClaims.#unmatched(earlierShape, latestShape),
        RefNameClaims.#unmatched(latestShape, earlierShape),
      ];
      if (!onlyEarlier.length && !onlyLatest.length) continue;
      const subject = kind === "database" ? `model "${key}" (${this.#nameOf(ref) ?? key})` : `${kind} "${key}"`;
      return `  • ${subject}: ${earlier.owner.label} has ${onlyEarlier.join(", ") || "nothing else"}; ${latest.owner.label} has ${onlyLatest.join(", ") || "nothing else"}`;
    }
    return null;
  }

  #shapeOf(kind: ConstantOriginKind, ref: Cls): Map<string, string> {
    if (kind === "enum") return new Map((ref as unknown as EnumInstance).values.map((value) => [String(value), ""]));
    const fields = (ref as Cls<unknown, { [FIELD_META]?: FieldObject }>)[FIELD_META] ?? {};
    return new Map(Object.entries(fields).map(([fieldKey, field]) => [fieldKey, this.#typeOf(field)]));
  }

  #typeOf(field: ConstantField): string {
    const type = field.enum
      ? `enum ${field.enum.refName}(${field.enum.values.join("|")})`
      : field.isMap
        ? `Map<${this.#labelOf(field.of)}>`
        : this.#labelOf(field.modelRef);
    const kinds = [...(field.fieldType !== "property" ? [field.fieldType] : []), ...(field.visual ? ["visual"] : [])];
    return `${kinds.map((kind) => `${kind} `).join("")}${type}${"[]".repeat(field.arrDepth)}${field.nullable ? "?" : ""}`;
  }

  #labelOf(typeRef: unknown): string {
    const [ref, arrDepth] = getNonArrayModel(typeRef as Cls);
    return `${this.#nameOf(ref) ?? (ref?.name || "unknown")}${"[]".repeat(arrDepth)}`;
  }

  static #unmatched(shape: Map<string, string>, other: Map<string, string>): string[] {
    return [...shape]
      .filter(([key, type]) => other.get(key) !== type)
      .map(([key, type]) => (type ? `${key}: ${type}` : key));
  }
}
