import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

// The engine's `Model` type (from `pi-ai`) is not re-exported, so it is recovered from `getModel`.
export type CodeAgentModel = NonNullable<ReturnType<ModelRuntime["getModel"]>>;

export interface CodeAgentModelRef {
  provider: string;
  id: string;
}

/** DeepSeek's million-token window is what makes the always-loaded `AGENTS.md` affordable on every turn. */
export const akanCodeDefaultModel: CodeAgentModelRef = { provider: "deepseek", id: "deepseek-flash" };

// Declared text-only by the catalogue, yet verified against the provider to see images.
// `deepseek-v4-pro` is deliberately absent: it accepts an image and then says it cannot view it.
const catalogueMissesImages = new Set(["deepseek/deepseek-v4-flash"]);

const correctInputs = (model: CodeAgentModel | undefined) => {
  if (!model || model.input.includes("image")) return model;
  if (!catalogueMissesImages.has(`${model.provider}/${model.id}`)) return model;
  return { ...model, input: [...model.input, "image" as const] };
};

// An empty API key yields a successful empty response rather than an error, so unauthorized providers are skipped.
export const akanCodeModel = async (runtime: ModelRuntime, ref?: CodeAgentModelRef) => {
  if (ref) {
    const requested = runtime.getModel(ref.provider, ref.id);
    if (!requested) throw new Error(`Unknown model: ${ref.provider}/${ref.id}`);
    if (!runtime.hasConfiguredAuth(ref.provider))
      throw new Error(`No API key configured for ${ref.provider}. Set ${ref.provider.toUpperCase()}_API_KEY.`);
    return correctInputs(requested);
  }
  const fallback = runtime.getModel(akanCodeDefaultModel.provider, akanCodeDefaultModel.id);
  if (fallback && runtime.hasConfiguredAuth(fallback.provider)) return correctInputs(fallback);
  return correctInputs((await runtime.getAvailable())[0]);
};

export const akanCodeModelSupportsImages = (model: CodeAgentModel | undefined) => !!model?.input.includes("image");

// Deliberately the only check: `maxTokens >= contextWindow` or `reserveTokens > maxTokens` flag 1 model in 7.
export const akanCodeModelWarnings = (model: CodeAgentModel | undefined, compactionFloor: number) => {
  if (!model) return [];
  if (model.contextWindow >= compactionFloor) return [];
  return [
    `${model.provider}/${model.id} declares a ${model.contextWindow}-token context window, below the ${compactionFloor} the compaction policy needs, so every turn will compact immediately. Check the model entry in ~/.akan/code/models.json.`,
  ];
};
