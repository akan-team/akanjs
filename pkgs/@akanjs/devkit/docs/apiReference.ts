import path from "node:path";
import { DeclarationReader, type MemberFilter } from "./declarationReader";

type Show =
  | { kind: "signature" }
  | ({ kind: "members" } & MemberFilter)
  | { kind: "props"; omit?: string[] }
  | { kind: "declaration" };

interface Item {
  name: string;
  from?: string;
  file?: string;
  show: Show;
}

interface Section {
  title: string;
  intro?: string;
  items: Item[];
  routeStages?: boolean;
}

const sections: Section[] = [
  {
    title: "Routes (`page/`)",
    items: [
      { name: "page", from: "akanjs/client", show: { kind: "signature" } },
      { name: "layout", from: "akanjs/client", show: { kind: "signature" } },
      { name: "rootLayout", from: "akanjs/client", show: { kind: "signature" } },
      { name: "RouteBaseArgs", file: "client/route/routeArgs.ts", show: { kind: "props" } },
      {
        name: "router",
        from: "akanjs/client",
        show: {
          kind: "members",
          only: [
            "push",
            "replace",
            "back",
            "backOrFallback",
            "refresh",
            "redirect",
            "notFound",
            "canGoBack",
            "getPath",
          ],
        },
      },
      { name: "RouteOptions", file: "client/router.ts", show: { kind: "props" } },
      { name: "Link", from: "akanjs/ui", show: { kind: "signature" } },
      { name: "CommonLinkProps", file: "ui/Link/Anchor.tsx", show: { kind: "props" } },
      { name: "usePageLocation", from: "akanjs/webkit", show: { kind: "signature" } },
    ],
    routeStages: true,
  },
  {
    title: "Services and adapters (`lib/_<service>/`, `srvkit/`)",
    items: [
      { name: "adapt", from: "akanjs/service", show: { kind: "signature" } },
      { name: "serve", from: "akanjs/service", show: { kind: "signature" } },
      { name: "ServiceOptions", file: "service/serve.ts", show: { kind: "props" } },
    ],
  },
  {
    title: "Endpoints (`*.signal.ts`)",
    intro:
      "`endpoint(srv.<module>, ({ query, mutation, pubsub, message }) => ({ … }))`: each builder takes the return type and a `SignalOption`, then chains the stages below and ends in `.exec()`.",
    items: [
      { name: "endpoint", from: "akanjs/signal", show: { kind: "signature" } },
      { name: "BuildEndpoint", file: "signal/endpointInfo.ts", show: { kind: "members", prefix: "" } },
      {
        name: "EndpointInfo",
        file: "signal/endpointInfo.ts",
        show: { kind: "members", only: ["param", "search", "body", "room", "msg", "with", "exec"] },
      },
      { name: "EndpointArgProps", file: "signal/endpointInfo.ts", show: { kind: "props" } },
      {
        name: "SignalOption",
        file: "signal/types.ts",
        show: {
          kind: "props",
          omit: ["live", "lock", "onFailed", "once", "scheduleCron", "scheduleTime", "scheduleType"],
        },
      },
    ],
  },
  {
    title: "Dictionaries (`*.dictionary.ts`)",
    items: [
      { name: "serviceDictionary", from: "akanjs/dictionary", show: { kind: "signature" } },
      { name: "FunctionTranslation", file: "dictionary/dictInfo.ts", show: { kind: "members" } },
      { name: "FieldTranslation", file: "dictionary/dictInfo.ts", show: { kind: "members" } },
    ],
  },
  {
    title: "App config (`akan.config.ts`)",
    items: [
      { name: "AppConfig", from: "akanjs", show: { kind: "declaration" } },
      { name: "AppConfigInput", from: "akanjs", show: { kind: "props" } },
      { name: "AkanWebOption", from: "akanjs", show: { kind: "declaration" } },
      { name: "AkanI18nConfig", file: "common/localeConfig.ts", show: { kind: "props" } },
    ],
  },
];

const importOnly: Record<string, string[]> = {
  "akanjs/base": ["Any", "Binary", "dayjs", "Float", "ID", "Int", "Upload"],
  "akanjs/signal": ["internal", "None", "Public"],
};

const conventionImports = [
  'import { fetch, usePage, <Model> } from "@apps/<app>/client"; // pages and UI',
  'import * as cnst from "../cnst"; // inside lib/<module>/, beside srv and Err',
  'import { Err } from "../dict";',
  'import * as srv from "../srv";',
  'import { BookApi } from "@apps/<app>/srvkit"; // a layer barrel: common, srvkit, ui, webkit',
  'import { signedIn } from "@libs/shared/webkit"; // a workspace created with --libs true',
];

const routeInternals = ["assertPattern", "resolveArgs", "toRouteModule"];

export class ApiReference {
  static readonly guideline = "akanApi";

  static target(cliDir: string) {
    return path.join(cliDir, "guidelines", ApiReference.guideline, `${ApiReference.guideline}.instruction.md`);
  }

  static render(akanjsDir: string): string {
    const reader = new DeclarationReader(akanjsDir);
    const imports = new Map<string, Set<string>>();
    const body: string[] = [];
    for (const section of sections) {
      body.push(`## ${section.title}`, "");
      if (section.intro) body.push(section.intro, "");
      const blocks: string[] = [];
      for (const item of section.items) {
        if (item.from) ApiReference.#addImport(imports, item.from, item.name, reader);
        blocks.push(ApiReference.#renderItem(reader, item));
      }
      if (section.routeStages) blocks.push(ApiReference.#routeStages(reader));
      body.push(...blocks.flatMap((block) => [block, ""]));
    }
    for (const [from, names] of Object.entries(importOnly))
      for (const name of names) ApiReference.#addImport(imports, from, name, reader);
    const importLines = [...imports.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([from, names]) => `import { ${[...names].sort((a, b) => a.localeCompare(b)).join(", ")} } from "${from}";`);
    return [
      "# Akan.js API reference",
      "",
      "Generated from the akanjs sources of this release: the import paths and signatures a first app needs, so none of",
      "them has to be looked up in `node_modules`. A stage's return type is the same chain, left out below.",
      "",
      "## Imports",
      "",
      "```ts",
      ...importLines,
      ...conventionImports,
      "```",
      "",
      ...body,
    ]
      .join("\n")
      .trimEnd()
      .concat("\n");
  }

  static #addImport(imports: Map<string, Set<string>>, from: string, name: string, reader: DeclarationReader) {
    reader.exported(from, name);
    if (from === "akanjs") return;
    const names = imports.get(from) ?? new Set<string>();
    names.add(name);
    imports.set(from, names);
  }

  static #renderItem(reader: DeclarationReader, item: Item): string {
    const symbol = item.from ? reader.exported(item.from, item.name) : reader.declared(item.file ?? "", item.name);
    const where = item.from ? ` · \`${item.from}\`` : "";
    const heading = `### \`${item.name}\`${where}`;
    if (item.show.kind === "declaration")
      return [heading, "", "```ts", reader.declarationText(symbol), "```"].join("\n");
    if (item.show.kind === "signature")
      return [heading, "", "```ts", ...reader.signatures(symbol, item.name), "```"].join("\n");
    if (item.show.kind === "props")
      return [heading, "", "```ts", ...reader.props(reader.declaredType(symbol), item.show.omit), "```"].join("\n");
    const members = reader.members(reader.instanceType(symbol), item.show);
    return [heading, "", "```ts", ...members.map(([, line]) => line), "```"].join("\n");
  }

  static #routeStages(reader: DeclarationReader): string {
    const stagesOf = (name: string) =>
      new Map(
        reader.members(reader.instanceType(reader.exported("akanjs/client", name)), {
          omit: name === "page" ? [...routeInternals, "loadApp"] : routeInternals,
        }),
      );
    const page = stagesOf("page");
    const layout = stagesOf("layout");
    const root = stagesOf("rootLayout");
    const shared = [...page.keys()].filter((key) => layout.has(key) && root.has(key));
    const only = (stages: Map<string, string>, without: Map<string, string>[]) =>
      [...stages.entries()].filter(([key]) => without.every((other) => !other.has(key))).map(([, line]) => line);
    return [
      "### Route stages",
      "",
      "Shared by `page()`, `layout()` and `rootLayout()`:",
      "",
      "```ts",
      ...shared.map((key) => page.get(key) ?? ""),
      "```",
      "",
      "Only on `page()`:",
      "",
      "```ts",
      ...only(page, [layout, root]),
      "```",
      "",
      "On `layout()` and `rootLayout()`, where a line replaces its shared form above:",
      "",
      "```ts",
      reader.declarationText(reader.declared("client/route/LayoutDefinition.ts", "LayoutExtra")),
      ...[...layout.entries()].filter(([key, line]) => page.get(key) !== line).map(([, line]) => line),
      "```",
      "",
      "Only on `rootLayout()`, before `.param()` and `.search()`:",
      "",
      "```ts",
      ...only(root, [page, layout]),
      "```",
    ].join("\n");
  }
}

if (import.meta.main) {
  const akanjsDir = path.resolve(import.meta.dir, "../../../akanjs");
  const target = ApiReference.target(path.resolve(import.meta.dir, "../../cli"));
  await Bun.write(target, ApiReference.render(akanjsDir));
}
