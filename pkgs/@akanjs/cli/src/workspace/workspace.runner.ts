import { AppExecutor, type AppSecret, Exec, getCredentials, PackageJson, type Workspace } from "@akanjs/devkit";
import { WorkspaceExecutor } from "@akanjs/devkit";
import latestVersion from "latest-version";
import path from "path";
import { v5 as uuid } from "uuid";

export class WorkspaceRunner {
  async createWorkspace(
    repoName: string,
    appName: string,
    { dirname = ".", tag = "latest" }: { dirname?: string; tag?: string }
  ) {
    const cwdPath = process.cwd();
    const workspaceRoot = path.join(cwdPath, dirname, repoName);

    // 1. create root files
    const workspace = WorkspaceExecutor.fromRoot({ workspaceRoot, repoName });
    const templateSpinner = workspace.spinning(`Creating workspace template files in ${dirname}/${repoName}...`);
    await workspace.applyTemplate({
      basePath: ".",
      template: "workspaceRoot",
      dict: { repoName, appName, serveDomain: "localhost" },
    });
    templateSpinner.succeed(`Workspace files created in ${dirname}/${repoName}`);
    // 2. update default package.json dependencies
    const rootPackageJson = workspace.getPackageJson();
    const dependencies = [
      "@akanjs/base",
      "@akanjs/cli",
      "@akanjs/client",
      "@akanjs/common",
      "@akanjs/config",
      "@akanjs/constant",
      "@akanjs/dictionary",
      "@akanjs/document",
      "@akanjs/nest",
      "@akanjs/next",
      "@akanjs/server",
      "@akanjs/service",
      "@akanjs/signal",
      "@akanjs/store",
      "@akanjs/ui",
    ];
    const devDependencies = ["@akanjs/devkit", "@akanjs/lint", "@akanjs/test"];
    const latestPublishedVersionOfBase = await latestVersion("@akanjs/base", { version: tag });
    const packageJson: PackageJson = {
      ...rootPackageJson,
      dependencies: {
        ...rootPackageJson.dependencies,
        ...Object.fromEntries(dependencies.map((dependency) => [dependency, latestPublishedVersionOfBase])),
      },
      devDependencies: {
        ...rootPackageJson.devDependencies,
        ...Object.fromEntries(devDependencies.map((dependency) => [dependency, latestPublishedVersionOfBase])),
      },
    };
    workspace.setPackageJson(packageJson);

    // 3. pnpm install
    const installSpinner = workspace.spinning("Installing dependencies with pnpm...");
    await workspace.spawn("pnpm", ["install", "--reporter=silent"]);
    installSpinner.succeed("Dependencies installed with pnpm");

    // 4. git init
    const gitSpinner = workspace.spinning("Initializing git repository and commit...");
    await workspace.commit("Initial commit", { init: true });
    gitSpinner.succeed("Git repository initialized and committed");

    return workspace;
  }
  async generateMongo(workspace: Workspace) {
    interface MongoConnection {
      id: string;
      favorite: {
        name: string;
        color: "color9";
      };
      savedConnectionType: "favorite";
      connectionOptions: {
        connectionString: string;
        sshTunnel?: {
          host: string;
          port: string;
          username: string;
          password: string;
        };
      };
    }

    interface MongoConnectionList {
      type: "Compass Connections";
      version: { $numberInt: "1" };
      connections: MongoConnection[];
    }

    const namespace = "00000000-0000-0000-0000-000000000000";

    const appNames = await workspace.getApps();
    const apps = appNames.map((appName) => AppExecutor.from(workspace, appName));
    const appDatas = apps.reduce<{ appName: string; env: "debug" | "develop" | "main"; secret: AppSecret }[]>(
      (acc, app) => [
        ...acc,
        ...(["debug", "develop", "main"] as const).map((env) => ({
          appName: app.name,
          env,
          secret: getCredentials(app, env),
        })),
      ],
      []
    );
    const mongoConnectionList: MongoConnectionList = {
      type: "Compass Connections",
      version: { $numberInt: "1" },
      connections: appDatas.map(({ appName, env, secret }) => ({
        id: uuid(`${appName}-${env}`, namespace),
        favorite: {
          name: `${appName}-${env}`,
          color: "color9",
        },
        savedConnectionType: "favorite",
        connectionOptions: {
          connectionString: `mongodb://${secret.mongo.account.user.username}:${secret.mongo.account.user.password}@mongo-0.mongo-svc.${appName}-${env}/?directConnection=true&authSource=${appName}-${env}`,
          sshTunnel: {
            host: `${appName}-${env}.${workspace.getBaseDevEnv().serveDomain}`,
            port: "32767",
            username: "root",
            password: workspace.repoName,
          },
        },
      })),
    };
    workspace.writeJson(`infra/master/mongo-connections.json`, mongoConnectionList);
  }
  async lint(exec: Exec, workspace: Workspace, { fix = true }: { fix?: boolean } = {}) {
    await workspace.spawn("node", ["node_modules/eslint/bin/eslint.js", exec.cwdPath, ...(fix ? ["--fix"] : [])]);
  }
}
