import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";
import { AsyncDefaultExportDetector } from "../transforms/asyncDefaultExportDetector";

export interface PageEntry {
  key: string;
  moduleAbsPath: string;
  seedAbsPaths?: string[];
}

const LAYOUT_KEY_RE = /^\.\/(.+\/)?_layout\.(tsx|ts|jsx|js)$/;

const IMPLICIT_LAYOUT_DIR = path.join(".akan", "generated", "root-layouts");
const IMPLICIT_DICT_DIR = path.join(".akan", "generated", "dict");
const IMPLICIT_OVERRIDES_DIR = path.join(".akan", "generated", "overrides");
const OVERRIDES_KEY_RE = /^\.\/(.+\/)?_overrides\.(tsx|ts|jsx|js)$/;

const importSpecifier = (fromAbsPath: string, toAbsPath: string) => {
  const rel = path.relative(path.dirname(fromAbsPath), toAbsPath).split(path.sep).join("/");
  return rel.startsWith(".") ? rel : `./${rel}`;
};

// UiOverrideProvider is a client component, so `_overrides.tsx` mounts through a generated "use client" layout.
async function writeGeneratedOverridesLayoutFile(opts: {
  appCwdPath: string;
  key: string;
  userAbsPath: string;
}): Promise<string> {
  const filename = `${opts.key.replace(/^\.\//, "").replace(/[^a-zA-Z0-9]+/g, "_")}.tsx`;
  const absPath = path.join(path.resolve(opts.appCwdPath), IMPLICIT_OVERRIDES_DIR, filename);
  const source = `"use client";
import { UiOverrideProvider } from "akanjs/ui";
import { createElement, type ReactNode } from "react";
import value from ${JSON.stringify(importSpecifier(absPath, opts.userAbsPath))};

export default function AkanUiOverridesLayout({ children }: { children?: ReactNode }) {
  return createElement(UiOverrideProvider, { value }, children);
}
`;
  await Bun.write(absPath, source);
  return absPath;
}

async function pruneGeneratedFiles(dirAbsPath: string, keepAbsPaths: string[]): Promise<void> {
  const keep = new Set(keepAbsPaths);
  const names = await readdir(dirAbsPath).catch(() => [] as string[]);
  await Promise.all(
    names
      .map((name) => path.join(dirAbsPath, name))
      .filter((absPath) => !keep.has(absPath))
      .map((absPath) => rm(absPath, { force: true })),
  );
}

interface RootBoundary {
  sourceKey: string | null;
  sourceAbsPath: string | null;
  segments: string[];
}

export function getRootBoundarySegments(key: string): string[] | null {
  const match = LAYOUT_KEY_RE.exec(key);
  if (!match) return null;
  const prefix = match[1]?.replace(/\/$/, "");
  if (!prefix) return [];
  return prefix.split("/").filter(Boolean);
}

function implicitRootLayoutKey(segments: string[]): string {
  return `./${[...segments, "__root_layout"].join("/")}.tsx`;
}

function implicitRootLayoutAbsPath(appCwdPath: string, segments: string[]): string {
  const filename = segments.length ? `${segments.join("__")}__root_layout.tsx` : "__root_layout.tsx";
  return path.join(path.resolve(appCwdPath), IMPLICIT_LAYOUT_DIR, filename);
}

export function isRootBoundarySegments(segments: string[], basePaths: Iterable<string>): boolean {
  const firstVisibleIndex = segments.findIndex((segment) => !/^\(.+\)$/.test(segment));
  if (firstVisibleIndex === -1) return segments.length <= 1;
  if (segments.slice(firstVisibleIndex + 1).some((segment) => /^\(.+\)$/.test(segment))) return false;
  const visible = segments.slice(firstVisibleIndex);
  const allowedBasePaths = new Set([...basePaths].map((basePath) => basePath.trim()).filter(Boolean));
  return visible.length === 1 && (firstVisibleIndex > 0 || allowedBasePaths.has(visible[0] ?? ""));
}

function findRootBoundaries(pageKeys: string[], appCwdPath: string, basePaths: Iterable<string>): RootBoundary[] {
  const boundaries = new Map<string, RootBoundary>();
  for (const key of pageKeys) {
    const segments = getRootBoundarySegments(key);
    if (!segments) continue;
    if (!isRootBoundarySegments(segments, basePaths)) continue;
    const id = segments.join("/");
    boundaries.set(id, {
      sourceKey: key,
      sourceAbsPath: path.resolve(appCwdPath, "page", key.replace(/^\.\//, "")),
      segments,
    });
  }
  if (boundaries.size === 0) boundaries.set("", { sourceKey: null, sourceAbsPath: null, segments: [] });
  return [...boundaries.values()].sort((a, b) => a.segments.join("/").localeCompare(b.segments.join("/")));
}

function hasAncestorRootBoundary(boundary: RootBoundary, boundaries: RootBoundary[]): boolean {
  return boundaries.some(
    (candidate) =>
      candidate !== boundary &&
      candidate.segments.length < boundary.segments.length &&
      candidate.segments.every((segment, index) => boundary.segments[index] === segment),
  );
}

function findExplicitRootLayoutAbsPath(pageKeys: string[], appCwdPath: string): string | null {
  const rootLayoutKey = pageKeys.find((key) => {
    const segments = getRootBoundarySegments(key);
    return segments !== null && segments.length === 0;
  });
  return rootLayoutKey ? path.resolve(appCwdPath, "page", rootLayoutKey.replace(/^\.\//, "")) : null;
}

async function assertEnvClientConvention(appCwdPath: string, appName: string) {
  const envPath = path.join(appCwdPath, "env", "env.client.ts");
  if (!(await Bun.file(envPath).exists())) {
    throw new Error(
      `[route-convention] app "${appName}" must provide env/env.client.ts exporting "env" for generated System.Provider`,
    );
  }
}

async function writeGeneratedDictionaryMacroFile(appCwdPath: string, appName: string): Promise<string> {
  const absPath = path.join(path.resolve(appCwdPath), IMPLICIT_DICT_DIR, "useDict.ts");
  await Bun.write(
    absPath,
    `import { getAllDictionary } from "@apps/${appName}/lib/dict" with { type: "macro" };

export const allDictionary = getAllDictionary();
`,
  );
  return absPath;
}

async function writeGeneratedRootLayoutFile(opts: {
  appCwdPath: string;
  appName: string;
  boundary: RootBoundary;
  rootSourceAbsPath: string | null;
  includeStInit: boolean;
  includeSystemProvider: boolean;
}): Promise<string> {
  await assertEnvClientConvention(opts.appCwdPath, opts.appName);
  const dictMacroAbsPath = opts.includeSystemProvider
    ? await writeGeneratedDictionaryMacroFile(opts.appCwdPath, opts.appName)
    : null;
  const absPath = implicitRootLayoutAbsPath(opts.appCwdPath, opts.boundary.segments);
  const dictMacroSpecifier = dictMacroAbsPath ? importSpecifier(absPath, dictMacroAbsPath) : null;
  const sourceSpecifier = opts.boundary.sourceAbsPath ? importSpecifier(absPath, opts.boundary.sourceAbsPath) : null;
  const inheritedSourceAbsPath =
    opts.rootSourceAbsPath && opts.rootSourceAbsPath !== opts.boundary.sourceAbsPath ? opts.rootSourceAbsPath : null;
  const inheritedSourceSpecifier = inheritedSourceAbsPath ? importSpecifier(absPath, inheritedSourceAbsPath) : null;
  const clientImport = opts.includeStInit
    ? `import { st } from "@apps/${opts.appName}/client";\nvoid st;\n`
    : `import "@apps/${opts.appName}/client";\n`;
  //? resolveRouteModule reads a rootLayout() chain and the legacy named exports alike.
  const inheritedLabel = inheritedSourceAbsPath ? path.relative(opts.appCwdPath, inheritedSourceAbsPath) : "";
  const inheritedImport = inheritedSourceSpecifier
    ? `import * as inheritedModule from ${JSON.stringify(inheritedSourceSpecifier)};\nconst inheritedLayout = resolveRouteModule(inheritedModule as never, ${JSON.stringify(inheritedLabel)}).module as LayoutModule;\n`
    : "const inheritedLayout: LayoutModule = {};\n";
  const prefix = opts.boundary.segments.find((segment) => !/^\(.+\)$/.test(segment)) ?? null;
  const userLabel = opts.boundary.sourceAbsPath ? path.relative(opts.appCwdPath, opts.boundary.sourceAbsPath) : "";
  const userImport = sourceSpecifier
    ? `import * as userModule from ${JSON.stringify(sourceSpecifier)};\nconst userLayout = resolveRouteModule(userModule as never, ${JSON.stringify(userLabel)}).module as LayoutModule;\nconst UserLayout = userLayout.default as (props: LayoutProps) => ReactNode | Promise<ReactNode>;\n`
    : "const UserLayout = ({ children }: LayoutProps) => children;\nconst userLayout: LayoutModule = {};\n";
  const isAsyncUserLayout = opts.boundary.sourceAbsPath
    ? await AsyncDefaultExportDetector.detect(opts.boundary.sourceAbsPath)
    : false;
  const userLayoutElement = "<UserLayout params={params} searchParams={searchParams}>{children}</UserLayout>";
  // React has no async client component, so CSR awaits an async layout's node; RSC keeps the element, since
  // awaiting there would hold the shell behind the layout's own awaits instead of streaming it.
  const layoutSignature = isAsyncUserLayout
    ? "export default async function GeneratedLayout"
    : "export default function GeneratedLayout";
  const layoutBinding = isAsyncUserLayout
    ? `  const layout =
    process.env.AKAN_PUBLIC_RENDER_ENV === "csr"
      ? await UserLayout({ params, searchParams, children })
      : ${userLayoutElement};
`
    : "";
  const layoutChild = isAsyncUserLayout ? "{layout}" : userLayoutElement;
  const layoutReturn = isAsyncUserLayout ? "layout" : userLayoutElement;
  const layoutExports = `export async function generateHead(props: PageProps) {
  if (userLayout.generateHead) return userLayout.generateHead(props);
  if (userLayout.head !== undefined) return userLayout.head;
  if (inheritedLayout.generateHead) return inheritedLayout.generateHead(props);
  return inheritedLayout.head;
}

export const NotFound = userLayout.NotFound ?? inheritedLayout.NotFound;
export const Error = userLayout.Error ?? inheritedLayout.Error;
export const pageConfig = userLayout.pageConfig ?? inheritedLayout.pageConfig;

${layoutSignature}({ children, params, searchParams }: LayoutProps) {
${layoutBinding}  return `;
  const source = opts.includeSystemProvider
    ? `import type { LayoutModule, LayoutProps, PageProps } from "akanjs/client";
import { loadFonts, resolveRouteModule } from "akanjs/client";
import type { ReactNode } from "react";
import { System } from "akanjs/ui";
import { env } from "@apps/${opts.appName}/env/env.client";
import { allDictionary } from ${JSON.stringify(dictMacroSpecifier)};
${clientImport}${inheritedImport}${userImport}
const userFonts = userLayout.fonts ?? inheritedLayout.fonts ?? [];
const defaultFonts = userFonts.filter((font) => font.default);
if (defaultFonts.length > 1) throw new Error("[route-convention] only one default font is allowed per root layout");
const defaultFont = defaultFonts[0];
const defaultFontClassName = defaultFont ? (defaultFont.className ?? \`font-\${defaultFont.name}\`) : undefined;

${layoutExports}(
    <System.Provider
      of={GeneratedLayout as never}
      appName=${JSON.stringify(opts.appName)}
      ${prefix ? `prefix=${JSON.stringify(prefix)}\n      ` : ""}params={params}
      manifest={userLayout.manifest ?? inheritedLayout.manifest}
      env={env}
      theme={userLayout.theme ?? inheritedLayout.theme}
      fonts={loadFonts(userFonts)}
      className={defaultFontClassName}
      layoutStyle={userLayout.layoutStyle ?? inheritedLayout.layoutStyle}
      reconnect={userLayout.reconnect ?? inheritedLayout.reconnect ?? false}
      wsConnect={userLayout.wsConnect ?? inheritedLayout.wsConnect ?? true}
      allDictionary={process.env.AKAN_PUBLIC_RENDER_ENV === "ssr" ? allDictionary : undefined}
    >
      ${layoutChild}
    </System.Provider>
  );
}
`
    : `import type { LayoutModule, LayoutProps, PageProps } from "akanjs/client";
import { resolveRouteModule } from "akanjs/client";
import type { ReactNode } from "react";
${inheritedImport}${userImport}
${layoutExports}${layoutReturn};
}
`;
  await Bun.write(absPath, source);
  return absPath;
}

export async function resolveSsrPageEntries(opts: {
  appCwdPath: string;
  appName: string;
  pageKeys: string[];
  basePaths?: Iterable<string>;
}): Promise<PageEntry[]> {
  const absPageDir = path.resolve(opts.appCwdPath, "page");
  const hasSt = await Bun.file(path.join(opts.appCwdPath, "lib", "st.ts")).exists();
  const basePaths = opts.basePaths ?? [];
  const rootSourceAbsPath = findExplicitRootLayoutAbsPath(opts.pageKeys, opts.appCwdPath);
  const rootBoundaries = findRootBoundaries(opts.pageKeys, opts.appCwdPath, basePaths);
  const rootLayoutKeys = new Set(
    opts.pageKeys.filter((key) => {
      const segments = getRootBoundarySegments(key);
      return segments !== null && isRootBoundarySegments(segments, basePaths);
    }),
  );
  const base = await Promise.all(
    opts.pageKeys
      .filter((key) => !rootLayoutKeys.has(key))
      .map(async (key) => {
        const userAbsPath = path.resolve(absPageDir, key);
        //? The raw manifest is a seed, so it and its slot components enter the client graph and RSC client manifest.
        if (OVERRIDES_KEY_RE.test(key)) {
          const moduleAbsPath = await writeGeneratedOverridesLayoutFile({
            appCwdPath: opts.appCwdPath,
            key,
            userAbsPath,
          });
          return { key, moduleAbsPath, seedAbsPaths: [userAbsPath] };
        }
        return { key, moduleAbsPath: userAbsPath };
      }),
  );
  const generated = await Promise.all(
    rootBoundaries.map(async (boundary) => ({
      key: implicitRootLayoutKey(boundary.segments),
      moduleAbsPath: await writeGeneratedRootLayoutFile({
        appCwdPath: opts.appCwdPath,
        appName: opts.appName,
        boundary,
        rootSourceAbsPath,
        includeStInit: hasSt && boundary.segments.length === 0,
        includeSystemProvider: !hasAncestorRootBoundary(boundary, rootBoundaries),
      }),
      seedAbsPaths: [...new Set([boundary.sourceAbsPath, rootSourceAbsPath].filter((absPath) => absPath !== null))],
    })),
  );
  //? A moved `_overrides.tsx` or root layout leaves a wrapper importing a file that is gone.
  const appCwdAbsPath = path.resolve(opts.appCwdPath);
  await Promise.all([
    pruneGeneratedFiles(
      path.join(appCwdAbsPath, IMPLICIT_OVERRIDES_DIR),
      base.filter(({ key }) => OVERRIDES_KEY_RE.test(key)).map(({ moduleAbsPath }) => moduleAbsPath),
    ),
    pruneGeneratedFiles(
      path.join(appCwdAbsPath, IMPLICIT_LAYOUT_DIR),
      generated.map(({ moduleAbsPath }) => moduleAbsPath),
    ),
  ]);
  return [...base, ...generated].sort((a, b) => a.key.localeCompare(b.key));
}

export async function resolveSsrPageEntriesForApp(app: App, pageKeys: string[]): Promise<PageEntry[]> {
  const config = await app.getConfig();
  return resolveSsrPageEntries({ appCwdPath: app.cwdPath, appName: app.name, pageKeys, basePaths: config.basePaths });
}
