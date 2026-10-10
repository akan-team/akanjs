import path from "node:path";
import type { SubspaceConfigInput, WorkspaceConfig, WorkspacePipelineConfig } from "akanjs";
import type { WorkspaceExecutor } from "../executors";
import { FileSys } from "../fileSys";
import { AkanAppConfig } from "./akanConfig";

/** The workspace root's own `akan.config.ts`: settings that belong to no app. Absent, it is an empty one. */
export class AkanWorkspaceConfig {
  static readonly fileName = "akan.config.ts";
  static readonly #keys = ["subspace", "pipeline"];

  static async from(workspace: WorkspaceExecutor, { bustImportCache = false }: { bustImportCache?: boolean } = {}) {
    const file = path.join(workspace.workspaceRoot, AkanWorkspaceConfig.fileName);
    if (!(await FileSys.fileExists(file))) return new AkanWorkspaceConfig(null, {});
    const input = await AkanAppConfig.importConfigModule(workspace.workspaceRoot, { bustImportCache });
    return new AkanWorkspaceConfig(file, input);
  }

  /** Absolute path, or null when the workspace has none. */
  readonly file: string | null;
  readonly subspace: SubspaceConfigInput | null;
  readonly pipeline: WorkspacePipelineConfig | null;

  constructor(file: string | null, input: unknown) {
    this.file = file;
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error("The workspace root akan.config.ts must default-export a WorkspaceConfig object.");
    for (const key of Object.keys(input))
      if (!AkanWorkspaceConfig.#keys.includes(key))
        throw new Error(
          `The workspace root akan.config.ts declares \`${key}\`, which it does not take: it holds \`subspace\` and \`pipeline\`, and app or lib settings belong in apps/<app>/akan.config.ts or libs/<lib>/akan.config.ts.`,
        );
    const config = input as WorkspaceConfig;
    this.subspace = config.subspace ?? null;
    this.pipeline = config.pipeline ?? null;
  }
}
