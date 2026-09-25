const build = async () => {
  try {
    const pkgDir = import.meta.dir;
    const workspaceRoot = process.env.WORKSPACE_ROOT ?? process.cwd();
    const outdir = process.env.DIST_DIR ?? `${workspaceRoot}/dist/pkgs/create-akan-workspace`;
    const pkgJson = await Bun.file(`${pkgDir}/package.json`).json();
    await Bun.build({ entrypoints: [`${pkgDir}/index.ts`], splitting: false, target: "bun", outdir });
    const distPkgJson = { ...pkgJson, type: "module", main: "./index.js", engines: { bun: ">=1.3.13" } };
    const pkgJsonContent = JSON.stringify(distPkgJson, null, 2);
    await Promise.all([
      Bun.write(`${outdir}/package.json`, pkgJsonContent),
      Bun.write(`${pkgDir}/package.json`, pkgJsonContent),
    ]);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

build();
