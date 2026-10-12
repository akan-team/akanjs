import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { SubspaceScript } from "./subspace.script";

export class SubspaceCommand extends command("subspace", [SubspaceScript], ({ public: target }) => ({
  subspace: target({ desc: "Mirror apps and libraries between this workspace and the customer repos it serves" })
    .arg("action", String, {
      desc: "subspace action; plan reads this checkout alone, status-all and push-all take every declared subspace",
      default: "status",
      enum: ["status", "status-all", "plan", "diff", "push", "push-all", "pull", "upload-env"],
    })
    .arg("subspace", String, {
      desc: "subspace name; asks which one(s) when omitted, and is refused by status-all / push-all",
      nullable: true,
    })
    .with(Workspace)
    .option("format", String, { desc: "output format", default: "text", enum: ["text", "json"] })
    .option("verify", Boolean, {
      flag: "y",
      desc: "run bun install + akan sync in the subspace before committing",
      default: true,
    })
    .option("adoptLibs", Boolean, { desc: "pull: also apply the subspace's library edits", default: false })
    .option("path", String, { desc: "diff: limit to one path", nullable: true })
    .option("host", String, {
      desc: "upload-env: host of the cloud to target (default: cloud.host of the root akan.config.ts, else Akan Cloud)",
      nullable: true,
    })
    //? -f is already `--format`, and -y already `--verify`.
    .option("force", Boolean, {
      flag: "F",
      desc: "upload-env: replace the subspace's env archive without asking",
      default: false,
    })
    .exec(async function (action, subspace, workspace, format, verify, adoptLibs, filePath, host, force) {
      const output = format as "text" | "json";
      const all = action === "status-all" || action === "push-all";
      const base = all ? (action.slice(0, -"-all".length) as "status" | "push") : action;
      if (
        base !== "status" &&
        base !== "plan" &&
        base !== "diff" &&
        base !== "push" &&
        base !== "pull" &&
        base !== "upload-env"
      )
        throw new Error(
          `Unknown subspace action: ${action}. Use status, status-all, plan, diff, push, push-all, pull or upload-env.`,
        );
      if (all && subspace)
        throw new Error(
          `\`akan subspace ${action}\` takes no name. Run \`akan subspace ${base} ${subspace}\` instead.`,
        );
      const names = subspace ? [subspace] : all ? [] : await this.subspaceScript.select(workspace, base);
      if (base === "status") await this.subspaceScript.status(workspace, names, output);
      else if (base === "push") await this.subspaceScript.push(workspace, names, { verify, format: output });
      else {
        const [name] = names;
        if (!name) throw new Error(`\`akan subspace ${base}\` needs a name — it is reviewed one repo at a time.`);
        if (base === "plan") await this.subspaceScript.plan(workspace, name, output);
        else if (base === "diff") await this.subspaceScript.diff(workspace, name, filePath, output);
        else if (base === "upload-env")
          await this.subspaceScript.uploadEnv(workspace, name, { host, force, format: output });
        else await this.subspaceScript.pull(workspace, name, { adoptLibs, format: output });
      }
    }),
})) {}
