import { script, type Workspace } from "@akanjs/devkit/commandDecorators";
import { AppExecutor } from "@akanjs/devkit/executors";
import { select } from "@inquirer/prompts";
import { TunnelRunner } from "./tunnel.runner";

export interface TunnelShareArgs {
  workspace: Workspace;
  host?: string | null;
  port?: number;
  ttl?: number;
}

export class TunnelScript extends script("tunnel", [TunnelRunner]) {
  // Resolved here, not through the `App` internal arg, which would open an app picker for `--list` and `--stop`.
  static async resolveApp(workspace: Workspace, name: string | null) {
    const appNames = await workspace.getApps();
    if (!appNames.length) throw new Error("No apps found in this workspace (apps/<appName>/akan.config.ts)");
    if (name && !appNames.includes(name)) throw new Error(`Unknown app: ${name}. Available: ${appNames.join(", ")}`);
    if (name) return AppExecutor.from(workspace, name);
    const only = appNames.length === 1 ? appNames[0] : null;
    if (only) return AppExecutor.from(workspace, only);
    return AppExecutor.from(workspace, await select<string>({ message: "Select the app to share", choices: appNames }));
  }

  async share(name: string | null, { workspace, host, port, ttl }: TunnelShareArgs) {
    const app = await TunnelScript.resolveApp(workspace, name);
    await this.tunnelRunner.share(app, {
      workspace,
      ...(host ? { host } : {}),
      ...(port ? { port } : {}),
      ...(ttl ? { ttlMinutes: ttl } : {}),
    });
  }

  async list(workspace: Workspace, host?: string | null) {
    await this.tunnelRunner.list(workspace, host);
  }

  async stop(code: string, workspace: Workspace, host?: string | null) {
    await this.tunnelRunner.stop(code, workspace, host);
  }
}
