import { describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  appRootAllowedDirs,
  appRootAllowedFiles,
  facetIndexShadowOf,
  isAllowedLibFacetRootFile,
  isScannedRootEntry,
  libFacetRootHintOf,
  libRootAllowedDirs,
  libRootAllowedFiles,
  moduleTestTargetOf,
  rootEntryHintOf,
} from "./workspaceLayout";

describe("app root layout allowlist", () => {
  test("admits the scoped agent guides sync writes into every app", () => {
    expect(appRootAllowedFiles.has("AGENTS.md")).toBe(true);
    expect(appRootAllowedFiles.has("CLAUDE.md")).toBe(true);
  });

  test("admits every documented app root folder", () => {
    for (const dirname of [".akan", "plugin", "script", "secrets", "srvkit", "webkit"]) {
      expect(appRootAllowedDirs.has(dirname)).toBe(true);
    }
  });

  test("admits the native plugins an app owns, and a lib too", () => {
    expect(appRootAllowedDirs.has("native")).toBe(true);
    expect(libRootAllowedDirs.has("native")).toBe(true);
  });

  test("rejects an app root entry no facet owns", () => {
    expect(appRootAllowedFiles.has("helper.ts")).toBe(false);
    expect(appRootAllowedDirs.has("base")).toBe(false);
  });

  test("names what a Capacitor app kept in its root as a leftover, not an unknown entry", () => {
    for (const name of ["android", "ios", "mobile", "capacitor.config.ts", "capacitor.config.json"]) {
      expect(appRootAllowedFiles.has(name) || appRootAllowedDirs.has(name)).toBe(false);
      expect(rootEntryHintOf("app", name)).toContain("dist/native/<app>/<target>");
    }
    expect(rootEntryHintOf("app", "base")).toBeNull();
    expect(rootEntryHintOf("lib", "ios")).toBeNull();
  });

  test("skips dotfile artifacts the sync glob never sees, but keeps .akan", () => {
    expect(isScannedRootEntry("app", ".DS_Store")).toBe(false);
    expect(isScannedRootEntry("app", ".akan")).toBe(true);
    expect(isScannedRootEntry("app", "lib")).toBe(true);
  });
});

describe("lib root layout allowlist", () => {
  test("admits what the libRoot template and scan write", () => {
    for (const filename of ["AGENTS.md", "akan.config.ts", "akan.lib.json", "client.ts", "index.ts", "server.ts"]) {
      expect(libRootAllowedFiles.has(filename)).toBe(true);
    }
    for (const dirname of ["common", "env", "lib", "page", "plugin", "private", "public", "srvkit", "ui", "webkit"]) {
      expect(libRootAllowedDirs.has(dirname)).toBe(true);
    }
  });

  test("rejects a lib root entry no facet owns", () => {
    expect(libRootAllowedFiles.has("helper.ts")).toBe(false);
    expect(libRootAllowedDirs.has("base")).toBe(false);
  });

  test("rejects the app-only run and mobile entries", () => {
    for (const filename of ["main.ts", "akan.app.json"]) {
      expect(libRootAllowedFiles.has(filename)).toBe(false);
    }
    for (const dirname of [".akan", "script", "secrets"]) {
      expect(libRootAllowedDirs.has(dirname)).toBe(false);
    }
  });

  test("skips dotfile artifacts in a lib root too", () => {
    expect(isScannedRootEntry("lib", ".gitignore")).toBe(false);
    expect(isScannedRootEntry("lib", ".akan")).toBe(false);
    expect(isScannedRootEntry("lib", "ui")).toBe(true);
  });
});

describe("hand-written facet index", () => {
  test("flags every index Bun resolves ahead of the generated barrel, at the root of each barrel facet", () => {
    for (const facet of ["ui", "webkit", "srvkit", "common", "plugin"])
      for (const filename of ["index.tsx", "index.jsx", "index.mts"])
        expect(facetIndexShadowOf(`${facet}/${filename}`)).toContain(`shadows the generated ${facet}/index.ts`);
    expect(facetIndexShadowOf("ui/index.tsx")).toContain("Delete it");
  });

  test("leaves the generated barrel, a folder namespace, and folders without a barrel alone", () => {
    for (const relativePath of [
      "ui/index.ts",
      "ui/index.js",
      "ui/Chat/index.tsx",
      "ui/Chat/index_.tsx",
      "page/index.tsx",
      "lib/index.tsx",
      "index.tsx",
    ])
      expect(facetIndexShadowOf(relativePath)).toBeNull();
  });
});

describe("lib facet root allowlist", () => {
  test("admits the generated support facets", () => {
    expect(isAllowedLibFacetRootFile("cnst.ts")).toBe(true);
    expect(isAllowedLibFacetRootFile("option.ts")).toBe(true);
  });

  test("rejects a hand-written file beside the barrels", () => {
    expect(isAllowedLibFacetRootFile("helper.ts")).toBe(false);
    expect(isAllowedLibFacetRootFile("user.test.ts")).toBe(false);
  });

  test("rejects a test at the lib root and points it at its module folder or srvkit", () => {
    for (const filename of ["cloud.signal.test.ts", "user.signal.spec.ts", "release.test.tsx"]) {
      expect(isAllowedLibFacetRootFile(filename)).toBe(false);
      expect(libFacetRootHintOf(filename)).toContain("lib/<model>/<model>.signal.test.ts");
      expect(libFacetRootHintOf(filename)).toContain("srvkit/");
    }
    expect(libFacetRootHintOf("helper.ts")).toBeNull();
  });
});

describe("module test target", () => {
  test("names the module file a test covers", () => {
    expect(moduleTestTargetOf("chatMessage.signal.test.ts")).toBe("chatMessage.signal.ts");
    expect(moduleTestTargetOf("chatMessage.signal.spec.ts")).toBe("chatMessage.signal.ts");
    expect(moduleTestTargetOf("ChatMessage.Zone.test.tsx")).toBe("ChatMessage.Zone.tsx");
    expect(moduleTestTargetOf("chatMessage.trim.signal.test.ts")).toBe("chatMessage.trim.signal.ts");
  });

  test("leaves a file that is not a test alone", () => {
    expect(moduleTestTargetOf("chatMessage.signal.ts")).toBeNull();
    expect(moduleTestTargetOf("chatMessage.testing.ts")).toBeNull();
  });
});

const templatesDir = path.join(import.meta.dir, "..", "cli", "templates");

type TsConfig = { references?: { path: string }[] };

const loadRootTemplate = async (dir: string): Promise<TsConfig> =>
  JSON.parse(await Bun.file(path.join(templatesDir, dir, "tsconfig.json.template")).text());

const templateDirsWithRootTsconfig = async (): Promise<string[]> => {
  const entries = await readdir(templatesDir, { withFileTypes: true });
  const dirs: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await Bun.file(path.join(templatesDir, entry.name, "tsconfig.json.template")).exists()) dirs.push(entry.name);
  }
  return dirs.sort((a, b) => a.localeCompare(b));
};

describe("cli root tsconfig templates vs workspace scan allowlists", () => {
  test("only the app and libRoot root templates may declare references", async () => {
    const dirs = await templateDirsWithRootTsconfig();
    for (const dir of ["app", "libRoot", "pkgRoot", "workspaceRoot"]) expect(dirs).toContain(dir);
    for (const dir of dirs) {
      const tsconfig = await loadRootTemplate(dir);
      if (!tsconfig.references) continue;
      expect(["app", "libRoot"], `${dir} template declares references`).toContain(dir);
    }
  });

  test("app template references stay inside appRootAllowedFiles", async () => {
    const tsconfig = await loadRootTemplate("app");
    for (const reference of tsconfig.references ?? []) {
      const filename = path.basename(reference.path);
      expect(appRootAllowedFiles.has(filename), `app template references "${reference.path}"`).toBe(true);
    }
  });

  test("libRoot template references stay inside libRootAllowedFiles", async () => {
    const tsconfig = await loadRootTemplate("libRoot");
    for (const reference of tsconfig.references ?? []) {
      const filename = path.basename(reference.path);
      expect(libRootAllowedFiles.has(filename), `libRoot template references "${reference.path}"`).toBe(true);
    }
  });

  test("pkgRoot and workspaceRoot templates declare no references", async () => {
    for (const dir of ["pkgRoot", "workspaceRoot"]) {
      const tsconfig = await loadRootTemplate(dir);
      expect(tsconfig.references, `${dir} template must not declare references`).toBeUndefined();
    }
  });
});
