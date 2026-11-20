import type { AkanPreviewConfig } from "./types";

export class AkanPreview {
  static parse(value: unknown, owner: string): AkanPreviewConfig {
    if (value === undefined) return {};
    if (typeof value !== "object" || value === null || Array.isArray(value))
      throw new Error(`[preview] ${owner} declares \`preview\`, which has to be an object: { signIn, examples }`);
    const { signIn, examples, ...unknown } = value as Record<string, unknown>;
    const [stray] = Object.keys(unknown);
    if (stray) throw new Error(`[preview] ${owner} declares preview.${stray}; it takes signIn and examples`);
    if (signIn !== undefined && typeof signIn !== "function")
      throw new Error(`[preview] ${owner} declares preview.signIn, which has to be a function`);
    if (examples !== undefined && !(Array.isArray(examples) && examples.every(AkanPreview.#isPath)))
      throw new Error(`[preview] ${owner} declares preview.examples, which has to list paths that start with "/"`);
    return {
      ...(signIn ? { signIn: signIn as AkanPreviewConfig["signIn"] } : {}),
      ...(examples ? { examples: examples as string[] } : {}),
    };
  }

  static #isPath(value: unknown) {
    return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
  }
}
