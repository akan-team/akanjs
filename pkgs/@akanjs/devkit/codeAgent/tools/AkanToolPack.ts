import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { Workspace } from "../../commandDecorators";
import { AkanVerifier } from "./AkanVerifier";

export interface AkanToolPackOptions {
  workspace: Workspace;
  cwd: string;
  /** `readonly` for a reviewer, `apply` for an agent that may run a workflow. */
  mode: "readonly" | "plan" | "apply";
}

// Wraps the akan MCP catalogue's in-process dispatcher (ContextRunner.callMcpTool); a second copy would drift from it.
export class AkanToolPack {
  readonly #options: AkanToolPackOptions;

  constructor(options: AkanToolPackOptions) {
    this.#options = options;
  }

  extension(): InlineExtension {
    return { name: "akan-tools", factory: async (pi) => await this.#register(pi) };
  }

  // The session allowlist covers extension tools too; a name missing here tells the model the tool does not exist.
  // devkit must not depend on the CLI, so ContextRunner is reached by relative path; publishing bundles both.
  async names() {
    const { ContextRunner } = await import("../../../cli/context/context.runner");
    return [
      ...new ContextRunner().listMcpTools(this.#options.mode).map((tool) => tool.name),
      AkanToolPack.verifyToolName,
    ];
  }

  static readonly verifyToolName = "akan_verify";

  async #register(pi: ExtensionAPI) {
    const { ContextRunner } = await import("../../../cli/context/context.runner");
    const runner = new ContextRunner();
    const guidelineNames = await AkanToolPack.#guidelineNames();
    for (const tool of runner.listMcpTools(this.#options.mode, { guidelineNames })) {
      const description = tool.description ?? tool.name;
      pi.registerTool({
        name: tool.name,
        label: tool.name,
        description,
        // Without a snippet the engine leaves a custom tool out of the system prompt's tool list entirely.
        promptSnippet: `${tool.name}: ${description.split(".")[0] ?? description}`,
        parameters: Type.Unsafe<Record<string, unknown>>(tool.inputSchema),
        execute: async (_id, params) => {
          const result = await runner.callMcpTool(this.#options.workspace, tool.name, params ?? {}, {
            mode: this.#options.mode,
          });
          const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
          return { content: [{ type: "text", text }], details: undefined };
        },
      });
    }
    this.#registerVerify(pi);
  }

  #registerVerify(pi: ExtensionAPI) {
    const verifier = new AkanVerifier(this.#options.cwd);
    pi.registerTool({
      name: AkanToolPack.verifyToolName,
      label: "akan verify",
      description:
        "Run `akan verify` over everything the working tree has changed: sync, lint (with fixes), typecheck, a fast build of each changed app, and the SSR check for .tsx changes, in one call. It prints one line when it passes and one line per problem when it fails. Call this after editing, before you finish; never run lint, typecheck or build separately.",
      promptSnippet: "akan_verify: sync, lint, typecheck and build what the working tree changed, in one call",
      parameters: Type.Object({}),
      execute: async () => {
        const report = await verifier.verify();
        return { content: [{ type: "text", text: report.text }], details: undefined, isError: !report.ok };
      },
    });
  }

  static async #guidelineNames() {
    try {
      const { Prompter } = await import("../../prompter");
      return await Prompter.listGuidelines();
    } catch {
      return [];
    }
  }
}
