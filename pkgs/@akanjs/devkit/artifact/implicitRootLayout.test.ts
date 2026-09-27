import { describe, expect, test } from "bun:test";
import path from "node:path";
import { tempDirs, writeText as write } from "../testHelpers";
import { resolveSsrPageEntries } from "./implicitRootLayout";

const makeTempRoot = tempDirs("akan-implicit-root-layout-");

describe("resolveSsrPageEntries", () => {
  test("inherits root layout static exports for grouped root boundaries", async () => {
    const appRoot = await makeTempRoot();
    const pageRoot = path.join(appRoot, "page");
    const rootLayoutPath = path.join(pageRoot, "_layout.tsx");
    const groupedLayoutPath = path.join(pageRoot, "(home)", "_layout.tsx");

    await write(path.join(appRoot, "env", "env.client.ts"), "export const env = {};\n");
    await write(
      rootLayoutPath,
      'export const theme = "dark";\nexport const fonts = [{ name: "pretendard" }];\nexport const head = null;\n',
    );
    await write(
      groupedLayoutPath,
      "export function generateHead() { return null; }\nexport default function Layout({ children }) { return children; }\n",
    );

    const entries = await resolveSsrPageEntries({
      appCwdPath: appRoot,
      appName: "demo",
      pageKeys: ["./_layout.tsx", "./(home)/_layout.tsx", "./(home)/_index.tsx"],
    });

    const groupedRoot = entries.find((entry) => entry.key === "./(home)/__root_layout.tsx");
    expect(groupedRoot).toBeDefined();
    expect(groupedRoot?.seedAbsPaths).toContain(rootLayoutPath);
    expect(groupedRoot?.seedAbsPaths).toContain(groupedLayoutPath);

    const generatedSource = await Bun.file(groupedRoot?.moduleAbsPath ?? "").text();
    // Both user modules go through the route resolver, so a `rootLayout()` chain and the legacy exports read alike.
    expect(generatedSource).toContain('import * as inheritedModule from "../../../page/_layout.tsx";');
    expect(generatedSource).toContain("const inheritedLayout = resolveRouteModule(inheritedModule as never");
    expect(generatedSource).not.toContain("<System.Provider");
    expect(generatedSource).toContain("export async function generateHead(props: PageProps)");
    expect(generatedSource).toContain("if (userLayout.generateHead) return userLayout.generateHead(props);");
    expect(generatedSource).toContain("return inheritedLayout.head;");
    expect(generatedSource).not.toContain("generateMetadata");
    expect(generatedSource).toContain("export const NotFound = userLayout.NotFound ?? inheritedLayout.NotFound;");
    expect(generatedSource).toContain("export const Error = userLayout.Error ?? inheritedLayout.Error;");
    expect(generatedSource).toContain("export const pageConfig = userLayout.pageConfig ?? inheritedLayout.pageConfig;");
    expect(generatedSource).toContain(
      "<UserLayout params={params} searchParams={searchParams}>{children}</UserLayout>",
    );
  });

  test("keeps system provider for grouped root boundaries without an ancestor root", async () => {
    const appRoot = await makeTempRoot();
    const pageRoot = path.join(appRoot, "page");
    const groupedLayoutPath = path.join(pageRoot, "(home)", "_layout.tsx");

    await write(path.join(appRoot, "env", "env.client.ts"), "export const env = {};\n");
    await write(groupedLayoutPath, 'export const theme = "dark";\n');

    const entries = await resolveSsrPageEntries({
      appCwdPath: appRoot,
      appName: "demo",
      pageKeys: ["./(home)/_layout.tsx", "./(home)/_index.tsx"],
    });

    const groupedRoot = entries.find((entry) => entry.key === "./(home)/__root_layout.tsx");
    expect(groupedRoot).toBeDefined();

    const generatedSource = await Bun.file(groupedRoot?.moduleAbsPath ?? "").text();
    expect(generatedSource).toContain("<System.Provider");
    expect(generatedSource).toContain("theme={userLayout.theme ?? inheritedLayout.theme}");
    expect(generatedSource).toContain('import { allDictionary } from "../dict/useDict.ts";');
    expect(generatedSource).toContain(
      'allDictionary={process.env.AKAN_PUBLIC_RENDER_ENV === "ssr" ? allDictionary : undefined}',
    );
    expect(generatedSource).not.toContain("getAllDictionary");
    expect(generatedSource).not.toContain("// export default function GeneratedLayout");

    const generatedDictMacro = await Bun.file(path.join(appRoot, ".akan", "generated", "dict", "useDict.ts")).text();
    expect(generatedDictMacro).toContain(
      'import { getAllDictionary } from "@apps/demo/lib/dict" with { type: "macro" };',
    );
    expect(generatedDictMacro).toContain("export const allDictionary = getAllDictionary();");
  });

  test("awaits an async grouped root layout in the CSR bundle instead of mounting it as JSX", async () => {
    const appRoot = await makeTempRoot();
    const pageRoot = path.join(appRoot, "page");

    await write(path.join(appRoot, "env", "env.client.ts"), "export const env = {};\n");
    await write(
      path.join(pageRoot, "(user)", "_layout.tsx"),
      "export default async function Layout({ children }) { await Promise.resolve(); return <div>{children}</div>; }\n",
    );
    await write(
      path.join(pageRoot, "(sign)", "_layout.tsx"),
      "export default function Layout({ children }) { return children; }\n",
    );

    const entries = await resolveSsrPageEntries({
      appCwdPath: appRoot,
      appName: "demo",
      pageKeys: ["./(user)/_layout.tsx", "./(user)/self/_index.tsx", "./(sign)/_layout.tsx", "./(sign)/signin.tsx"],
    });

    const userRoot = entries.find((entry) => entry.key === "./(user)/__root_layout.tsx");
    const userSource = await Bun.file(userRoot?.moduleAbsPath ?? "").text();
    expect(userSource).toContain("<System.Provider");
    expect(userSource).toContain("export default async function GeneratedLayout(");
    expect(userSource).toContain('process.env.AKAN_PUBLIC_RENDER_ENV === "csr"');
    expect(userSource).toContain("? await UserLayout({ params, searchParams, children })");
    expect(userSource).toContain(": <UserLayout params={params} searchParams={searchParams}>{children}</UserLayout>;");
    expect(userSource).toContain("      {layout}\n    </System.Provider>");

    const signRoot = entries.find((entry) => entry.key === "./(sign)/__root_layout.tsx");
    const signSource = await Bun.file(signRoot?.moduleAbsPath ?? "").text();
    expect(signSource).toContain("<System.Provider");
    expect(signSource).toContain("export default function GeneratedLayout(");
    expect(signSource).not.toContain("await UserLayout(");
    expect(signSource).toContain(
      "      <UserLayout params={params} searchParams={searchParams}>{children}</UserLayout>\n    </System.Provider>",
    );
  });

  test("returns the awaited node directly for an async nested root boundary", async () => {
    const appRoot = await makeTempRoot();
    const pageRoot = path.join(appRoot, "page");

    await write(path.join(appRoot, "env", "env.client.ts"), "export const env = {};\n");
    await write(
      path.join(pageRoot, "_layout.tsx"),
      "export default function Layout({ children }) { return children; }\n",
    );
    await write(
      path.join(pageRoot, "(home)", "_layout.tsx"),
      "const Layout = async ({ children }) => children;\nexport default Layout;\n",
    );

    const entries = await resolveSsrPageEntries({
      appCwdPath: appRoot,
      appName: "demo",
      pageKeys: ["./_layout.tsx", "./(home)/_layout.tsx", "./(home)/_index.tsx"],
    });

    const groupedRoot = entries.find((entry) => entry.key === "./(home)/__root_layout.tsx");
    const generatedSource = await Bun.file(groupedRoot?.moduleAbsPath ?? "").text();
    expect(generatedSource).not.toContain("<System.Provider");
    expect(generatedSource).toContain("export default async function GeneratedLayout(");
    expect(generatedSource).toContain("? await UserLayout({ params, searchParams, children })");
    expect(generatedSource).toContain("  return layout;\n}");
  });

  test("prunes generated wrappers whose route file moved away", async () => {
    const appRoot = await makeTempRoot();
    const pageRoot = path.join(appRoot, "page");
    await write(path.join(appRoot, "env", "env.client.ts"), "export const env = {};\n");
    await write(path.join(pageRoot, "a", "_overrides.tsx"), "export default {};\n");
    await write(path.join(pageRoot, "b", "_overrides.tsx"), "export default {};\n");
    await write(path.join(pageRoot, "(home)", "_layout.tsx"), "export default ({ children }) => children;\n");
    const resolve = async (pageKeys: string[]) =>
      await resolveSsrPageEntries({ appCwdPath: appRoot, appName: "demo", pageKeys });
    const generatedPaths = async (pageKeys: string[]) =>
      (await resolve(pageKeys))
        .filter((entry) => entry.moduleAbsPath.includes(`${path.sep}.akan${path.sep}`))
        .map((entry) => entry.moduleAbsPath);

    const before = await generatedPaths(["./(home)/_layout.tsx", "./a/_overrides.tsx", "./a/x.tsx"]);
    const after = await generatedPaths(["./b/_overrides.tsx", "./b/y.tsx"]);

    expect(before).toHaveLength(2);
    for (const stale of before) expect(await Bun.file(stale).exists()).toBe(false);
    expect(after).toHaveLength(2);
    for (const fresh of after) expect(await Bun.file(fresh).exists()).toBe(true);
  });
});
