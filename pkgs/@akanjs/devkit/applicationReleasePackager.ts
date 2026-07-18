import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { App } from "./commandDecorators";
import { FileSys } from "./fileSys";
import { uploadRelease } from "./uploadRelease";

export interface ReleaseSourceOptions {
  rebuild?: boolean;
  buildNum?: number;
  environment?: string;
  local?: boolean;
}

interface ApplicationReleasePackagerOptions {
  build: () => Promise<void>;
}

export class ApplicationReleasePackager {
  #app: App;
  #build: () => Promise<void>;

  constructor(app: App, options: ApplicationReleasePackagerOptions) {
    this.#app = app;
    this.#build = options.build;
  }

  async releaseSource({
    rebuild,
    buildNum = 0,
    environment = "debug",
    local = true,
  }: ReleaseSourceOptions = {}): Promise<void> {
    const { platformVersion } = await this.#prepareReleaseBuild({ rebuild, buildNum });
    await this.#writeSourceArchive({ readme: this.#confidentialReadme() });
    await uploadRelease(this.#app.name, {
      local,
      buildNum,
      environment,
      platformVersion,
      workspaceRoot: this.#app.workspace.cwdPath,
    });
  }

  async compressProjectFiles({ rebuild, buildNum = 0 }: ReleaseSourceOptions = {}): Promise<void> {
    await this.#prepareReleaseBuild({ rebuild, buildNum });
    await this.#writeSourceArchive({ readme: this.#publicReadme() });
  }

  async #prepareReleaseBuild({ rebuild, buildNum }: { rebuild?: boolean; buildNum: number }) {
    const akanConfig = await this.#app.getConfig();
    const platformVersion = akanConfig.mobile.version;
    const buildRoot = `${this.#app.workspace.workspaceRoot}/releases/builds/${this.#app.name}`;
    if (await FileSys.dirExists(buildRoot)) await rm(buildRoot, { recursive: true, force: true });
    await mkdir(buildRoot, { recursive: true });
    if (rebuild || !(await FileSys.dirExists(`${this.#app.dist.cwdPath}/backend`))) await this.#build();

    const buildVersion = `${platformVersion}-${buildNum}`;
    const buildPath = `${buildRoot}/${buildVersion}`;
    await mkdir(buildPath, { recursive: true });
    await cp(`${this.#app.dist.cwdPath}/backend`, `${buildPath}/backend`, { recursive: true });

    await cp(this.#app.dist.cwdPath, buildRoot, { recursive: true });
    await rm(`${buildRoot}/frontend/.next`, { recursive: true, force: true });

    const releaseRoot = this.#app.workspace.workspaceRoot;
    // Pass a path relative to cwd so tar never sees a Windows drive letter (e.g. "C:\...")
    // which GNU tar would interpret as a remote "host:file" spec.
    const releaseArchivePath = path
      .relative(releaseRoot, `${releaseRoot}/releases/builds/${this.#app.name}-release.tar.gz`)
      .split(path.sep)
      .join("/");
    await this.#app.workspace.spawn("tar", ["-zcf", releaseArchivePath, "-C", buildRoot, "./"], { cwd: releaseRoot });
    await this.#writeCsrZipIfPresent();
    return { platformVersion };
  }

  async #writeCsrZipIfPresent(): Promise<void> {
    if (!(await FileSys.dirExists(`${this.#app.dist.cwdPath}/csr`))) return;
    await cp(`${this.#app.dist.cwdPath}/csr`, "./csr", { recursive: true });
    await this.#app.workspace.spawn("zip", [
      "-r",
      `${this.#app.workspace.workspaceRoot}/releases/builds/${this.#app.name}-appBuild.zip`,
      "./csr",
    ]);
    await rm("./csr", { recursive: true, force: true });
  }

  async #writeSourceArchive({ readme }: { readme: string }): Promise<void> {
    const sourceRoot = `${this.#app.workspace.workspaceRoot}/releases/sources/${this.#app.name}`;
    await this.#resetSourceRoot(sourceRoot);
    await cp(this.#app.dist.cwdPath, `${sourceRoot}/apps/${this.#app.name}`, { recursive: true });

    const libDeps = ["social", "shared", "platform", "util"];
    await Promise.all(
      libDeps.map((lib) =>
        cp(`${this.#app.workspace.cwdPath}/libs/${lib}`, `${sourceRoot}/libs/${lib}`, { recursive: true }),
      ),
    );
    await Promise.all(
      [".next", "ios", "android", "public/libs"].map(async (path) => {
        const targetPath = `${sourceRoot}/apps/${this.#app.name}/${path}`;
        if (await FileSys.dirExists(targetPath)) await rm(targetPath, { recursive: true, force: true });
      }),
    );

    const syncPaths = [".husky", ".gitignore", "package.json"];
    await Promise.all(
      syncPaths.map((path) =>
        cp(`${this.#app.workspace.cwdPath}/${path}`, `${sourceRoot}/${path}`, { recursive: true }),
      ),
    );
    await this.#writeSourceTsconfig(sourceRoot, libDeps);
    await Bun.write(`${sourceRoot}/README.md`, readme);
    const sourceCwd = this.#app.workspace.cwdPath;
    // Pass a path relative to cwd so tar never sees a Windows drive letter (e.g. "C:\...")
    // which GNU tar would interpret as a remote "host:file" spec.
    const sourceArchivePath = path
      .relative(sourceCwd, `${sourceCwd}/releases/sources/${this.#app.name}-source.tar.gz`)
      .split(path.sep)
      .join("/");
    await this.#app.workspace.spawn("tar", ["-zcf", sourceArchivePath, "-C", sourceRoot, "./"], { cwd: sourceCwd });
  }

  async #resetSourceRoot(sourceRoot: string): Promise<void> {
    if (await FileSys.dirExists(sourceRoot)) {
      const maxRetry = 3;
      for (let i = 0; i < maxRetry; i++) {
        try {
          await rm(sourceRoot, { recursive: true, force: true });
        } catch {
          //
        }
      }
    }
    await mkdir(sourceRoot, { recursive: true });
  }

  async #writeSourceTsconfig(sourceRoot: string, libDeps: string[]): Promise<void> {
    const tsconfig = (await this.#app.workspace.readJson("tsconfig.json")) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    const pathEntries: [string, string[]][] = [[`@${this.#app.name}/*`, [`apps/${this.#app.name}/*`]]];
    for (const lib of libDeps) {
      pathEntries.push([`@${lib}`, [`libs/${lib}/index.ts`]], [`@${lib}/*`, [`libs/${lib}/*`]]);
    }
    tsconfig.compilerOptions.paths = Object.fromEntries(pathEntries) as Record<string, string[]>;
    await Bun.write(`${sourceRoot}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));
  }

  #confidentialReadme(): string {
    return `# ${this.#app.name}
  본 프로젝트의 소스코드 및 관련자료는 모두 비밀정보로 관리됩니다.

  ## Get Started
  Run the code below.
  \`\`\`
  bun install -g bun
  bun i

  cat <<EOF >> .env
  # ENV For Server => debug | debug.local | develop | develop.local | main | main.local
  SERVER_ENV=debug.local
  # Run Mode For Server => federation | batch | all
  SERVER_MODE=federation
  # ENV For Client => debug | debug.local | develop | develop.local | main | main.local
  AKAN_PUBLIC_CLIENT_ENV=debug.local
  ANALYZE=false
  EOF

  akn start-backend ${this.#app.name}
  # or akn start-frontend ${this.#app.name}, etc
  \`\`\`

  ## Build
  Run the code below.
  \`\`\`
  akn build-backend ${this.#app.name}
  # or akn build-frontend ${this.#app.name}, etc
  \`\`\`
  `;
  }

  #publicReadme(): string {
    return `# ${this.#app.name}
  ## Get Started
  Run the code below.
  \`\`\`
  cat <<EOF >> .env
  # ENV For Server => debug | debug.local | develop | develop.local | main | main.local
  SERVER_ENV=debug.local
  # Run Mode For Server => federation | batch | all
  SERVER_MODE=federation
  # ENV For Client => debug | debug.local | develop | develop.local | main | main.local
  AKAN_PUBLIC_CLIENT_ENV=debug.local
  ANALYZE=false
  EOF

  akan start ${this.#app.name}
  \`\`\`

  ## Build
  Run the code below.
  \`\`\`
  akan build ${this.#app.name}
  # or akn build-frontend ${this.#app.name}, etc
  \`\`\`
  `;
  }
}
