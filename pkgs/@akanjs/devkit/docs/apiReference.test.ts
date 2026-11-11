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

  test("lists the keys of akan.config.ts, so the web and i18n shapes have a field to belong to", () => {
    const appConfig = rendered.slice(rendered.indexOf("### `AppConfigInput`"));
    expect(appConfig).toMatch(/^web\?: AkanWebOption;$/m);
    expect(appConfig).toMatch(/^i18n\?: DeepPartial<AkanI18nConfig>;$/m);
    expect(appConfig.indexOf("### `AkanWebOption`")).toBeGreaterThan(appConfig.indexOf("web?: AkanWebOption;"));
  });
});
