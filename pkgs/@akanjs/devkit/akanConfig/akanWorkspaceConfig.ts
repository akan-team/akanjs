import path from "node:path";
import type { SubspaceConfigInput, WorkspaceConfig, WorkspacePipelineConfig } from "akanjs";
import type { WorkspaceExecutor } from "../executors";
import { FileSys } from "../fileSys";
import { AkanAppConfig } from "./akanConfig";

/** The workspace root's own `akan.config.ts`: settings that belong to no app. */
export class AkanWorkspaceConfig {
  static readonly fileName = "akan.config.ts";
  static readonly #keys = ["subspace", "pipeline", "cloud"];
  static readonly #loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];

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
  /** `cloud.host` without a trailing slash, or null for Akan Cloud. */
  readonly cloudHost: string | null;

  constructor(file: string | null, input: unknown) {
    this.file = file;
    if (typeof input !== "object" || input === null || Array.isArray(input))
      throw new Error("The workspace root akan.config.ts must default-export a WorkspaceConfig object.");
    for (const key of Object.keys(input))
      if (!AkanWorkspaceConfig.#keys.includes(key))
        throw new Error(
          `The workspace root akan.config.ts declares \`${key}\`, which it does not take: it holds \`subspace\`, \`pipeline\` and \`cloud\`, and app or lib settings belong in apps/<app>/akan.config.ts or libs/<lib>/akan.config.ts.`,
        );
    const config = input as WorkspaceConfig;
    this.subspace = config.subspace ?? null;
    this.pipeline = config.pipeline ?? null;
    this.cloudHost = AkanWorkspaceConfig.#cloudHost(config.cloud);
  }

  //? The CLI sends its cloud login token to this host, so plain http is refused anywhere but this computer.
  static #cloudHost(cloud: unknown): string | null {
    if (cloud === undefined) return null;
    const refuse = (why: string): never => {
      throw new Error(`The workspace root akan.config.ts has cloud ${why}.`);
    };
    if (typeof cloud !== "object" || cloud === null || Array.isArray(cloud)) return refuse("that is not an object");
    const unknown = Object.keys(cloud).filter((key) => key !== "host");
    if (unknown.length) return refuse(`keys it does not take: ${unknown.join(", ")} (only \`host\`)`);
    const { host } = cloud as { host?: unknown };
    if (host === undefined) return null;
    const url = typeof host === "string" && URL.canParse(host) ? new URL(host) : null;
    if (!url || url.search || url.hash || url.username || url.password)
      return refuse(`.host ${JSON.stringify(host)}, which is not a URL like "https://cloud.example.com"`);
    if (
      url.protocol !== "https:" &&
      !(url.protocol === "http:" && AkanWorkspaceConfig.#loopbackHosts.includes(url.hostname))
    )
      return refuse(`.host ${JSON.stringify(host)}: https only, or http on this computer`);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  }
}
