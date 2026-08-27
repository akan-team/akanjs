import { afterEach, describe, expect, test } from "bun:test";

import { isBasePathRootLayout } from "./routeTreeBuilder";

const ORIGINAL_BASE_PATHS = process.env.AKAN_PUBLIC_BASE_PATHS;

afterEach(() => {
  if (ORIGINAL_BASE_PATHS === undefined) delete process.env.AKAN_PUBLIC_BASE_PATHS;
  else process.env.AKAN_PUBLIC_BASE_PATHS = ORIGINAL_BASE_PATHS;
});

describe("isBasePathRootLayout", () => {
  // The implicit-root-layout generator reads root props (wsConnect, theme, ...) from a
  // base-path root layout, so the export validator must treat it as a root layout;
  // otherwise the documented options are undeclarable in a multi-basePath app.
  test("recognizes a base-path root layout, relative or absolute key", () => {
    process.env.AKAN_PUBLIC_BASE_PATHS = "web,admin";

    expect(isBasePathRootLayout("./page/admin/_layout.tsx")).toBe(true);
    expect(isBasePathRootLayout("/abs/path/apps/tetherbit/page/web/_layout.tsx")).toBe(true);
  });

  test("rejects nested layouts, unknown base paths, and no basePaths config", () => {
    process.env.AKAN_PUBLIC_BASE_PATHS = "web,admin";

    expect(isBasePathRootLayout("./page/admin/users/_layout.tsx")).toBe(false);
    expect(isBasePathRootLayout("./page/shop/_layout.tsx")).toBe(false);

    delete process.env.AKAN_PUBLIC_BASE_PATHS;
    expect(isBasePathRootLayout("./page/admin/_layout.tsx")).toBe(false);
  });
});
