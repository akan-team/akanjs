import {
  AkanAppHost,
  type App,
  AppExecutor,
  ApplicationBuildRunner,
  ApplicationReleasePackager,
  type BuildProgressReporter,
  type BuildResult,
  CapacitorApp,
  type DatabaseMode,
  type Exec,
  LibExecutor,
  type MobileEnv,
  type ReleaseSourceOptions,
  type ResolvedMobileTarget,
  resolveMobileTargets,
  resolveSignalTestPreloadPath,
  runner,
  type TypecheckOptions,
  type Workspace,
} from "@akanjs/devkit";
import { confirm, input, select } from "@inquirer/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { Logger } from "akanjs/common";
import ora from "ora";
import { openBrowser } from "../openBrowser";

export class ApplicationRunner extends runner("application") {
  async createApplication(appName: string, workspace: Workspace, libs: string[] = []) {
    await workspace.applyTemplate({
      basePath: `apps/${appName}`,
      template: "app",
      dict: { appName },
      options: { libs },
    });
    return AppExecutor.from(workspace, appName);
  }
  async removeApplication(app: App) {
    await app.workspace.exec(`rm -rf apps/${app.name}`);
  }
  async getConfig(app: App) {
    return await app.getConfig();
  }

  async getScriptFilename(app: App) {
    if (!(await app.exists("script"))) {
      await app.mkdir("script");
      throw new Error(`No script files found. make a script file in apps/${app.name}/script folder`);
    }
    const scriptFiles = (await app.readdir("script")).filter((file) => file.endsWith(".ts"));
    const scriptFile = await select({
      message: "Select script to run",
      choices: scriptFiles.map((file) => ({ name: file, value: file.replace(".ts", "") })),
    });
    return scriptFile;
  }
  async runScript(app: App, filename: string) {
    const scriptName = filename.endsWith(".ts") ? filename.slice(0, -3) : filename;
    if (scriptName.includes("/") || scriptName.includes("\\") || scriptName.includes("..")) {
      throw new Error(`Invalid script filename: ${filename}`);
    }
    const scriptPath = `script/${scriptName}.ts`;
    if (!(await app.exists(scriptPath))) throw new Error(`Script file not found: apps/${app.name}/${scriptPath}`);
    await app.spawn("bun", [scriptPath], {
      env: app.getCommandEnv({ AKAN_COMMAND_TYPE: "script" }),
      stdio: "inherit",
    });
  }
  async runConsole(app: App) {
    const serverPath = `${app.cwdPath}/server.ts`;
    if (!(await app.exists("server.ts"))) throw new Error(`Server file not found: apps/${app.name}/server.ts`);
    const code = `
const serverModule = await import(${JSON.stringify(serverPath)});
const { assertAkanConsoleAllowed, startAkanConsole } = await import("akanjs/server");
const server = serverModule.server;
if (!server?.start) throw new Error("server.ts must export server with start()");
assertAkanConsoleAllowed(server.env);
await server.start({ listen: false, web: false });
try {
  await startAkanConsole(server, {
    globals: {
      srv: serverModule.srv,
      sig: serverModule.sig,
      db: serverModule.db,
      cnst: serverModule.cnst,
      dict: serverModule.dict,
      option: serverModule.option,
    },
  });
} finally {
  await server.stop();
}
`;
    await app.spawn("bun", ["-e", code], {
      env: app.getCommandEnv({ AKAN_COMMAND_TYPE: "console" }),
      stdio: "inherit",
    });
  }
  async typecheck(app: App, options: TypecheckOptions = {}) {
    await new ApplicationBuildRunner(app).typecheck(options);
  }
  async test(exec: Exec) {
    const isSignalTarget = exec instanceof AppExecutor || exec instanceof LibExecutor;
    const preloadPath = isSignalTarget ? await resolveSignalTestPreloadPath(exec) : null;
    const env = isSignalTarget
      ? {
          AKAN_TEST_SIGNAL: "1",
          AKAN_TEST_TARGET_TYPE: exec.type,
          AKAN_TEST_TARGET_NAME: exec.name,
          AKAN_TEST_LIBS: exec.getScanInfo({ allowEmpty: true })?.getLibs().join(",") ?? "",
        }
      : {};
    const args = preloadPath ? ["test", "--isolate", "--preload", preloadPath] : ["test", "--isolate"];
    await exec.spawn("bun", args, {
      ...(isSignalTarget ? { env: { ...process.env, ...env } } : {}),
      stdio: "inherit",
    });
  }
  async build(
    app: App,
    {
      fast = false,
      reporter,
      spinner = false,
    }: { fast?: boolean; reporter?: BuildProgressReporter; spinner?: boolean } = {},
  ): Promise<BuildResult> {
    return new ApplicationBuildRunner(app, { fast, reporter }).build({ spinner });
  }
  async start(
    app: App,
    { open = false, onStart, withInk = false }: { open?: boolean; onStart?: () => void; withInk?: boolean } = {},
  ) {
    const { env } = await app.prepareCommand("start");
    const appHost = await new AkanAppHost(app, { env, withInk }).start();
    onStart?.();
    if (open)
      setTimeout(() => openBrowser(`http://localhost:${env.AKAN_PUBLIC_CLIENT_PORT ?? env.PORT ?? "8282"}`), 3000);
    return appHost;
  }

  async buildIos(
    app: App,
    { target, env = "debug", regenerate = false }: { target?: string; env?: MobileEnv; regenerate?: boolean } = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    await this.#buildMobileCsr(app, env);
    await this.#runMobileTargets(targets, async (mobileTarget) => {
      await new CapacitorApp(app, mobileTarget.config).buildIos({ env, regenerate });
    });
  }
  async startIos(
    app: App,
    {
      open = false,
      operation = "local",
      env = "local",
      target,
      regenerate = false,
      noAllowProvisioningUpdates = false,
    }: {
      open?: boolean;
      operation?: "local" | "release";
      env?: MobileEnv;
      target?: string;
      regenerate?: boolean;
      noAllowProvisioningUpdates?: boolean;
    } = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    if (operation === "release") await this.#buildMobileCsr(app, env);
    // else await this.start(app);
    await this.#runMobileTargets(targets, async (mobileTarget) => {
      const capacitorApp = new CapacitorApp(app, mobileTarget.config);
      await capacitorApp.runIos({ operation, env, regenerate, noAllowProvisioningUpdates });
      if (open) await capacitorApp.openIos();
    });
  }
  async releaseIos(
    app: App,
    { target, env = "main", regenerate = false }: { target?: string; env?: MobileEnv; regenerate?: boolean } = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    await this.#buildMobileCsr(app, env);
    for (const mobileTarget of targets) {
      await new CapacitorApp(app, mobileTarget.config).buildIos({ env, regenerate });
    }
  }

  async buildAndroid(
    app: App,
    { target, env = "debug", regenerate = false }: { target?: string; env?: MobileEnv; regenerate?: boolean } = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    await this.#buildMobileCsr(app, env);
    await this.#runMobileTargets(targets, async (mobileTarget) => {
      await new CapacitorApp(app, mobileTarget.config).buildAndroid("apk", { env, regenerate });
    });
  }

  async startAndroid(
    app: App,
    {
      open = false,
      operation = "local",
      env = "local",
      target,
      regenerate = false,
    }: {
      open?: boolean;
      operation?: "local" | "release";
      env?: MobileEnv;
      target?: string;
      regenerate?: boolean;
    } = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    if (operation === "release") await this.#buildMobileCsr(app, env);
    // else await this.start(app);
    await this.#runMobileTargets(targets, async (mobileTarget) => {
      const capacitorApp = new CapacitorApp(app, mobileTarget.config);
      await capacitorApp.runAndroid({ operation, env, regenerate });
      if (open) await capacitorApp.openAndroid();
    });
  }

  async releaseAndroid(
    app: App,
    assembleType: "apk" | "aab",
    { target, env = "main", regenerate = false }: { target?: string; env?: MobileEnv; regenerate?: boolean } = {},
  ) {
    const targets = await resolveMobileTargets(app, target);
    await this.#buildMobileCsr(app, env);
    for (const mobileTarget of targets) {
      await new CapacitorApp(app, mobileTarget.config).buildAndroid(assembleType, { env, regenerate });
      app.log(`Release Android ${app.name}/${mobileTarget.name} ${assembleType} Completed.`);
      app.log(`Path : ${app.cwdPath}/android/app/build/outputs/${assembleType === "apk" ? "apk" : "bundle"}/release`);
    }
  }

  async #buildMobileCsr(app: App, env: MobileEnv) {
    const prevEnv = {
      AKAN_PUBLIC_ENV: process.env.AKAN_PUBLIC_ENV,
      AKAN_PUBLIC_OPERATION_MODE: process.env.AKAN_PUBLIC_OPERATION_MODE,
      APP_OPERATION_MODE: process.env.APP_OPERATION_MODE,
    };
    Object.assign(process.env, {
      AKAN_PUBLIC_ENV: env,
      AKAN_PUBLIC_OPERATION_MODE: env === "local" ? "local" : "cloud",
      APP_OPERATION_MODE: "release",
    });
    try {
      await new ApplicationBuildRunner(app).build({ spinner: true });
    } finally {
      for (const [key, value] of Object.entries(prevEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }
  async #runMobileTargets(targets: ResolvedMobileTarget[], task: (target: ResolvedMobileTarget) => Promise<void>) {
    const results: { target: string; error?: unknown }[] = [];
    for (const target of targets) {
      try {
        await task(target);
        results.push({ target: target.name });
      } catch (error) {
        results.push({ target: target.name, error });
      }
    }
    const failures = results.filter((result) => result.error);
    if (failures.length === 0) return;
    for (const failure of failures) {
      const message = failure.error instanceof Error ? failure.error.message : String(failure.error);
      Logger.rawLog(`Mobile target ${failure.target} failed: ${message}`, undefined, "error");
    }
    throw new Error(`${failures.length}/${results.length} mobile targets failed`);
  }

  async codepush(app: App, os: "ios" | "android") {
    const [target] = await resolveMobileTargets(app, undefined);
    if (!target) throw new Error(`No mobile target configured for ${app.name}`);
    const capacitorApp = new CapacitorApp(app, target.config);
    await capacitorApp.init();

    // await this.release;
  }

  #getLocalDatabaseServices(mode: DatabaseMode): string[] {
    if (mode === "single") return [];
    if (mode === "multiple") return ["redis", "libsql"];
    return ["redis", "postgres"];
  }
  async #isLocalDatabaseUp(workspace: Workspace, mode: DatabaseMode) {
    const requiredServices = this.#getLocalDatabaseServices(mode);
    if (!requiredServices.length) return true;
    const output = await workspace.spawn("docker", ["compose", "ps", "--services", "--status", "running"], {
      cwd: `${workspace.workspaceRoot}/local`,
    });
    const runningServices = new Set(output.split(/\s+/).filter(Boolean));
    return requiredServices.every((service) => runningServices.has(service));
  }
  async dbup(workspace: Workspace, mode: DatabaseMode = "multiple"): Promise<boolean> {
    if (mode === "single") return true;
    try {
      await workspace.applyTemplate({
        basePath: "local",
        template: "localDev",
        dict: { repoName: workspace.repoName },
        overwrite: false,
      });
      const wasAlreadyUp = await this.#isLocalDatabaseUp(workspace, mode);
      if (!wasAlreadyUp)
        await workspace.spawn(`docker`, ["compose", "up", "-d", ...this.#getLocalDatabaseServices(mode)], {
          cwd: `${workspace.workspaceRoot}/local`,
        });
      return wasAlreadyUp;
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : JSON.stringify(error) || "Unknown error";
      throw new Error(
        [
          "Docker daemon may not be running. Please install Docker or start the Docker daemon and try again.",
          `Original error:\n${detail}`,
        ].join("\n\n"),
      );
    }
  }
  async dbdown(workspace: Workspace) {
    await workspace.spawn(`docker`, ["compose", "down"], { cwd: `${workspace.workspaceRoot}/local` });
  }

  async configureApp(app: App) {
    const [target] = await resolveMobileTargets(app, undefined);
    if (!target) throw new Error(`No mobile target configured for ${app.name}`);
    const capacitorApp = new CapacitorApp(app, target.config);
    await capacitorApp.init();
    // TODO: 이미 있으면 패스하는 로직 추가 필요
    if (await confirm({ message: "want to add camera permission?" })) await capacitorApp.addCamera();
    if (await confirm({ message: "want to add contact permission?" })) await capacitorApp.addContact();
    if (await confirm({ message: "want to add location permission?" })) await capacitorApp.addLocation();
    await capacitorApp.save();
  }

  async releaseSource(
    app: App,
    { rebuild, buildNum = 0, environment = "debug", local = true }: ReleaseSourceOptions = {},
  ) {
    await new ApplicationReleasePackager(app, { build: () => this.build(app).then(() => undefined) }).releaseSource({
      rebuild,
      buildNum,
      environment,
      local,
    });
    return;
  }

  async createApplicationTemplate(workspace: Workspace, appName: string) {
    await workspace.applyTemplate({ basePath: `apps/${appName}`, template: "appRoot", dict: { appName } });
  }

  async compressProjectFiles(
    app: App,
    { rebuild, buildNum = 0, environment = "debug", local = true }: ReleaseSourceOptions = {},
  ) {
    await new ApplicationReleasePackager(app, {
      build: () => this.build(app).then(() => undefined),
    }).compressProjectFiles({
      rebuild,
      buildNum,
      environment,
      local,
    });
    return;
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
    await chain.invoke({ projectName, projectDesc });
    spinner.succeed("Loading complete!");

    // const dict = {
    //   appName: projectConfig.en.projectName,
    //   AppName: projectConfig.en.projectName.charAt(0).toUpperCase() + projectConfig.en.projectName.slice(1),
    //   template: "",
    // };

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
    //           "value": "libs/shared",`,
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
    // addText(tree, `apps/${projectConfig.en.projectName}/page/(${projectConfig.en.projectName})/(public)/_index.tsx`, {
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

    // // addText(tree, `apps/${projectConfig.en.projectName}/page/(${projectConfig.en.projectName})/(public)/_index.tsx`, {
    // //   type: "after",
    // //   signal: `   `,
    // //   text: `
    // //   <img src="./logo_1024*1024.png" alt="logo" />
    // //   `,
    // // });
    // // console.log(projectConfig.light);
  }

  async testApplication(app: App) {
    // await app.workspace.spawn(
    //   "node",
    //   ["node_modules/jest/bin/jest.js", `apps/${app.name}`, "-c", `apps/${app.name}/jest.config.ts`],
    //   {
    //     env: {
    //       ...this.#getEnv(app, "backend"),
    //       AKAN_PUBLIC_ENV: "testing",
    //       AKAN_PUBLIC_OPERATION_MODE: "local",
    //       AKAN_PUBLIC_APP_NAME: app.name,
    //       NODE_TLS_REJECT_UNAUTHORIZED: "0",
    //     },
    //   }
    // );
  }
}
