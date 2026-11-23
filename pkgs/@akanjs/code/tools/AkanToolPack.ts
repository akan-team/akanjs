import type { Workspace } from "@akanjs/devkit/commandDecorators";
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { AkanVerifier } from "./AkanVerifier";

export type AkanToolMode = "readonly" | "plan" | "apply";

export interface AkanCatalogTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

export interface AkanToolCatalog {
  list: (mode: AkanToolMode) => Promise<AkanCatalogTool[]>;
  call: (workspace: Workspace, name: string, args: Record<string, unknown>, mode: AkanToolMode) => Promise<unknown>;
}

export interface AkanToolPackOptions {
  workspace: Workspace;
  cwd: string;
  /** `readonly` for a reviewer, `apply` for an agent that may run a workflow. */
  mode: AkanToolMode;
  catalog?: AkanToolCatalog;
}

// Wraps the CLI's in-process akan MCP dispatcher (ContextRunner), handed in as the catalog: a copy would drift from it.
export class AkanToolPack {
  readonly #options: AkanToolPackOptions;

  constructor(options: AkanToolPackOptions) {
    this.#options = options;
  }

  extension(): InlineExtension {
    return { name: "akan-tools", factory: async (pi) => await this.#register(pi) };
  }

  // The session allowlist covers extension tools too; a name missing here tells the model the tool does not exist.
  async names() {
    const listed = (await this.#options.catalog?.list(this.#options.mode)) ?? [];
    return [...listed.map((tool) => tool.name), AkanToolPack.verifyToolName];
  }

  static readonly verifyToolName = "akan_verify";

  async #register(pi: ExtensionAPI) {
    if (this.#options.catalog) await this.#registerCatalog(pi, this.#options.catalog);
    this.#registerVerify(pi);
  }

  async #registerCatalog(pi: ExtensionAPI, catalog: AkanToolCatalog) {
    const { workspace, mode } = this.#options;
    for (const tool of await catalog.list(mode)) {
      const description = tool.description ?? tool.name;
      pi.registerTool({
        name: tool.name,
        label: tool.name,
        description,
        // Without a snippet the engine leaves a custom tool out of the system prompt's tool list entirely.
        promptSnippet: `${tool.name}: ${description.split(".")[0] ?? description}`,
        parameters: Type.Unsafe<Record<string, unknown>>(tool.inputSchema),
        execute: async (_id, params) => {
          const result = await catalog.call(workspace, tool.name, params ?? {}, mode);
          const text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
          return { content: [{ type: "text", text }], details: undefined };
        },
      });
    }
  }

  #registerVerify(pi: ExtensionAPI) {
    const verifier = new AkanVerifier(this.#options.cwd);
    pi.registerTool({
      name: AkanToolPack.verifyToolName,
      label: "akan verify",
      description:
        "Run `akan verify` over everything the working tree has changed: sync, lint (with fixes), typecheck, a build of each changed app's server and SSR routes, and the SSR check for .tsx changes, in one call. It prints one line when it passes and one line per problem when it fails. Call this after editing, before you finish; never run lint, typecheck or build separately.",
      promptSnippet: "akan_verify: sync, lint, typecheck and build what the working tree changed, in one call",
      parameters: Type.Object({}),
      execute: async () => {
        const report = await verifier.verify();
        return { content: [{ type: "text", text: report.text }], details: undefined, isError: !report.ok };
      },
    });
  }
}
