import type { App } from "@akanjs/devkit/commandDecorators";
import { FrameworkGraph } from "@akanjs/devkit/docs/frameworkGraph";
import { GitRevision } from "@akanjs/devkit/workspace/gitRevision";
import { WorkspaceGraph } from "@akanjs/devkit/workspace/workspaceGraph";
import type { BuildChangesPayload, BuilderGraphReq, BuildFrameworkPayload, BuildGraphPayload } from "akanjs/server";

export class BuilderGraphPayloads {
  readonly #app: App;
  readonly #generation: () => number;
  #graph: { generation: number; payload: BuildGraphPayload } | null = null;
  #changes: { key: string; payload: Promise<BuildChangesPayload> } | null = null;

  constructor(app: App, generation: () => number) {
    this.#app = app;
    this.#generation = generation;
  }

  touched(files: string[]) {
    FrameworkGraph.touched(this.#app.workspace.workspaceRoot, files);
  }

  async of(msg: BuilderGraphReq): Promise<BuildGraphPayload | BuildChangesPayload | BuildFrameworkPayload> {
    if (msg.framework) return await this.#framework();
    return msg.changes ? await this.#changesSince(msg.changes.since) : await this.#workspaceGraph();
  }

  async #workspaceGraph(): Promise<BuildGraphPayload> {
    const generation = this.#generation();
    if (this.#graph?.generation !== generation) {
      const { workspace } = this.#app;
      const graph = WorkspaceGraph.visibleTo(await WorkspaceGraph.build(workspace), this.#app.name);
      this.#graph = { generation, payload: { workspaceRoot: workspace.workspaceRoot, graph } };
    }
    return this.#graph.payload;
  }

  async #framework(): Promise<BuildFrameworkPayload> {
    const { workspaceRoot } = this.#app.workspace;
    return { workspaceRoot, framework: await FrameworkGraph.cached(workspaceRoot) };
  }

  async #changesSince(since: string | null): Promise<BuildChangesPayload> {
    const { workspace, name } = this.#app;
    const { workspaceRoot } = workspace;
    const forkPoint = await new GitRevision(workspaceRoot).forkPointOf(since);
    if (forkPoint.error !== undefined) return { workspaceRoot, changes: { error: forkPoint.error } };
    const key = `${this.#generation()}:${forkPoint.sha}`;
    if (this.#changes?.key !== key) {
      const payload = WorkspaceGraph.changesAt(workspace, forkPoint.sha).then((changes) => ({
        workspaceRoot,
        changes: WorkspaceGraph.changesVisibleTo(changes, name),
      }));
      payload.catch(() => {
        if (this.#changes?.payload === payload) this.#changes = null;
      });
      this.#changes = { key, payload };
    }
    return await this.#changes.payload;
  }
}
