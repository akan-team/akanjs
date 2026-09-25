// Types only, deliberately. This barrel re-exports all 40 devkit facets, so a single *value* import
// from it loads every one of them — measured at 417MB / 654ms, versus 38MB / 38ms for the one subpath
// the caller actually needed. That is how `commandDecorators/command.ts` silently put ink, typescript,
// ssh2, @trapezedev/project, @langchain/* and the cloud stack into every process that registered a CLI
// command, and it is the single largest regression this package can suffer from a one-line edit.
//
// `export type *` erases at runtime (verified on Bun 1.3.14: the re-exported module is never loaded),
// so `import type { App } from "@akanjs/devkit"` stays free and readable while a value import fails to
// compile with a self-explaining error:
//
//   TS1362: 'FileSys' cannot be used as a value because it was exported using 'export type'.
//
// Import values from the owning facet instead: `import { FileSys } from "@akanjs/devkit/fileSys"`.
// Keep this file type-only; do not "fix" a TS1362 by widening an entry back to `export *`.
export type * from "./aiEditor";
export type * from "./akanApp";
export type * from "./akanConfig";
export type * from "./akanContext";
export type * from "./akanMcpContract";
export type * from "./applicationBuildReporter";
export type * from "./applicationBuildRunner";
export type * from "./applicationReleasePackager";
export type * from "./applicationTestPreload";
export type * from "./artifact";
export type * from "./builder";
export type * from "./capacitorApp";
export type * from "./cloud";
export type * from "./commandDecorators";
export type * from "./createTunnel";
export type * from "./dependencyScanner";
export type * from "./executors";
export type * from "./extractDeps";
export type * from "./fileSys";
export type * from "./frontendBuild";
export type * from "./getCredentials";
export type * from "./getDirname";
export type * from "./getModelFileData";
export type * from "./getRelatedCnsts";
export type * from "./guideline";
export type * from "./incrementalBuilder";
export type * from "./mobile";
export type * from "./packageExportsMap";
export type * from "./prompter";
export type * from "./qualityScanner";
export type * from "./scanInfo";
export type * from "./selectModel";
export type * from "./spinner";
export type * from "./streamAi";
export type * from "./transforms";
export type * from "./typeChecker";
export type * from "./types";
export type * from "./ui";
export type * from "./uploadRelease";
export type * from "./useStdoutDimensions";
export type * from "./workflow";
