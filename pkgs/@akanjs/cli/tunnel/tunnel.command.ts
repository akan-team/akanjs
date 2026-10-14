import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { TunnelScript } from "./tunnel.script";

export class TunnelCommand extends command("tunnel", [TunnelScript], ({ public: target }) => ({
  tunnel: target({ desc: "Share a locally running app on a public URL" })
    .arg("app", String, { desc: "app to share", nullable: true })
    .option("list", Boolean, { desc: "list the shares this account is holding", default: false })
    .option("stop", String, { desc: "stop the share with this code", default: "" })
    .option("host", String, {
      desc: "host of the cloud (default: cloud.host of the root akan.config.ts, else Akan Cloud)",
      nullable: true,
    })
    .option("port", Number, { desc: "local port to share (default: the app's dev port)", nullable: true })
    .option("ttl", Number, { desc: "minutes before the share expires", nullable: true })
    .with(Workspace)
    .exec(async function (app, list, stop, host, port, ttl, workspace) {
      if (list) return await this.tunnelScript.list(workspace, host);
      if (stop) return await this.tunnelScript.stop(stop, workspace, host);
      await this.tunnelScript.share(app, { workspace, host, ...(port ? { port } : {}), ...(ttl ? { ttl } : {}) });
    }),
})) {}
