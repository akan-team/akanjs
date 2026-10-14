import type { SubspaceConfigInput, SubspaceDeclaration } from "akanjs";
import type { WorkspaceExecutor } from "./executors";

export type { SubspaceConfigInput, SubspaceDeclaration };

// No branch field: the workspace's current branch is used, so every subspace on it holds the same akanjs and libs.
export class SubspaceConfig {
  static readonly source = "subspace in the workspace root akan.config.ts";
  static readonly defaultPushableBranches = ["main", "develop", "debug"];

  static async from(workspace: WorkspaceExecutor): Promise<SubspaceConfig | null> {
    const { subspace } = await workspace.getConfig();
    return subspace ? new SubspaceConfig(subspace) : null;
  }

  readonly pushableBranches: string[];
  readonly exclude: string[];
  readonly subspaces: SubspaceDeclaration[];

  constructor(input: SubspaceConfigInput) {
    this.pushableBranches = input.pushableBranches ?? SubspaceConfig.defaultPushableBranches;
    this.exclude = input.exclude ?? [];
    this.subspaces = input.subspaces ?? [];
    this.#assertValid();
  }

  #assertValid() {
    const seenNames = new Set<string>();
    const appOwners = new Map<string, string>();
    const idOwners = new Map<string, string>();
    for (const subspace of this.subspaces) {
      if (!subspace.name || !subspace.repo)
        throw new Error(`${SubspaceConfig.source}: every subspace needs a name and a repo`);
      if (seenNames.has(subspace.name))
        throw new Error(`${SubspaceConfig.source}: duplicate subspace "${subspace.name}"`);
      seenNames.add(subspace.name);
      if (!subspace.apps?.length)
        throw new Error(`${SubspaceConfig.source}: subspace "${subspace.name}" declares no apps`);
      for (const app of subspace.apps) {
        const owner = appOwners.get(app);
        //* One app never goes to two subspaces: per-subspace domains and ids are not expressible. Share a lib instead.
        if (owner)
          throw new Error(
            `${SubspaceConfig.source}: app "${app}" is claimed by both "${owner}" and "${subspace.name}"`,
          );
        appOwners.set(app, subspace.name);
      }
      if (!subspace.workspaceId) continue;
      const idOwner = idOwners.get(subspace.workspaceId);
      //* An env upload replaces the cloud workspace's archive whole, so two subspaces would overwrite each other.
      if (idOwner)
        throw new Error(
          `${SubspaceConfig.source}: subspaces "${idOwner}" and "${subspace.name}" declare the same workspaceId`,
        );
      idOwners.set(subspace.workspaceId, subspace.name);
    }
  }

  select(names: string[]) {
    if (!names.length) return this.subspaces;
    return names.map((name) => {
      const subspace = this.subspaces.find((candidate) => candidate.name === name);
      if (!subspace) throw new Error(`${SubspaceConfig.source}: unknown subspace "${name}"`);
      return subspace;
    });
  }

  assertPushable(branch: string) {
    if (this.pushableBranches.includes(branch)) return;
    throw new Error(
      `Branch "${branch}" is not pushable. \`subspace.pushableBranches\` in the workspace root akan.config.ts allows: ${this.pushableBranches.join(", ")}`,
    );
  }
}
