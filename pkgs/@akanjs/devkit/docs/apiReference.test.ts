import { describe, expect, test } from "bun:test";
import path from "node:path";
import { AgentAssets } from "../guideline/agentAssets";
import { ApiReference } from "./apiReference";

const akanjsDir = path.resolve(import.meta.dir, "../../../akanjs");
const target = ApiReference.target(path.resolve(import.meta.dir, "../../cli"));

describe("ApiReference", () => {
  const rendered = ApiReference.render(akanjsDir);

  test("the committed guideline matches the akanjs sources; regenerate with bun pkgs/@akanjs/devkit/docs/apiReference.ts", async () => {
    expect(await Bun.file(target).text()).toBe(rendered);
  });

  test("fits one skill reference part", () => {
    expect(AgentAssets.split(rendered)).toHaveLength(1);
    expect(rendered.length).toBeLessThanOrEqual(AgentAssets.referenceLimit);
  });

  test("prints builder parameters, the import block and documented options", () => {
    expect(rendered).toContain('import { adapt, serve } from "akanjs/service";');
    expect(rendered).toContain('import { layout, page, rootLayout, router } from "akanjs/client";');
    expect(rendered).toMatch(/^query<.+>\(returnRef: Returns, signalOption\?: SignalOption<Returns, Nullable>\)$/m);
    expect(rendered).toMatch(/^\.param<.+>\(name: .+, type: Type, option\?: RouteArgOption\)$/m);
    expect(rendered).toMatch(/^\.render\(render: \(args: RouteBaseArgs & LayoutExtra\) => .+\)$/m);
    expect(rendered).toMatch(/children: ReactNode/);
    expect(rendered).toMatch(/^\/\*\* .+ \*\/\nserverMode\?: "batch" \| "federation";$/m);
  });

  test("says under an entry what its signature cannot: a search is always optional, an adaptor has a logger and hooks", () => {
    expect(rendered).toMatch(/^\.search<.+option\?: Omit<EndpointArgProps, "nullable">\)$/m);
    expect(rendered).toMatch(
      /^```\n\n`\.search\(\)` is always optional and takes no `nullable`: .+`T \| undefined`\./m,
    );
    expect(rendered).toMatch(
      /^```\n\nA class extending `adapt\(name\)` has `this\.logger`; .+`onInit\(\)` .+`onDestroy\(\)` .+\.$/m,
    );
  });

  test("says what each listed subpath holds, and lists only subpaths the package exports", async () => {
    const exports = Object.keys((await Bun.file(path.join(akanjsDir, "package.json")).json()).exports);
    const listed = [...rendered.matchAll(/^- `akanjs\/([^`]+)` — .+\.$/gm)].map(([, subpath]) => `./${subpath}`);
    expect(listed).toEqual(
      ["dictionary", "document", "service", "store", "client/native", "native/desktop", "test"].map((s) => `./${s}`),
    );
    for (const subpath of listed) expect(exports).toContain(subpath);
  });

  test("says what Link takes beyond its own props, and names its static parts", () => {
    expect(rendered).toContain('Every prop of `Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">`, and:');
    expect(rendered).toMatch(/^Link\.Back\(.+\): Element$/m);
  });

  test("lists the keys of akan.config.ts, so the web and i18n shapes have a field to belong to", () => {
    const appConfig = rendered.slice(rendered.indexOf("### `AppConfigInput`"));
    expect(appConfig).toMatch(/^web\?: AkanWebOption;$/m);
    expect(appConfig).toMatch(/^i18n\?: DeepPartial<AkanI18nConfig>;$/m);
    expect(appConfig.indexOf("### `AkanWebOption`")).toBeGreaterThan(appConfig.indexOf("web?: AkanWebOption;"));
  });
});
