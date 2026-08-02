import { command, Workspace } from "@akanjs/devkit/commandDecorators";
import { ContextScript } from "./context.script";

export class ContextCommand extends command("context", [ContextScript], ({ public: target }) => ({
  context: target({ desc: "Print agent-readable Akan workspace context" })
    .option("format", String, {
      desc: "output format",
      default: "markdown",
      enum: ["markdown", "json"],
    })
    .option("app", String, { desc: "app name to include", nullable: true })
    .option("module", String, { desc: "module name to include with abstract content", nullable: true })
    .with(Workspace)
    .exec(async function (format, app, module, workspace) {
      await this.contextScript.context(workspace, { format: format as "markdown" | "json", app, module });
    }),
  doctor: target({ desc: "Report Akan workspace convention diagnostics" })
    .option("format", String, {
      desc: "output format",
      default: "text",
      enum: ["text", "json"],
    })
    .option("strict", Boolean, { desc: "treat recommended conventions as errors", default: false })
    .option("ios", Boolean, {
      desc: "report iOS/mobile config diagnostics (placeholder bundle ids, etc.)",
      default: false,
    })
    .with(Workspace)
    .exec(async function (format, strict, ios, workspace) {
      await this.contextScript.doctor(workspace, { format: format as "text" | "json", strict, ios });
    }),
  mcpInstall: target({ desc: "Install the Akan MCP server config for Cursor, Claude Code, and Codex" })
    .arg("target", String, { desc: "cursor, claude, codex, or all", nullable: true })
    .option("force", Boolean, { desc: "overwrite an existing Akan MCP server entry", default: false })
    .option("mode", String, {
      desc: "MCP permission mode",
      default: "apply",
      enum: ["readonly", "plan", "apply"],
    })
    .with(Workspace)
    .exec(async function (targetName, force, mode, workspace) {
      await this.contextScript.mcpInstall(workspace, targetName, {
        force,
        mode: mode as "readonly" | "plan" | "apply",
      });
    }),
  mcp: target({ desc: "Start the Akan MCP server over stdio", stdio: true })
    .option("mode", String, {
      desc: "MCP permission mode",
      default: "readonly",
      enum: ["readonly", "plan", "apply"],
    })
    .with(Workspace)
    .exec(async function (mode, workspace) {
      await this.contextScript.mcp(workspace, { mode: mode as "readonly" | "plan" | "apply" });
    }),
  mcpCall: target({ desc: "Call one Akan MCP tool for debugging without stdio JSON-RPC" })
    .arg("tool", String, { desc: "MCP tool name" })
    .option("mode", String, {
      desc: "MCP permission mode",
      default: "readonly",
      enum: ["readonly", "plan", "apply"],
    })
    .option("args", String, { desc: "JSON object to pass as MCP tool arguments", nullable: true })
    .option("format", String, {
      desc: "output format",
      default: "json",
      enum: ["json"],
    })
    .with(Workspace)
    .exec(async function (tool, mode, args, format, workspace) {
      await this.contextScript.mcpCall(workspace, tool, {
        mode: mode as "readonly" | "plan" | "apply",
        args,
        format: format as "json",
      });
    }),
})) {}
