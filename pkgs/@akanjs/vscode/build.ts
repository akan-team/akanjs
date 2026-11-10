import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const pkgDir = import.meta.dir;
const workspaceRoot = path.resolve(pkgDir, "../../..");
const outdir = process.env.DIST_DIR ?? `${workspaceRoot}/dist/pkgs/@akanjs/vscode`;
const valueOf = (name: string) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const release = valueOf("release");
const preRelease = valueOf("pre-release");
const patch = preRelease ?? release;
if (release !== undefined && preRelease !== undefined) {
  console.error("Pass --release or --pre-release, not both");
  process.exit(1);
}
if (patch !== undefined && !/^[1-9]\d*$/.test(patch)) {
  console.error(`--release and --pre-release take a positive number, such as the CI run number; got "${patch}"`);
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
//? The Marketplace takes no semver pre-release tag and gives pre-release users whichever channel is higher, so a release rounds the minor up to even and a pre-release takes the odd one above it.
const channelMinor = minor + (minor % 2) + (preRelease === undefined ? 0 : 1);
const version = patch === undefined ? manifest.version : `${major}.${channelMinor}.${patch}`;
//? A Marketplace extension name is unscoped; `@akanjs/vscode` stays the workspace package name only.
await Bun.write(`${outdir}/package.json`, `${JSON.stringify({ ...manifest, name: "akan", version }, null, 2)}\n`);
await Promise.all([
  cp(`${pkgDir}/l10n`, `${outdir}/l10n`, { recursive: true }),
  cp(`${pkgDir}/package.nls.json`, `${outdir}/package.nls.json`),
  cp(`${pkgDir}/package.nls.ko.json`, `${outdir}/package.nls.ko.json`),
  cp(`${pkgDir}/README.md`, `${outdir}/README.md`),
  cp(`${workspaceRoot}/pkgs/akanjs/LICENSE`, `${outdir}/LICENSE`),
  cp(`${workspaceRoot}/apps/akan/public/icon-512x512.png`, `${outdir}/icon.png`),
  cp(`${pkgDir}/CHANGELOG.md`, `${outdir}/CHANGELOG.md`).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  }),
  //? vsce warns without a `.vscodeignore` or a `files` list, and `files` drops LICENSE and CHANGELOG unless listed; outdir holds only what this script writes.
  Bun.write(`${outdir}/.vscodeignore`, ""),
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
