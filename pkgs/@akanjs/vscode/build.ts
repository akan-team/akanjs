import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const pkgDir = import.meta.dir;
const workspaceRoot = path.resolve(pkgDir, "../../..");
const outdir = process.env.DIST_DIR ?? `${workspaceRoot}/dist/pkgs/@akanjs/vscode`;
const preRelease = process.argv.find((arg) => arg.startsWith("--pre-release="))?.slice("--pre-release=".length);
if (preRelease !== undefined && !/^[1-9]\d*$/.test(preRelease)) {
  console.error(`--pre-release takes a positive number, such as the CI run number; got "${preRelease}"`);
  process.exit(1);
}

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });
const result = await Bun.build({
  entrypoints: [`${pkgDir}/extension.ts`],
  outdir,
  target: "node",
  format: "cjs",
  external: ["vscode"],
  minify: true,
});
if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}
const {
  dependencies,
  devDependencies,
  private: _private,
  ...manifest
} = await Bun.file(`${pkgDir}/package.json`).json();
const [major = 0, minor = 0] = String(manifest.version).split(".").map(Number);
//? The Marketplace takes no semver pre-release tag and gives pre-release users whichever channel is higher, so a pre-release takes the next odd minor and a release keeps an even one.
const version =
  preRelease === undefined ? manifest.version : `${major}.${minor + (minor % 2 === 0 ? 1 : 2)}.${preRelease}`;
//? A Marketplace extension name is unscoped; `@akanjs/vscode` stays the workspace package name only.
await Bun.write(`${outdir}/package.json`, `${JSON.stringify({ ...manifest, name: "akan", version }, null, 2)}\n`);
await Promise.all([
  cp(`${pkgDir}/l10n`, `${outdir}/l10n`, { recursive: true }),
  cp(`${pkgDir}/package.nls.json`, `${outdir}/package.nls.json`),
  cp(`${pkgDir}/package.nls.ko.json`, `${outdir}/package.nls.ko.json`),
  cp(`${pkgDir}/README.md`, `${outdir}/README.md`),
  cp(`${workspaceRoot}/pkgs/akanjs/LICENSE`, `${outdir}/LICENSE`),
]);

if (process.argv.includes("--vsix")) {
  const vsix = path.join(outdir, "..", `akan-${version}.vsix`);
  const pack = Bun.spawnSync(
    [
      "bunx",
      "@vscode/vsce@4.1.0",
      "package",
      "--no-dependencies",
      ...(preRelease === undefined ? [] : ["--pre-release"]),
      "--out",
      vsix,
    ],
    { cwd: outdir, stdout: "inherit", stderr: "inherit" },
  );
  if (pack.exitCode !== 0) process.exit(pack.exitCode ?? 1);
}
