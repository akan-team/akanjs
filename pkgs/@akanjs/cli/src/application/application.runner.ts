import EventEmitter from "node:events";

import { sleep } from "@akanjs/common";
import { defaultNextConfigFile } from "@akanjs/config";
import {
  App,
  AppExecutor,
  CapacitorApp,
  createTunnel,
  extractDependencies,
  getCredentials,
  PackageJson,
  uploadRelease,
  type Workspace,
} from "@akanjs/devkit";
import { confirm, input, select } from "@inquirer/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import react from "@vitejs/plugin-react";
import type { SpawnOptions } from "child_process";
import dotenv from "dotenv";
import * as esbuild from "esbuild";
import fs from "fs";
import fsPromise from "fs/promises";
import openBrowser from "open";
import ora from "ora";
import path from "path";
import * as vite from "vite";
import commonjs from "vite-plugin-commonjs";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";

export interface ReleaseSourceOptions {
  rebuild?: boolean;
  buildNum?: number;
  environment?: string;
  local?: boolean;
}

export class ApplicationRunner {
  async createApplication(appName: string, workspace: Workspace, libs: string[] = []) {
    await workspace.applyTemplate({
      basePath: `apps/${appName}`,
      template: "app",
      dict: { appName, companyName: workspace.repoName, startDomain: "localhost" },
      options: { libs },
    });
    workspace.setTsPaths("app", appName);
    return AppExecutor.from(workspace, appName);
  }
  async removeApplication(app: App) {
    await app.workspace.exec(`rm -rf apps/${app.name}`);
    app.workspace.unsetTsPaths("app", app.name);
  }
  async getConfig(app: App) {
    return await app.getConfig();
  }
  async scanSync(app: App, { refresh = false }: { refresh?: boolean } = {}) {
    const scanInfo = await app.scan({ refresh });
    await app.syncAssets(scanInfo.getScanResult().libDeps);
    return scanInfo;
  }

  async getScriptFilename(app: App) {
    if (!app.exists("scripts")) {
      app.mkdir("scripts");
      throw new Error(`No script files found. make a script file in apps/${app.name}/scripts folder`);
    }
    const scriptFiles = (await app.readdir("scripts")).filter((file) => file.endsWith(".ts"));
    const scriptFile = await select({
      message: "Select script to run",
      choices: scriptFiles.map((file) => ({ name: file, value: file.replace(".ts", "") })),
    });
    return scriptFile;
  }
  async runScript(app: App, filename: string) {
    const buildResult = await esbuild.build({
      write: true,
      entryPoints: [`${app.cwdPath}/scripts/${filename}.ts`],
      bundle: true,
      format: "cjs",
      packages: "external",
      platform: "node",
      outdir: `${app.cwdPath}/scripts`,
      logLevel: "warning",
    });
    await app.spawn("node", [`scripts/${filename}.js`], {
      stdio: "inherit",
      env: this.#getEnv(app, "backend"),
    });
  }
  #getEnv(app: App, target: "backend" | "frontend" | "csr" | (string & {}), env: Record<string, string> = {}) {
    const rootEnv = dotenv.parse(app.workspace.readFile(".env"));
    const basePort = target === "backend" ? 8080 : target === "frontend" ? 4200 : target === "csr" ? 4201 : undefined;
    const portOffset = app.workspace.getBaseDevEnv().portOffset;
    const PORT = basePort ? (basePort + portOffset).toString() : undefined;
    const NEXT_PUBLIC_SERVER_PORT = portOffset ? (8080 + portOffset).toString() : undefined;
    return {
      ...process.env,
      ...rootEnv,
      NEXT_PUBLIC_APP_NAME: app.name,
      AKAN_WORKSPACE_ROOT: app.workspace.workspaceRoot,
      NODE_NO_WARNINGS: "1",
      ...(PORT ? { PORT, NEXT_PUBLIC_CLIENT_PORT: PORT } : {}),
      ...(NEXT_PUBLIC_SERVER_PORT ? { NEXT_PUBLIC_SERVER_PORT } : {}),
      ...env,
    };
  }
  async #prepareCommand(app: App, type: "build" | "start", target: "backend" | "frontend" | "csr" | (string & {})) {
    if (type === "build") await app.dist.exec(`rm -rf ${target}`);
    if (target === "frontend") {
      await app.exec("rm -rf .next");
      app.writeFile("next.config.ts", defaultNextConfigFile);
    } else if (target === "csr")
      await app.workspace.exec(`rm -rf ${app.workspace.workspaceRoot}/node_modules/.vite/${app.name}`);
    else if (target === "backend") await app.cp("assets", path.join(app.dist.cwdPath, "backend", "assets"));
    return { env: this.#getEnv(app, target, { AKAN_COMMAND_TYPE: type }) };
  }
  async buildBackend(app: App) {
    await this.#prepareCommand(app, "start", "backend");
    const akanConfig = await app.getConfig();
    const buildResult = await esbuild.build({
      write: false,
      entryPoints: [`${app.cwdPath}/main.ts`],
      bundle: true,
      minify: true,
      format: "cjs",
      packages: "external",
      platform: "node",
      outdir: `${app.dist.cwdPath}/backend`,
      logLevel: "warning",
    });

    const rootPackageJson = app.workspace.getPackageJson();
    const dependencies = extractDependencies(buildResult.outputFiles, rootPackageJson);
    buildResult.outputFiles.forEach((file) => app.dist.writeFile(file.path, file.text));
    const appPackageJson: PackageJson = {
      name: `${app.name}/backend`,
      description: `${app.name} backend`,
      version: "1.0.0",
      main: "./main.js",
      engines: { node: ">=20" },
      dependencies,
    };
    app.dist.writeJson("backend/package.json", appPackageJson);
    app.dist.writeFile(path.join(app.dist.cwdPath, "backend", "Dockerfile"), akanConfig.backend.docker.content);
    // TODO: copy asset files
  }
  async startBackend(
    app: App,
    { open = false, onStart, withInk = false }: { open?: boolean; onStart?: () => void; withInk?: boolean } = {}
  ) {
    const { env } = await this.#prepareCommand(app, "start", "backend");
    const ctx = await esbuild.context({
      write: true,
      entryPoints: [`${app.cwdPath}/main.ts`],
      bundle: true,
      minify: false,
      packages: "external",
      platform: "node",
      format: "cjs",
      outdir: path.join(app.dist.cwdPath, "backend"),
      logLevel: "warning",
    });
    await ctx.watch();
    await sleep(100);
    onStart?.();
    if (open) setTimeout(() => openBrowser("http://localhost:8080/backend/graphql"), 3000);

    const startProcessFn = () =>
      app.dist.spawnSync("node", ["--watch", "main.js"], {
        env,
        stdio: withInk ? ["ignore", "pipe", "pipe"] : "inherit",
        cwd: `${app.dist.cwdPath}/backend`,
      });

    return startProcessFn();

    // return new RestartableProcess(startProcessFn, (count, reason) => {
    //   if (withInk) {
    //     console.log(`\n[AKAN CLI] Backend auto-restart #${count} - ${reason}\n`);
    //   }
    //   // 콘솔 출력은 RestartableProcess 내부에서도 처리됨
    // }) as any;
  }
  async buildFrontend(app: App, { spawnOptions }: { spawnOptions?: SpawnOptions } = {}) {
    const { env } = await this.#prepareCommand(app, "build", "frontend");
    const akanConfig = await app.getConfig();
    await app.spawn("npx", ["next", "build"], { env, ...spawnOptions });
    const buildResult = await esbuild.build({
      entryPoints: [`${app.cwdPath}/next.config.ts`],
      outfile: `${app.dist.cwdPath}/frontend/next.config.ts`,
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      write: false,
      logLevel: "warning",
    });
    const rootPackageJson = app.workspace.getPackageJson();
    const dependencies = extractDependencies(buildResult.outputFiles, rootPackageJson, [
      "next",
      "react",
      "react-dom",
      "typescript",
    ]);
    buildResult.outputFiles.forEach((file) => app.dist.writeFile(file.path, file.text));
    const appPackageJson: PackageJson = {
      name: `${app.name}/frontend`,
      description: `${app.name} frontend`,
      version: "1.0.0",
      engines: { node: ">=20" },
      dependencies,
      scripts: { start: "next start" },
      browserslist: "> 1%",
    };
    app.dist.writeJson("frontend/package.json", appPackageJson);
    await Promise.all([
      app.cp(".next", path.join(app.dist.cwdPath, "frontend", ".next")),
      app.cp("public", path.join(app.dist.cwdPath, "frontend", "public")),
    ]);
    app.dist.writeFile("frontend/Dockerfile", akanConfig.frontend.docker.content);
  }
  async startFrontend(
    app: App,
    {
      open = false,
      turbo = true,
      onStart,
      withInk = false,
    }: { open?: boolean; turbo?: boolean; onStart?: () => void; withInk?: boolean } = {}
  ) {
    const { env } = await this.#prepareCommand(app, "start", "frontend");
    if (open) setTimeout(() => openBrowser(`http://localhost:${env.PORT ?? 4200}`), 3000);
    onStart?.();
    return app.spawnSync("npx", ["next", "dev", ...(env.PORT ? ["-p", env.PORT] : []), ...(turbo ? ["--turbo"] : [])], {
      env,
      stdio: withInk ? ["ignore", "pipe", "pipe"] : "inherit",
    });
  }

  async #getViteConfig(
    app: App,
    command: "build" | "start",
    viteConfig: vite.UserConfig = {},
    options: { operation?: "local" | "release"; host?: "local" | "debug" | "develop" | "main" } = {}
  ) {
    const { env } = await this.#prepareCommand(app, command, "csr");
    const { NODE_ENV, NODE_NO_WARNINGS, ...applyEnvs } = env;
    const tsconfig = app.workspace.getTsConfig();
    const akanConfig = await app.getConfig();
    const basePaths = akanConfig.frontend.routes
      ? [...new Set(akanConfig.frontend.routes.map(({ basePath }) => basePath))].join(",")
      : undefined;
    const processEnv = env as Record<string, string | undefined>;
    const akanjsPrefix = process.env.USE_AKANJS_PKGS === "true" ? `${app.workspace.workspaceRoot}/pkgs/` : "";
    const config = vite.defineConfig({
      ...viteConfig,
      root: `${app.cwdPath}/app`,
      base: "/",
      build: {
        outDir: `${app.dist.cwdPath}/csr`,
        sourcemap: false,
        emptyOutDir: true,
        minify: true,
        rollupOptions: {
          // ...(process.env.USE_AKANJS_PKGS === "true" ? {} : { external: ["next/server"] }),
          input: `${app.cwdPath}/app/index.html`,
        },
      },
      css: { postcss: `${app.cwdPath}/postcss.config.js` },
      publicDir: `${app.cwdPath}/public`,
      cacheDir: `${app.workspace.workspaceRoot}/node_modules/.vite/${app.name}`,
      plugins: [
        react(),
        tsconfigPaths(),
        commonjs(),
        //? A postCSS 어쩌구 에러 제거하는 방법인데 적용시 tailwind가 망가져버림.
        // tailwindcss(),
        nodePolyfills({
          exclude: ["fs"],
          include: ["crypto", "process", "stream", "util"],
          globals: { global: true, process: true },
          protocolImports: true,
        }),
      ],
      resolve: {
        alias: {
          ...Object.fromEntries(
            Object.entries(tsconfig.compilerOptions.paths ?? {}).map(([key, value]) => [
              key.replace("/*", ""),
              `${app.workspace.workspaceRoot}/${value[0].replace("/*", "").replace("/index.ts", "")}`,
            ])
          ),
          "@akanjs/config": `${akanjsPrefix}@akanjs/config`,
          "next/font/local": `${akanjsPrefix}@akanjs/client/src/createFont`,
          "next/font/google": `${akanjsPrefix}@akanjs/client/src/createFont`,
          "next/navigation": `${akanjsPrefix}@akanjs/client/src/navigation`,
          "next/server": `${akanjsPrefix}@akanjs/client/src/navigation`,
          url: "url-polyfill",
          vm: "vm-browserify",
          process: "process/browser",
          crypto: "crypto-browserify",
          http: "stream-http",
          https: "https-browserify",
          os: "os-browserify/browser",
          stream: "stream-browserify",
          "process/browser": "process/browser",
        },
      },
      define: {
        "process.env": {
          ...applyEnvs,
          AKAN_COMMAND_TYPE: "start",
          NEXT_PUBLIC_REPO_NAME: app.workspace.repoName,
          NEXT_PUBLIC_SERVE_DOMAIN: processEnv.NEXT_PUBLIC_SERVE_DOMAIN ?? "localhost",
          NEXT_PUBLIC_ENV: options.host ?? processEnv.NEXT_PUBLIC_ENV ?? "debug",
          NEXT_PUBLIC_OPERATION_MODE: processEnv.NEXT_PUBLIC_OPERATION_MODE ?? "local",
          NEXT_PUBLIC_LOG_LEVEL: processEnv.NEXT_PUBLIC_LOG_LEVEL ?? "log",
          APP_OPERATION_MODE: options.operation ?? processEnv.APP_OPERATION_MODE ?? "local",
          AKAN_WORKSPACE_ROOT: app.workspace.workspaceRoot,
          AKAN_APP_ROOT: app.cwdPath,
          RENDER_ENV: "csr",
          basePaths,
        },
        "process.platform": JSON.stringify("browser"),
        "process.version": JSON.stringify(process.version),
      },
      server: { host: "0.0.0.0", port: 4201 },
      logLevel: "error",
    });
    return config;
  }
  async buildCsr(
    app: App,
    { operation, host }: { operation?: "local" | "release"; host?: "local" | "debug" | "develop" | "main" } = {}
  ) {
    const config = await this.#getViteConfig(app, "build", {}, { operation, host });
    await vite.build(config);
  }
  async startCsr(
    app: App,
    { open = false, onStart, withInk = false }: { open?: boolean; onStart?: () => void; withInk?: boolean } = {}
  ) {
    //generate event emitter
    const eventEmitter = new EventEmitter();
    const config = await this.#getViteConfig(
      app,
      "start",
      withInk
        ? {
            customLogger: {
              info: (msg: string) => {
                eventEmitter.emit("info", msg);
              },
              warn: (msg: string) => {
                eventEmitter.emit("warn", msg);
              },
              warnOnce: (msg: string) => {
                eventEmitter.emit("warnOnce", msg);
              },
              error: (msg: string) => {
                eventEmitter.emit("error", msg);
              },
              clearScreen: (type: string) => {
                eventEmitter.emit("clearScreen", type);
              },
              hasErrorLogged: (error: Error) => {
                // eventEmitter.emit("has Error logged", error);
                return false;
              },
              hasWarned: false,
            },
          }
        : {}
    );

    const server = await vite.createServer(config);
    await server.listen(4201 + app.workspace.getBaseDevEnv().portOffset);
    onStart?.();
    if (open) setTimeout(() => openBrowser("http://localhost:4201"), 3000);
    return { server, eventEmitter };
  }
  async buildIos(app: App) {
    const capacitorApp = await new CapacitorApp(app).init();
    await capacitorApp.buildIos();
  }
  async startIos(
    app: App,
    {
      open = false,
      operation = "local",
      host = "local",
    }: { open?: boolean; operation?: "local" | "release"; host?: "local" | "debug" | "develop" | "main" } = {}
  ) {
    const akanConfig = await app.getConfig();
    await this.buildCsr(app, { operation, host });
    const capacitorApp = await new CapacitorApp(app).init();
    await capacitorApp.runIos({ ...akanConfig.mobile, operation, host });
    if (open) await capacitorApp.openIos();
  }
  async releaseIos(app: App) {
    const capacitorApp = new CapacitorApp(app);
    await capacitorApp.init();
    await capacitorApp.releaseIos();
  }

  async buildAndroid(app: App) {
    const capacitorApp = new CapacitorApp(app);
    await capacitorApp.init();
    await capacitorApp.syncAndroid();
  }

  async startAndroid(
    app: App,
    {
      open = false,
      operation = "local",
      host = "local",
    }: { open?: boolean; operation?: "local" | "release"; host?: "local" | "debug" | "develop" | "main" } = {}
  ) {
    const akanConfig = await app.getConfig();
    await this.buildCsr(app, { operation, host });
    const capacitorApp = await new CapacitorApp(app).init();
    await capacitorApp.runAndroid({ ...akanConfig.mobile, operation, host });
  }

  async releaseAndroid(app: App, assembleType: "apk" | "aab") {
    const capacitorApp = new CapacitorApp(app);
    const akanConfig = await app.getConfig();
    await capacitorApp.init();
    await capacitorApp.updateAndroidVersion(akanConfig.mobile.version, akanConfig.mobile.buildNum);
    await capacitorApp.buildAndroid(assembleType);
    app.log(
      `Release Android ${app.name} ${assembleType} Completed. app-${assembleType === "apk" ? "release" : "release"}.${assembleType === "apk" ? "apk" : "aab"}`
    );
    app.log(`Path : ${app.cwdPath}/android/app/build/outputs/${assembleType === "apk" ? "apk" : "bundle"}/release`);
  }

  async codepush(app: App, os: "ios" | "android") {
    const capacitorApp = new CapacitorApp(app);
    await capacitorApp.init();

    // await this.release;
  }

  async #prepareMongo(app: App, environment: string) {
    if (environment === "local") return `mongodb://localhost:27017/${app.name}-${environment}`;
    const secret = getCredentials(app, environment);
    const mongoAccount = secret.mongo.account.user;
    const localUrl = await createTunnel({ app, environment });
    const mongoUri = `mongodb://${mongoAccount.username}:${encodeURIComponent(
      mongoAccount.password
    )}@${localUrl}/${app.name}-${environment}`;
    return mongoUri;
  }
  async dumpDatabase(app: App, environment: string) {
    const mongoUri = await this.#prepareMongo(app, environment);
    await app.workspace.spawn("mongodump", [`--uri=${mongoUri}`]);
  }
  async restoreDatabase(app: App, source: string, target: string) {
    const mongoUri = await this.#prepareMongo(app, target);
    await app.workspace.spawn("mongorestore", [
      `--uri=${mongoUri}`,
      `--nsFrom=${app.name}-${source}.*`,
      `--nsTo=${app.name}-${target}.*`,
      `--drop`,
      `./dump/${app.name}-${source}`,
    ]);
  }

  async dbup(workspace: Workspace) {
    try {
      await workspace.exec(`docker ps`);
    } catch (e) {
      throw new Error(`Docker daemon is not running. Please install docker or start docker daemon and try again.`);
    }
    await workspace.applyTemplate({
      basePath: "local",
      template: "localDev",
      dict: { repoName: workspace.repoName },
      overwrite: false,
    });
    await workspace.spawn(`docker`, ["compose", "up", "-d"], { cwd: `${workspace.workspaceRoot}/local` });
  }
  async dbdown(workspace: Workspace) {
    await workspace.spawn(`docker`, ["compose", "down"], { cwd: `${workspace.workspaceRoot}/local` });
  }

  async configureApp(app: App) {
    const capacitorApp = new CapacitorApp(app);
    await capacitorApp.init();
    // TODO: 이미 있으면 패스하는 로직 추가 필요
    if (await confirm({ message: "want to add camera permission?" })) await capacitorApp.addCamera();
    if (await confirm({ message: "want to add contact permission?" })) await capacitorApp.addContact();
    if (await confirm({ message: "want to add location permission?" })) await capacitorApp.addLocation();
    await capacitorApp.save();
  }

  async releaseSource(
    app: App,
    { rebuild, buildNum = 0, environment = "debug", local = true }: ReleaseSourceOptions = {}
  ) {
    const akanConfig = await app.getConfig();
    const buildRoot = `${app.workspace.workspaceRoot}/releases/builds/${app.name}`;
    // const platformVersion = akanConfig.mobile.version;
    // const appVersionInfo = yaml.load(app.readFile("config.yaml")) as {
    //   platforms: { android: { versionName: string } };
    // };
    // TODO: 플랫폼 버전 기준을 누구로 잡을지 필요 ( 현 안드로이드 )
    const platformVersion = akanConfig.mobile.version;
    // const platformVersion = "6.0.0";
    // 1. 1. Initialize release root
    if (fs.existsSync(buildRoot)) await fsPromise.rm(buildRoot, { recursive: true, force: true });
    await fsPromise.mkdir(buildRoot, { recursive: true });
    if (rebuild || !fs.existsSync(`${app.dist.cwdPath}/backend`)) await this.buildBackend(app);
    if (rebuild || !fs.existsSync(`${app.dist.cwdPath}/frontend`)) await this.buildFrontend(app);
    if (rebuild || !fs.existsSync(`${app.dist.cwdPath}/csr`)) await this.buildCsr(app);

    const buildVersion = `${platformVersion}-${buildNum}`;
    const buildPath = `${buildRoot}/${buildVersion}`;
    await fsPromise.mkdir(buildPath, { recursive: true });
    await fsPromise.cp(`${app.dist.cwdPath}/backend`, `${buildPath}/backend`, { recursive: true });

    // 1. 2. Release dist files
    await fsPromise.cp(app.dist.cwdPath, buildRoot, { recursive: true });
    await fsPromise.rm(`${buildRoot}/frontend/.next`, { recursive: true, force: true });

    // 1. 3. Compress release files
    await app.workspace.spawn("tar", [
      "-zcf",
      `${app.workspace.workspaceRoot}/releases/builds/${app.name}-release.tar.gz`,
      "-C",
      buildRoot,
      "./",
    ]);
    if (fs.existsSync(`${app.dist.cwdPath}/csr`)) {
      //* 여기 바꿀라면 고석현을 한 번 부르세요.
      //! zip 명령어는 압축시 폴더 경로를 무시하는 게 안됨
      //! 두 가지 방법이 있음
      //! 1. 경로로 이동 후 압축
      //! 2. csr폴더를 현 위치로 복사 후 압축 후 삭제
      //! execSync를 가져오기 싫으니 일단 2번 방법으로 해보자
      await fsPromise.cp(`${app.dist.cwdPath}/csr`, "./csr", { recursive: true });
      await app.workspace.spawn("zip", [
        "-r",
        `${app.workspace.workspaceRoot}/releases/builds/${app.name}-appBuild.zip`,
        "./csr",
      ]);
      await fsPromise.rm("./csr", { recursive: true, force: true });
    }

    // 2. 1. Initialize source root
    const sourceRoot = `${app.workspace.workspaceRoot}/releases/sources/${app.name}`;
    if (fs.existsSync(sourceRoot)) {
      const MAX_RETRY = 3;
      for (let i = 0; i < MAX_RETRY; i++) {
        try {
          await fsPromise.rm(sourceRoot, { recursive: true, force: true });
        } catch (e) {
          //
        }
      }
    }
    await fsPromise.mkdir(sourceRoot, { recursive: true });

    // 2. 2. Release source files
    await fsPromise.cp(app.dist.cwdPath, `${sourceRoot}/apps/${app.name}`, { recursive: true });
    const libDeps = ["social", "shared", "platform", "util"]; // await getDependencies(appName);
    await Promise.all(
      libDeps.map((lib) =>
        fsPromise.cp(`${app.workspace.cwdPath}/libs/${lib}`, `${sourceRoot}/libs/${lib}`, { recursive: true })
      )
    );
    await Promise.all(
      [".next", "ios", "android", "public/libs"].map(async (path) => {
        const targetPath = `${sourceRoot}/apps/${app.name}/${path}`;
        if (fs.existsSync(targetPath)) await fsPromise.rm(targetPath, { recursive: true, force: true });
      })
    );

    // 2. 3. Sync common files
    const syncPaths = [
      ".husky",
      // ".vscode",
      ".editorconfig",
      // ".eslintrc.json",
      ".gitignore",
      ".prettierignore",
      ".prettierrc.json",
      // "jest.config.ts",
      "package.json",
    ];
    await Promise.all(
      syncPaths.map((path) =>
        fsPromise.cp(`${app.workspace.cwdPath}/${path}`, `${sourceRoot}/${path}`, { recursive: true })
      )
    );

    // 2. 4. Sync tsconfig.json
    const tsconfig = app.workspace.readJson("tsconfig.json") as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    tsconfig.compilerOptions.paths = Object.fromEntries([
      [`@${app.name}/*`, [`apps/${app.name}/*`]],
      ...libDeps.reduce<[string, string[]][]>(
        (acc, lib) => [...acc, [`@${lib}`, [`libs/${lib}/index.ts`]], [`@${lib}/*`, [`libs/${lib}/*`]]],
        []
      ),
    ] as [string, string[]][]) as Record<string, string[]>;
    fs.writeFileSync(`${sourceRoot}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));

    // 2. 5. Write README.md
    fs.writeFileSync(
      `${sourceRoot}/README.md`,
      `# ${app.name}
  본 프로젝트의 소스코드 및 관련자료는 모두 비밀정보로 관리됩니다.

  ## Get Started
  Run the code below.
  \`\`\`
  npm i -g nx pnpm
  pnpm i -w

  cat <<EOF >> .env
  # ENV For Server => debug | debug.local | develop | develop.local | main | main.local
  SERVER_ENV=debug.local
  # Run Mode For Server => federation | batch | all
  SERVER_MODE=federation
  # ENV For Client => debug | debug.local | develop | develop.local | main | main.local
  NEXT_PUBLIC_CLIENT_ENV=debug.local
  ANALYZE=false
  EOF

  akn start-backend ${app.name}
  # or akn start-frontend ${app.name}, etc
  \`\`\`

  ## Build
  Run the code below.
  \`\`\`
  akn build-backend ${app.name}
  # or akn build-frontend ${app.name}, etc
  \`\`\`
  `
    );

    // 2. 6. Compress source files
    await app.workspace.spawn("tar", [
      "-zcf",
      `${app.workspace.cwdPath}/releases/sources/${app.name}-source.tar.gz`,
      "-C",
      sourceRoot,
      "./",
    ]);

    // 3. Register release and source files
    await uploadRelease(app.name, {
      local,
      buildNum,
      environment,
      platformVersion,
      workspaceRoot: app.workspace.cwdPath,
    });
  }

  async createApplicationTemplate(workspace: Workspace, appName: string) {
    await workspace.applyTemplate({ basePath: `apps/${appName}`, template: "appRoot", dict: { appName } });
  }

  async compressProjectFiles(
    app: App,
    { rebuild, buildNum = 0, environment = "debug", local = true }: ReleaseSourceOptions = {}
  ) {
    const akanConfig = await app.getConfig();
    const buildRoot = `${app.workspace.workspaceRoot}/releases/builds/${app.name}`;
    // const platformVersion = akanConfig.mobile.version;
    // const appVersionInfo = yaml.load(app.readFile("config.yaml")) as {
    //   platforms: { android: { versionName: string } };
    // };
    // TODO: 플랫폼 버전 기준을 누구로 잡을지 필요 ( 현 안드로이드 )
    const platformVersion = akanConfig.mobile.version;
    // const platformVersion = "6.0.0";
    // 1. 1. Initialize release root
    if (fs.existsSync(buildRoot)) await fsPromise.rm(buildRoot, { recursive: true, force: true });
    await fsPromise.mkdir(buildRoot, { recursive: true });
    if (rebuild || !fs.existsSync(`${app.dist.cwdPath}/backend`)) await this.buildBackend(app);
    if (rebuild || !fs.existsSync(`${app.dist.cwdPath}/frontend`)) await this.buildFrontend(app);
    if (rebuild || !fs.existsSync(`${app.dist.cwdPath}/csr`)) await this.buildCsr(app);

    const buildVersion = `${platformVersion}-${buildNum}`;
    const buildPath = `${buildRoot}/${buildVersion}`;
    await fsPromise.mkdir(buildPath, { recursive: true });
    await fsPromise.cp(`${app.dist.cwdPath}/backend`, `${buildPath}/backend`, { recursive: true });

    // 1. 2. Release dist files
    await fsPromise.cp(app.dist.cwdPath, buildRoot, { recursive: true });
    await fsPromise.rm(`${buildRoot}/frontend/.next`, { recursive: true, force: true });

    // 1. 3. Compress release files
    await app.workspace.spawn("tar", [
      "-zcf",
      `${app.workspace.workspaceRoot}/releases/builds/${app.name}-release.tar.gz`,
      "-C",
      buildRoot,
      "./",
    ]);
    if (fs.existsSync(`${app.dist.cwdPath}/csr`)) {
      //* 여기 바꿀라면 고석현을 한 번 부르세요.
      //! zip 명령어는 압축시 폴더 경로를 무시하는 게 안됨
      //! 두 가지 방법이 있음
      //! 1. 경로로 이동 후 압축
      //! 2. csr폴더를 현 위치로 복사 후 압축 후 삭제
      //! execSync를 가져오기 싫으니 일단 2번 방법으로 해보자
      await fsPromise.cp(`${app.dist.cwdPath}/csr`, "./csr", { recursive: true });
      await app.workspace.spawn("zip", [
        "-r",
        `${app.workspace.workspaceRoot}/releases/builds/${app.name}-appBuild.zip`,
        "./csr",
      ]);
      await fsPromise.rm("./csr", { recursive: true, force: true });
    }

    // 2. 1. Initialize source root
    const sourceRoot = `${app.workspace.workspaceRoot}/releases/sources/${app.name}`;
    if (fs.existsSync(sourceRoot)) {
      const MAX_RETRY = 3;
      for (let i = 0; i < MAX_RETRY; i++) {
        try {
          await fsPromise.rm(sourceRoot, { recursive: true, force: true });
        } catch (e) {
          //
        }
      }
    }
    await fsPromise.mkdir(sourceRoot, { recursive: true });

    // 2. 2. Release source files
    await fsPromise.cp(app.dist.cwdPath, `${sourceRoot}/apps/${app.name}`, { recursive: true });
    const libDeps = ["social", "shared", "platform", "util"]; // await getDependencies(appName);
    await Promise.all(
      libDeps.map((lib) =>
        fsPromise.cp(`${app.workspace.cwdPath}/libs/${lib}`, `${sourceRoot}/libs/${lib}`, { recursive: true })
      )
    );
    await Promise.all(
      [".next", "ios", "android", "public/libs"].map(async (path) => {
        const targetPath = `${sourceRoot}/apps/${app.name}/${path}`;
        if (fs.existsSync(targetPath)) await fsPromise.rm(targetPath, { recursive: true, force: true });
      })
    );

    // 2. 3. Sync common files
    const syncPaths = [
      ".husky",
      // ".vscode",
      ".editorconfig",
      // ".eslintrc.json",
      ".gitignore",
      ".prettierignore",
      ".prettierrc.json",
      // "jest.config.ts",
      "package.json",
    ];
    await Promise.all(
      syncPaths.map((path) =>
        fsPromise.cp(`${app.workspace.cwdPath}/${path}`, `${sourceRoot}/${path}`, { recursive: true })
      )
    );

    // 2. 4. Sync tsconfig.json
    const tsconfig = app.workspace.readJson("tsconfig.json") as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    tsconfig.compilerOptions.paths = Object.fromEntries([
      [`@${app.name}/*`, [`apps/${app.name}/*`]],
      ...libDeps.reduce<[string, string[]][]>(
        (acc, lib) => [...acc, [`@${lib}`, [`libs/${lib}/index.ts`]], [`@${lib}/*`, [`libs/${lib}/*`]]],
        []
      ),
    ]);
    fs.writeFileSync(`${sourceRoot}/tsconfig.json`, JSON.stringify(tsconfig, null, 2));

    // 2. 5. Write README.md
    fs.writeFileSync(
      `${sourceRoot}/README.md`,
      `# ${app.name}
  본 프로젝트의 소스코드 및 관련자료는 모두 비밀정보로 관리됩니다.

  ## Get Started
  Run the code below.
  \`\`\`
  npm i -g nx pnpm
  pnpm i -w

  cat <<EOF >> .env
  # ENV For Server => debug | debug.local | develop | develop.local | main | main.local
  SERVER_ENV=debug.local
  # Run Mode For Server => federation | batch | all
  SERVER_MODE=federation
  # ENV For Client => debug | debug.local | develop | develop.local | main | main.local
  NEXT_PUBLIC_CLIENT_ENV=debug.local
  ANALYZE=false
  EOF

  akn start-backend ${app.name}
  # or akn start-frontend ${app.name}, etc
  \`\`\`

  ## Build
  Run the code below.
  \`\`\`
  akn build-backend ${app.name}
  # or akn build-frontend ${app.name}, etc
  \`\`\`
  `
    );

    // 2. 6. Compress source files
    await app.workspace.spawn("tar", [
      "-zcf",
      `${app.workspace.cwdPath}/releases/sources/${app.name}-source.tar.gz`,
      "-C",
      sourceRoot,
      "./",
    ]);
  }

  async generateApplicationTemplate(app: App) {
    const openAIApiKey = process.env.OPENAI_API_KEY;
    if (!openAIApiKey) throw new Error("OPENAI_API_KEY is not set");
    const chatModel = new ChatOpenAI({ modelName: "gpt-4o", openAIApiKey });
    const projectName = await input({ message: "please enter project name." });
    const projectDesc = await input({ message: "please enter project description. (40 ~ 60 characters)" });
    const spinner = ora("Gerating project files...");

    const mainPrompt = PromptTemplate.fromTemplate(`prompt.requestApplication()`);
    const chain = RunnableSequence.from([mainPrompt, chatModel, new StringOutputParser()]);
    const resultOne = await chain.invoke({ projectName, projectDesc });
    spinner.succeed("Loading complete!");

    const idxStart = resultOne.search("project.json");
    const idxEnd = resultOne.search("project.json_end");
    const pageStart = resultOne.search("page.tsx");
    const pageEnd = resultOne.search("page.tsx_end");
    const projectConfig = JSON.parse(resultOne.slice(idxStart + 13, idxEnd - 1)) as {
      [lang: string]: {
        projectName: string;
        desc: string;
      };
    };
    const indexPage = resultOne.slice(pageStart + 8, pageEnd - 1);
    const dict = {
      appName: projectConfig.en.projectName,
      AppName: projectConfig.en.projectName.charAt(0).toUpperCase() + projectConfig.en.projectName.slice(1),
      template: "",
    };

    //! add path in tsconfig.json
    // addText(tree, "tsconfig.json", {
    //   type: "after",
    //   signal: `"paths": {`,
    //   text: `    "@${projectConfig.en.projectName}/*": ["apps/${projectConfig.en.projectName}/*"],`,
    // });
    // addText(tree, `apps/${projectConfig.en.projectName}/tailwind.config.js`, {
    //   type: "after",
    //   signal: `withBase(__dirname`,
    //   text: `, {
    //       themes: {
    //           light:
    //             ${JSON.stringify(projectConfig.light)}
    //             ,
    //           dark:
    //             ${JSON.stringify(projectConfig.dark)}
    //           ,
    //         }
    //     }
    //       `,
    // });
    // addText(tree, `pkgs/codebase/generators/serviceTest/schema.json`, {
    //   type: "before",
    //   signal: `  {
    //           "value": "libs/game",`,
    //   text: `{
    //       "value": "apps/${projectConfig.en.projectName}",
    //       "label": "${projectConfig.en.projectName}"
    //         },`,
    // });
    // addText(tree, `tsconfig.json`, {
    //   type: "after",
    //   signal: `"references": [`,
    //   text: `{
    //             "path": "./apps/${projectConfig.en.projectName}/tsconfig.json"
    //           },`,
    // });
    // addText(tree, `apps/${projectConfig.en.projectName}/app/[lang]/(${projectConfig.en.projectName})/(public)/page.tsx`, {
    //   type: "after",
    //   signal: `   `,
    //   text: `
    //   ${indexPage}
    //   `,
    //   //logo image 하나 만들기.
    // });

    // ! add image
    // // const imagePrompt = `I want to create a my project logo.
    // //     A high-quality, and professional logo is essential for any business.

    // //     my project name is ${projectName}.
    // //     my project description is ${projectDesc}.

    // //     image is a simple, clean, and modern design.
    // //     and not too many colors, just 2 or 3 colors.
    // //     and I want to use a sans-serif font.
    // //     logo is a based projectName text-based logo.
    // // It should be a text-based logo featuring the project name, using a sans-serif font
    // //     `;
    // const imagePrompt = `Create a minimalist, modern logo for a project named '${projectName}'. The logo should primarily consist of the project name in a clean, sans-serif font, accompanied by a simple, elegant symbol that subtly reflects the project's theme. Use 2 to 3 neutral colors. The overall design should be clean, professional, and easily recognizable.`;

    // const response = await axios.post(
    //   "https://api.openai.com/v1/images/generations",
    //   {
    //     model: "dall-e-3",
    //     prompt: imagePrompt,
    //     n: 1,
    //     size: "1024x1024",
    //   },
    //   {
    //     headers: {
    //       Authorization: `Bearer ${openAIApiKey}`,
    //       "Content-Type": "application/json",
    //     },
    //   }
    // );
    // const logoUrl = response.data.data[0].url as string;
    // //download image
    // const urlResponse = await axios.get(logoUrl, {
    //   responseType: "arraybuffer",
    // });
    // const buffer = Buffer.from(urlResponse.data as string, "binary");
    // tree.write(`apps/${projectConfig.en.projectName}/public/assets/logo_1024*1024.png`, buffer);

    // // addText(tree, `apps/${projectConfig.en.projectName}/app/[lang]/(${projectConfig.en.projectName})/(public)/page.tsx`, {
    // //   type: "after",
    // //   signal: `   `,
    // //   text: `
    // //   <img src="./logo_1024*1024.png" alt="logo" />
    // //   `,
    // // });
    // // console.log(projectConfig.light);
  }

  async testApplication(app: App) {
    await app.workspace.spawn(
      "node",
      ["node_modules/jest/bin/jest.js", `apps/${app.name}`, "-c", `apps/${app.name}/jest.config.ts`],
      {
        env: {
          ...this.#getEnv(app, "backend"),
          NEXT_PUBLIC_ENV: "testing",
          NEXT_PUBLIC_OPERATION_MODE: "local",
          NEXT_PUBLIC_APP_NAME: app.name,
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
        },
      }
    );
  }
}
