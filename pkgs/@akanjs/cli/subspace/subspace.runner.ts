import { CommandContainer, runner, type Workspace } from "@akanjs/devkit/commandDecorators";
import { Subspace, type SubspaceEnvUploadResult } from "@akanjs/devkit/subspace";
import { SubspaceConfig } from "@akanjs/devkit/subspaceConfig";

export type SubspaceAction = "status" | "plan" | "diff" | "push" | "pull" | "upload-env";
type SubspacePrompts = Pick<typeof import("@inquirer/prompts"), "checkbox" | "confirm" | "select">;

// @inquirer is ~24MB and only the no-name form of a command ever prompts, so the stack loads on first use.
const loadPrompts = async (): Promise<SubspacePrompts> => await import("@inquirer/prompts");

export class SubspaceRunner extends runner("subspace") {
  static readonly multiTargetActions: readonly SubspaceAction[] = ["status", "push"];

  async config(workspace: Workspace) {
    const config = await SubspaceConfig.from(workspace);
    if (!config)
      throw new Error(
        "The workspace root akan.config.ts declares no `subspace`. Declare the customer repos there first.",
      );
    return config;
  }

  async subspaces(workspace: Workspace, names: string[]) {
    const config = await this.config(workspace);
    const subspaces = config.select(names).map((declaration) => new Subspace(workspace, config, declaration));
    const branch = (await workspace.spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    return { config, subspaces, branch };
  }

  static #isInteractive() {
    return process.stdin.isTTY === true && process.stdout.isTTY === true;
  }

  /** The names `akan subspace <action>` acts on when none was given: asked in a terminal, refused elsewhere. */
  async selectNames(workspace: Workspace, action: SubspaceAction): Promise<string[]> {
    const config = await this.config(workspace);
    return await SubspaceRunner.chooseNames(config, action, { interactive: SubspaceRunner.#isInteractive() });
  }

  static async chooseNames(
    config: SubspaceConfig,
    action: SubspaceAction,
    { interactive, prompts }: { interactive: boolean; prompts?: SubspacePrompts },
  ): Promise<string[]> {
    const multiple = SubspaceRunner.multiTargetActions.includes(action);
    if (!config.subspaces.length) throw new Error(`${SubspaceConfig.source} declares no subspaces.`);
    if (!interactive) {
      throw new Error(
        multiple
          ? `\`akan subspace ${action}\` needs a subspace name when it cannot prompt. Pass one, or run \`akan subspace ${action}-all\` for every subspace.`
          : `\`akan subspace ${action}\` needs a subspace name when it cannot prompt — it is reviewed one repo at a time.`,
      );
    }
    const { checkbox, select } = prompts ?? (await loadPrompts());
    const choices = config.subspaces.map((subspace) => ({
      name: subspace.name,
      value: subspace.name,
      description: `${subspace.repo} · ${subspace.apps.join(", ")}`,
    }));
    if (multiple) return await checkbox({ message: `Select subspaces to ${action}`, choices, required: true });
    return [await select({ message: `Select a subspace to ${action}`, choices })];
  }

  async status(workspace: Workspace, names: string[]) {
    const { subspaces, branch } = await this.subspaces(workspace, names);
    //? Sequential: every one fetches into the same object store, and concurrent fetches contend on its index lock.
    const statuses = [];
    for (const subspace of subspaces) statuses.push(await subspace.status(branch));
    return statuses;
  }

  async push(workspace: Workspace, names: string[], { verify }: { verify?: boolean } = {}) {
    const { config, subspaces, branch } = await this.subspaces(workspace, names);
    config.assertPushable(branch);
    const results = [];
    for (const subspace of subspaces) results.push(await subspace.push(branch, { verify }));
    return results;
  }

  async plan(workspace: Workspace, name: string) {
    const { subspaces, branch } = await this.subspaces(workspace, [name]);
    const [subspace] = subspaces;
    if (!subspace) throw new Error(`Unknown subspace "${name}"`);
    return await subspace.plan(branch);
  }

  async diff(workspace: Workspace, name: string, filter?: string | null) {
    const { subspaces, branch } = await this.subspaces(workspace, [name]);
    const [subspace] = subspaces;
    if (!subspace) throw new Error(`Unknown subspace "${name}"`);
    return await subspace.diff(branch, filter);
  }

  async pull(workspace: Workspace, name: string, { adoptLibs }: { adoptLibs?: boolean } = {}) {
    const { subspaces, branch } = await this.subspaces(workspace, [name]);
    const [subspace] = subspaces;
    if (!subspace) throw new Error(`Unknown subspace "${name}"`);
    return await subspace.pull(branch, { adoptLibs });
  }

  // The slice a push ships: an archive is replaced whole, so more would hand one customer every other customer's
  // secrets, and less would leave the deployment short of a value.
  async uploadEnv(
    workspace: Workspace,
    name: string,
    { host, force }: { host: string; force?: boolean },
  ): Promise<SubspaceEnvUploadResult> {
    //? Not `subspaces()`: an env archive is per cloud workspace, so this is the one action with no branch.
    const config = await this.config(workspace);
    const [declaration] = config.select([name]);
    if (!declaration) throw new Error(`Unknown subspace "${name}"`);
    const subspace = new Subspace(workspace, config, declaration);
    const { workspaceId } = subspace;
    if (!workspaceId)
      throw new Error(
        `Subspace "${subspace.name}" declares no workspaceId. Add its cloud workspace id to ${SubspaceConfig.source}.`,
      );
    if (workspaceId === workspace.getWorkspaceId({ allowEmpty: true }))
      throw new Error(
        `Subspace "${subspace.name}" declares this workspace's own id. Uploading a slice there would replace the workspace's env archive with a subset of it.`,
      );
    const apps = subspace.apps;
    //? Asked before the slice is planned, so a refusal costs nothing and a non-terminal run fails at once.
    const asked = await SubspaceRunner.confirmEnvUpload(
      { name: subspace.name, workspaceId, apps, force },
      { interactive: SubspaceRunner.#isInteractive() },
    );
    if (!asked) return { name: subspace.name, workspaceId, host, apps, libs: [], outcome: "cancelled", files: [] };
    const { libs } = await subspace.slice();
    // Lazy: CloudScript reaches the ai and build stacks, which every other `akan subspace` action would pay for.
    const { CloudScript } = await import("../cloud/cloud.script");
    const { files } = await CommandContainer.get(CloudScript).uploadEnv(workspace, {
      host,
      workspaceId,
      scope: { apps, libs },
      archivePath: `local/env.${subspace.name}.tar`,
    });
    return { name: subspace.name, workspaceId, host, apps, libs, outcome: "uploaded", files };
  }

  static async confirmEnvUpload(
    { name, workspaceId, apps, force }: { name: string; workspaceId: string; apps: string[]; force?: boolean },
    { interactive, prompts }: { interactive: boolean; prompts?: SubspacePrompts },
  ) {
    if (force) return true;
    const target = `subspace "${name}" (cloud workspace ${workspaceId})`;
    if (!interactive)
      throw new Error(`Refusing to replace the env archive of ${target} with no terminal to ask in. Pass --force.`);
    const { confirm } = prompts ?? (await loadPrompts());
    return await confirm({
      message: `Replace the env archive of ${target} with this workspace's env for ${apps.join(", ")} and the libraries they pull in?`,
      default: false,
    });
  }
}
