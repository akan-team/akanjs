import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { CodeScript } from "./code.script";

export class CodeCommand extends command("code", [CodeScript], ({ public: target }) => ({
  code: target({ desc: "Run the akan coding agent on a prompt" })
    .arg("prompt", String, { desc: "what the agent should do", nullable: true })
    .option("app", String, { desc: "narrow the agent to one app instead of the whole repo", nullable: true })
    .option("profile", String, { desc: "local, pod, review, or web", default: "local" })
    .option("model", String, { desc: "<provider>/<id>, e.g. deepseek/deepseek-flash", nullable: true })
    .option("json", Boolean, { desc: "print one event per line as JSON", default: false })
    .option("thinking", Boolean, { desc: "print the model's reasoning", default: false })
    .option("rpc", Boolean, { desc: "serve the agent over stdio for another process to drive", default: false })
    .option("rpcListen", String, {
      desc: "serve the RPC wire on unix:<path> or tcp:[host:]<port> instead of stdio",
      flag: "L",
      nullable: true,
    })
    // `-r` already belongs to `--rpc`, and the short flag is derived from the first letter unless one is given.
    .option("resume", String, { desc: "continue a stored session by id", flag: "R", nullable: true })
    .option("interactive", Boolean, {
      desc: "open the full-screen session even when a prompt is given",
      flag: "i",
      default: false,
    })
    .with(Workspace)
    .exec(async function (prompt, app, profile, model, json, thinking, rpc, rpcListen, resume, interactive, workspace) {
      const options = { app, profile, model, json, thinking, rpc, rpcListen, interactive, resume };
      await this.codeScript.run(workspace, prompt ?? "", options);
    }),
})) {}
