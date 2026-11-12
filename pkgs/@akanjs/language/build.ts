import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";

const pkgDir = import.meta.dir;
const workspaceRoot = process.env.WORKSPACE_ROOT ?? path.resolve(pkgDir, "../../..");
const outdir = process.env.DIST_DIR ?? `${workspaceRoot}/dist/pkgs/@akanjs/language`;

const fail = (message: unknown) => {
  console.error(message);
  process.exit(1);
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
//? Both formats bundle the `akanjs/common/*.ts` files they import, so the published core depends on nothing at runtime:
//? the editor extension requires the CommonJS copy and devkit imports the ES module.
for (const [format, naming] of [
  ["esm", "index.js"],
  ["cjs", "index.cjs"],
] as const) {
  const result = await Bun.build({
    entrypoints: [`${pkgDir}/index.ts`],
    outdir,
    naming,
    target: "node",
    format,
    external: ["typescript"],
  });
  if (!result.success) fail(result.logs);
}
const server = await Bun.build({
  entrypoints: [`${pkgDir}/server.ts`],
  outdir,
  naming: "server.js",
  target: "node",
  format: "esm",
  external: ["typescript"],
});
if (!server.success) fail(server.logs);

const typesDir = `${outdir}/.types`;
const tsconfigPath = `${outdir}/tsconfig.build.json`;
await Bun.write(
  tsconfigPath,
  JSON.stringify({
    extends: `${workspaceRoot}/tsconfig.json`,
    compilerOptions: {
      noEmit: false,
      declaration: true,
      emitDeclarationOnly: true,
      allowImportingTsExtensions: true,
      rootDir: `${workspaceRoot}/pkgs`,
      outDir: typesDir,
    },
    files: [`${pkgDir}/index.ts`],
  }),
);
const tsc = Bun.spawnSync(["bunx", "tsc", "-p", tsconfigPath], {
  cwd: workspaceRoot,
  stdout: "inherit",
  stderr: "inherit",
});
await rm(tsconfigPath);
if (tsc.exitCode !== 0) fail("[language] declaration emit failed");
//? tsc also emits every akanjs file the program reaches; the public declarations import only `akanjs/common`.
const ownTypes = `${typesDir}/@akanjs/language`;
for (const file of await readdir(ownTypes))
  if (file.endsWith(".d.ts")) await rename(`${ownTypes}/${file}`, `${outdir}/${file}`);
await rm(typesDir, { recursive: true, force: true });

const { dependencies, devDependencies, exports, ...pkgJson } = await Bun.file(`${pkgDir}/package.json`).json();
await Bun.write(
  `${outdir}/package.json`,
  `${JSON.stringify(
    {
      ...pkgJson,
      type: "module",
      main: "./index.cjs",
      module: "./index.js",
      types: "./index.d.ts",
      sideEffects: false,
      bin: { "akan-language-server": "./server.js" },
      exports: {
        ".": { types: "./index.d.ts", import: "./index.js", require: "./index.cjs" },
        "./package.json": "./package.json",
      },
    },
    null,
    2,
  )}\n`,
);
