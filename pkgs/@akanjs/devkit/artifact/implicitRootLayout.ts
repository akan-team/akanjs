import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { App } from "../commandDecorators";

export interface PageEntry {
  key: string;
  moduleAbsPath: string;
  seedAbsPaths?: string[];
}

const LAYOUT_KEY_RE = /^\.\/(.+\/)?_layout\.(tsx|ts|jsx|js)$/;

async function appHasStModule(appCwdPath: string): Promise<boolean> {
  return Bun.file(path.join(appCwdPath, "lib", "st.ts")).exists();
}

const IMPLICIT_LAYOUT_DIR = path.join(".akan", "generated", "root-layouts");
const IMPLICIT_DICT_DIR = path.join(".akan", "generated", "dict");

interface RootBoundary {
  sourceKey: string | null;
  sourceAbsPath: string | null;
  segments: string[];
}

function getRootBoundarySegments(key: string): string[] | null {
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

function implicitDictionaryMacroAbsPath(appCwdPath: string): string {
  return path.join(path.resolve(appCwdPath), IMPLICIT_DICT_DIR, "useDict.ts");
}

function isRootBoundarySegments(segments: string[], basePaths: Iterable<string>): boolean {
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
  const hasExplicitRootBoundary = [...boundaries.values()].some((boundary) => boundary.segments.length === 0);
  if (!hasExplicitRootBoundary && boundaries.size === 0) {
    boundaries.set("", { sourceKey: null, sourceAbsPath: null, segments: [] });
  }
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

function routePrefixForSegments(segments: string[]): string | null {
  const visible = segments.filter((segment) => !/^\(.+\)$/.test(segment));
  return visible[0] ?? null;
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
  const absPath = implicitDictionaryMacroAbsPath(appCwdPath);
  await mkdir(path.dirname(absPath), { recursive: true });
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
  await mkdir(path.dirname(absPath), { recursive: true });
  const dictMacroRel = dictMacroAbsPath
    ? path.relative(path.dirname(absPath), dictMacroAbsPath).split(path.sep).join("/")
    : null;
  const dictMacroSpecifier = dictMacroRel ? (dictMacroRel.startsWith(".") ? dictMacroRel : `./${dictMacroRel}`) : null;
  const sourceRel = opts.boundary.sourceAbsPath
    ? path.relative(path.dirname(absPath), opts.boundary.sourceAbsPath).split(path.sep).join("/")
    : null;
  const sourceSpecifier = sourceRel ? (sourceRel.startsWith(".") ? sourceRel : `./${sourceRel}`) : null;
  const inheritedSourceAbsPath =
    opts.rootSourceAbsPath && opts.rootSourceAbsPath !== opts.boundary.sourceAbsPath ? opts.rootSourceAbsPath : null;
  const inheritedSourceRel = inheritedSourceAbsPath
    ? path.relative(path.dirname(absPath), inheritedSourceAbsPath).split(path.sep).join("/")
    : null;
  const inheritedSourceSpecifier = inheritedSourceRel
    ? inheritedSourceRel.startsWith(".")
      ? inheritedSourceRel
      : `./${inheritedSourceRel}`
    : null;
  const clientImport = opts.includeStInit
    ? `import { st } from "@apps/${opts.appName}/client";\nvoid st;\n`
    : `import "@apps/${opts.appName}/client";\n`;
  const inheritedImport = inheritedSourceSpecifier
    ? `import * as inheritedLayout from ${JSON.stringify(inheritedSourceSpecifier)};\n`
    : "const inheritedLayout = {};\n";
  const prefix = routePrefixForSegments(opts.boundary.segments);
  const userImport = sourceSpecifier
    ? `import UserLayout, * as userLayout from ${JSON.stringify(sourceSpecifier)};\n`
    : "const UserLayout = ({ children }) => children;\nconst userLayout = {};\n";
  const source = opts.includeSystemProvider
    ? `import type { LayoutProps, PageProps } from "akanjs/client";
import { loadFonts } from "akanjs/client";
import { System } from "akanjs/ui";
import { env } from "@apps/${opts.appName}/env/env.client";
import { allDictionary } from ${JSON.stringify(dictMacroSpecifier)};
${clientImport}${inheritedImport}${userImport}
const userFonts = userLayout.fonts ?? inheritedLayout.fonts ?? [];
const defaultFonts = userFonts.filter((font) => font.default);
if (defaultFonts.length > 1) throw new Error("[route-convention] only one default font is allowed per root layout");
const defaultFont = defaultFonts[0];
const defaultFontClassName = defaultFont ? (defaultFont.className ?? \`font-\${defaultFont.name}\`) : undefined;

export async function generateHead(props: PageProps) {
  if (userLayout.generateHead) return userLayout.generateHead(props);
  if (userLayout.head !== undefined) return userLayout.head;
  if (inheritedLayout.generateHead) return inheritedLayout.generateHead(props);
  return inheritedLayout.head;
}

export async function generateMetadata(props: PageProps) {
  if (userLayout.generateMetadata) return userLayout.generateMetadata(props);
  if (userLayout.metadata !== undefined) return userLayout.metadata;
  if (inheritedLayout.generateMetadata) return inheritedLayout.generateMetadata(props);
  return inheritedLayout.metadata;
}

export const NotFound = userLayout.NotFound ?? inheritedLayout.NotFound;
export const Error = userLayout.Error ?? inheritedLayout.Error;
export const pageConfig = userLayout.pageConfig ?? inheritedLayout.pageConfig;

export default function GeneratedLayout({ children, params, searchParams }: LayoutProps) {
  return (
    <System.Provider
      of={GeneratedLayout as never}
      appName=${JSON.stringify(opts.appName)}
      ${prefix ? `prefix=${JSON.stringify(prefix)}\n      ` : ""}params={params}
      manifest={userLayout.manifest ?? inheritedLayout.manifest}
      env={env}
      theme={userLayout.theme ?? inheritedLayout.theme}
      fonts={loadFonts(userFonts)}
      className={defaultFontClassName}
      gaTrackingId={userLayout.gaTrackingId ?? inheritedLayout.gaTrackingId}
      layoutStyle={userLayout.layoutStyle ?? inheritedLayout.layoutStyle}
      reconnect={userLayout.reconnect ?? inheritedLayout.reconnect ?? false}
      wsConnect={userLayout.wsConnect ?? inheritedLayout.wsConnect ?? true}
      allDictionary={process.env.AKAN_PUBLIC_RENDER_ENV === "ssr" ? allDictionary : undefined}
    >
      <UserLayout params={params} searchParams={searchParams}>{children}</UserLayout>
    </System.Provider>
  );
}
`
    : `import type { LayoutProps, PageProps } from "akanjs/client";
${inheritedImport}${userImport}
export async function generateHead(props: PageProps) {
  if (userLayout.generateHead) return userLayout.generateHead(props);
  if (userLayout.head !== undefined) return userLayout.head;
  if (inheritedLayout.generateHead) return inheritedLayout.generateHead(props);
  return inheritedLayout.head;
}

export async function generateMetadata(props: PageProps) {
  if (userLayout.generateMetadata) return userLayout.generateMetadata(props);
  if (userLayout.metadata !== undefined) return userLayout.metadata;
  if (inheritedLayout.generateMetadata) return inheritedLayout.generateMetadata(props);
  return inheritedLayout.metadata;
}

export const NotFound = userLayout.NotFound ?? inheritedLayout.NotFound;
export const Error = userLayout.Error ?? inheritedLayout.Error;
export const pageConfig = userLayout.pageConfig ?? inheritedLayout.pageConfig;

export default function GeneratedLayout({ children, params, searchParams }: LayoutProps) {
  return <UserLayout params={params} searchParams={searchParams}>{children}</UserLayout>;
}
`;
  await Bun.write(absPath, source);
  return absPath;
}

/**
 * When no root `page/_layout.*` exists on disk, merge a generated implicit root layout
 * (with generated client runtime registration and optional `void st` when `lib/st.ts` exists).
 */
export async function resolveSsrPageEntries(opts: {
  appCwdPath: string;
  appName: string;
  pageKeys: string[];
  basePaths?: Iterable<string>;
}): Promise<PageEntry[]> {
  const absPageDir = path.resolve(opts.appCwdPath, "page");
  const hasSt = await appHasStModule(opts.appCwdPath);
  const basePaths = opts.basePaths ?? [];
  const rootSourceAbsPath = findExplicitRootLayoutAbsPath(opts.pageKeys, opts.appCwdPath);
  const rootBoundaries = findRootBoundaries(opts.pageKeys, opts.appCwdPath, basePaths);
  const rootLayoutKeys = new Set(
    opts.pageKeys.filter((key) => {
      const segments = getRootBoundarySegments(key);
      return segments !== null && isRootBoundarySegments(segments, basePaths);
    }),
  );
  const base = opts.pageKeys
    .filter((key) => !rootLayoutKeys.has(key))
    .map((key) => ({
      key,
      moduleAbsPath: path.resolve(absPageDir, key),
    }));
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
  const entries = [...base, ...generated];
  entries.sort((a, b) => a.key.localeCompare(b.key));
  return entries;
}

export async function resolveSsrPageEntriesForApp(app: App, pageKeys: string[]): Promise<PageEntry[]> {
  const config = await app.getConfig();
  return resolveSsrPageEntries({ appCwdPath: app.cwdPath, appName: app.name, pageKeys, basePaths: config.basePaths });
}
