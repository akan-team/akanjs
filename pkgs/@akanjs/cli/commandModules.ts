import type { CommandCls } from "@akanjs/devkit/commandDecorators";

/**
 * Lazy loaders for every CLI command module, keyed by module id.
 *
 * Loading all of them costs ~173MB resident because each pulls its own stack (typescript, the
 * @langchain set, ssh2, @trapezedev/project, the tailwind stack). `akan start` needs one of them, and
 * a dev sandbox holds that process for its whole session — so the entry resolves `argv[2]` through
 * {@link CommandManifest} and imports only the owning module. The manifest is generated at build time
 * from these same loaders, so it can never name a module that does not exist here.
 */
export const commandModules = {
  workspace: async () => (await import("./workspace/workspace.command")).WorkspaceCommand,
  agent: async () => (await import("./agent/agent.command")).AgentCommand,
  application: async () => (await import("./application/application.command")).ApplicationCommand,
  library: async () => (await import("./library/library.command")).LibraryCommand,
  localRegistry: async () => (await import("./localRegistry/localRegistry.command")).LocalRegistryCommand,
  package: async () => (await import("./package/package.command")).PackageCommand,
  module: async () => (await import("./module/module.command")).ModuleCommand,
  page: async () => (await import("./page/page.command")).PageCommand,
  context: async () => (await import("./context/context.command")).ContextCommand,
  cloud: async () => (await import("./cloud/cloud.command")).CloudCommand,
  guideline: async () => (await import("./guideline/guideline.command")).GuidelineCommand,
  scalar: async () => (await import("./scalar/scalar.command")).ScalarCommand,
  primitive: async () => (await import("./primitive/primitive.command")).PrimitiveCommand,
  quality: async () => (await import("./quality/quality.command")).QualityCommand,
  repair: async () => (await import("./repair/repair.command")).RepairCommand,
  workflow: async () => (await import("./workflow/workflow.command")).WorkflowCommand,
} satisfies Record<string, () => Promise<CommandCls>>;

export type CommandModuleId = keyof typeof commandModules;

/** Registration order, which is also the order commands appear in global `--help`. */
export const commandModuleIds = Object.keys(commandModules) as CommandModuleId[];
