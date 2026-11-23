import type { CodeAgentProviderInfo } from "akanjs/common";

export class CodeTuiModels {
  /** `DEEPSEEK_API_KEY` names the provider `deepseek`; the engine's ids are lower-kebab, so the map is exact. */
  static envKeyOf(provider: string) {
    return `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  }

  static readonly usage = [
    "/model <provider>/<id>   switch to it, e.g. /model deepseek/deepseek-v4-pro",
    "/model providers         every provider, and which ones have a key",
    "/model <provider>        what one provider offers",
  ];

  static list(catalogue: CodeAgentProviderInfo[]) {
    const ready = catalogue.filter((provider) => provider.authorized);
    const locked = catalogue.length - ready.length;
    if (!ready.length)
      return [
        "No provider has a key, so there is no model to switch to.",
        "",
        `Set <PROVIDER>_API_KEY in the workspace \`.env\` or your environment — ${CodeTuiModels.envKeyOf("deepseek")}, ${CodeTuiModels.envKeyOf("anthropic")}.`,
        "",
        ...CodeTuiModels.usage,
      ].join("\n");
    const rows = ready.flatMap((provider) => CodeTuiModels.#modelRows(provider));
    return [
      `${rows.length} model${rows.length === 1 ? "" : "s"} ready · ${ready.map((provider) => provider.id).join(", ")}`,
      "",
      ...CodeTuiModels.#table(rows),
      "",
      `${locked} more provider${locked === 1 ? "" : "s"} need a key — /model providers`,
      "",
      ...CodeTuiModels.usage,
    ].join("\n");
  }

  static providers(catalogue: CodeAgentProviderInfo[]) {
    const rows = catalogue.map((provider) => [
      provider.id,
      provider.authorized ? "ready" : "no key",
      `${provider.models.length} model${provider.models.length === 1 ? "" : "s"}`,
      provider.name,
    ]);
    return [
      `${catalogue.length} providers`,
      "",
      ...CodeTuiModels.#table(rows),
      "",
      "A provider is reached by setting <PROVIDER>_API_KEY — in the workspace `.env` or your environment,",
      "both of which are read at startup. /model <provider> lists what one offers.",
      "",
      ...CodeTuiModels.usage,
    ].join("\n");
  }

  static ofProvider(catalogue: CodeAgentProviderInfo[], id: string) {
    const provider = catalogue.find((entry) => entry.id === id);
    if (!provider) return undefined;
    const rows = CodeTuiModels.#modelRows(provider);
    const head = provider.authorized
      ? `${provider.name} · ${rows.length} models · ready`
      : `${provider.name} · ${rows.length} models · set ${CodeTuiModels.envKeyOf(provider.id)} to use it`;
    return [head, "", ...CodeTuiModels.#table(rows)].join("\n");
  }

  static #modelRows(provider: CodeAgentProviderInfo) {
    return provider.models.map((model) => [
      `${model.current ? "❯ " : "  "}${provider.id}/${model.id}`,
      model.name,
      model.contextWindow ? `${Math.round(model.contextWindow / 1000)}k ctx` : "",
    ]);
  }

  static #table(rows: string[][]) {
    const width = (at: number) => Math.max(0, ...rows.map((row) => (row[at] ?? "").length)) + 2;
    const columns = [width(0), width(1)];
    return rows.map((row) =>
      `${(row[0] ?? "").padEnd(columns[0] ?? 0)}${(row[1] ?? "").padEnd(columns[1] ?? 0)}${row[2] ?? ""}`.trimEnd(),
    );
  }
}
