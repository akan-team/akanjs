import type { CommandCls } from "@akanjs/devkit/commandDecorators";

// Lazy: each module pulls its own heavy stack, and `akan start` holds its process for the whole dev session.
export const commandModules = {
  workspace: async () => (await import("./workspace/workspace.command")).WorkspaceCommand,
  agent: async () => (await import("./agent/agent.command")).AgentCommand,
  code: async () => (await import("./code/code.command")).CodeCommand,
  application: async () => (await import("./application/application.command")).ApplicationCommand,
  library: async () => (await import("./library/library.command")).LibraryCommand,
  localRegistry: async () => (await import("./localRegistry/localRegistry.command")).LocalRegistryCommand,
  package: async () => (await import("./package/package.command")).PackageCommand,
  module: async () => (await import("./module/module.command")).ModuleCommand,
  page: async () => (await import("./page/page.command")).PageCommand,
  context: async () => (await import("./context/context.command")).ContextCommand,
  cloud: async () => (await import("./cloud/cloud.command")).CloudCommand,
  subspace: async () => (await import("./subspace/subspace.command")).SubspaceCommand,
  guideline: async () => (await import("./guideline/guideline.command")).GuidelineCommand,
  scalar: async () => (await import("./scalar/scalar.command")).ScalarCommand,
  primitive: async () => (await import("./primitive/primitive.command")).PrimitiveCommand,
  quality: async () => (await import("./quality/quality.command")).QualityCommand,
  repair: async () => (await import("./repair/repair.command")).RepairCommand,
  workflow: async () => (await import("./workflow/workflow.command")).WorkflowCommand,
  pipeline: async () => (await import("./pipeline/pipeline.command")).PipelineCommand,
  tunnel: async () => (await import("./tunnel/tunnel.command")).TunnelCommand,
} satisfies Record<string, () => Promise<CommandCls>>;

export type CommandModuleId = keyof typeof commandModules;

/** Registration order, which is also the order commands appear in global `--help`. */
export const commandModuleIds = Object.keys(commandModules) as CommandModuleId[];
