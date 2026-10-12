import { CloudApi, GlobalConfig } from "@akanjs/devkit/cloud";
import { type App, runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { Logger } from "akanjs/common";
import chalk from "chalk";
import { writeClipboard } from "../clipboard";
import { TunnelShare, type TunnelShareOptions } from "./TunnelShare";

export type ShareOptions = Omit<TunnelShareOptions, "onLost">;

export class TunnelRunner extends runner("tunnel") {
  /** Opens the share and blocks until the operator interrupts, because the agent is the process. */
  async share(app: App, options: ShareOptions) {
    const spinner = app.spinning("Requesting a tunnel...");
    const share = await TunnelShare.open(app, {
      ...options,
      onLost: (reason) => Logger.rawLog(`tunnel disconnected (${reason}); reconnecting`, undefined, "error"),
    }).catch((error: unknown) => {
      spinner.fail("Could not open the tunnel");
      throw error;
    });
    spinner.succeed(`${app.name} is shared`);
    const copied = await writeClipboard(share.url);
    Logger.rawLog(`\n  ${chalk.bold(share.url)}${copied ? chalk.dim("  (copied)") : ""}`);
    if (share.grant.expiresAt) Logger.rawLog(chalk.dim(`  expires ${share.grant.expiresAt}`));
    Logger.rawLog(chalk.dim(`  code ${share.grant.code} — stop it with: akan tunnel --stop ${share.grant.code}\n`));
    await TunnelRunner.holdUntilInterrupt(() => share.close());
  }

  async list(workspace: Workspace, host?: string | null) {
    const api = await CloudApi.fromHost(workspace, await GlobalConfig.hostFor(workspace, host));
    const tunnels = await api.tunnelListInSelf();
    if (!tunnels.length) {
      Logger.rawLog("No tunnels are open.");
      return;
    }
    for (const tunnel of tunnels)
      Logger.rawLog(
        `${tunnel.connected ? chalk.green("●") : chalk.dim("○")} ${tunnel.code}  ${tunnel.url}` +
          `${tunnel.name ? `  ${chalk.dim(tunnel.name)}` : ""}` +
          `${tunnel.expiresAt ? chalk.dim(`  expires ${tunnel.expiresAt}`) : ""}`,
      );
  }

  async stop(code: string, workspace: Workspace, host?: string | null) {
    const api = await CloudApi.fromHost(workspace, await GlobalConfig.hostFor(workspace, host));
    const stopped = await api.revokeTunnel(code);
    if (stopped) Logger.rawLog(`Stopped ${code}.`);
    else Logger.rawLog(`No tunnel named ${code} is open.`, undefined, "error");
  }

  // A second interrupt abandons the release rather than looking hung; the share then expires on its own TTL.
  static holdUntilInterrupt(onInterrupt: () => Promise<void>) {
    return new Promise<void>((resolve) => {
      let closing = false;
      const stop = () => {
        if (closing) {
          Logger.rawLog("Abandoning the tunnel release; it will expire on its own.", undefined, "error");
          process.exit(130);
        }
        closing = true;
        void onInterrupt().then(() => resolve());
      };
      process.on("SIGINT", stop);
      process.on("SIGTERM", stop);
    });
  }
}
