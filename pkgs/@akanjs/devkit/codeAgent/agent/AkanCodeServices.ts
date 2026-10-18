import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type InlineExtension, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { CodeAgentProfile } from "akanjs/common";
import { AkanEnvKeys } from "../tools/AkanEnvKeys";
import { AkanCodeCompaction } from "./AkanCodeCompaction";
import { type AkanContextFile, AkanContextFiles } from "./AkanContextFiles";
import { akanCodePaths } from "./akanCodePaths";
import { akanSystemPrompt } from "./akanSystemPrompt";
import type { CodeAgentProxy } from "./CodeAgentProxy";
import { CodeSessionIndex } from "./CodeSessionIndex";

export interface AkanCodeServicesOptions {
  workspaceRoot: string;
  cwd: string;
  profile: CodeAgentProfile;
  extensions: InlineExtension[];
  sessionId?: string;
}

// All four engine services are injected explicitly: any one left out makes the engine fall back to `~/.pi/`.
export class AkanCodeServices {
  static settings() {
    // In memory on purpose: file settings would be a second configuration surface beside the profile.
    // `enableInstallTelemetry` defaults to true and adds pi-branded headers to OpenRouter/NVIDIA/Cloudflare calls.
    return SettingsManager.inMemory({
      enableInstallTelemetry: false,
      enableAnalytics: false,
      quietStartup: true,
      compaction: { reserveTokens: AkanCodeCompaction.reserveFloor },
    });
  }

  // The engine locks and rewrites `authPath` itself, so two `akan code` refreshing a token at once cannot clobber it.
  static async runtime(workspaceRoot: string, proxy: CodeAgentProxy | null = null) {
    mkdirSync(akanCodePaths.globalDir(), { recursive: true, mode: 0o700 });
    const runtime = await ModelRuntime.create({
      //* Behind a proxy no real key may reach a request, so credentials live in a throwaway file.
      authPath: proxy
        ? path.join(mkdtempSync(path.join(tmpdir(), "akan-code-proxy-")), "auth.json")
        : akanCodePaths.authFile(),
      modelsPath: akanCodePaths.modelsFile(),
    });
    if (proxy) await proxy.apply(runtime);
    else await AkanEnvKeys.apply(runtime, workspaceRoot);
    return runtime;
  }

  static sessions(workspaceRoot: string, cwd: string, profile: CodeAgentProfile, resume?: string) {
    //* `remote` has no store of its own yet, so it keeps a file session: a pod worker's suspended asks need it.
    if (profile.session.store === "memory") return SessionManager.inMemory(cwd);
    const dir = akanCodePaths.sessionsDir(workspaceRoot);
    mkdirSync(dir, { recursive: true });
    const manager = SessionManager.create(cwd, dir);
    if (!resume) return manager;
    const file = CodeSessionIndex.fileOf(dir, resume);
    // A mistyped id that quietly opened a new session would look like a session that lost its history.
    if (!file) throw new Error(`No stored session ${resume} in ${dir}`);
    manager.setSessionFile(file);
    return manager;
  }

  // Skills are text, never code that runs, so unlike extensions they may come from the home directory too.
  static #skillPaths(profile: CodeAgentProfile, workspaceRoot: string) {
    if (!profile.context.skills) return [];
    const dirs = [
      akanCodePaths.builtinSkillsDir(),
      akanCodePaths.globalSkillsDir(),
      akanCodePaths.skillsDir(workspaceRoot),
    ];
    return dirs.filter((dir): dir is string => !!dir && existsSync(dir));
  }

  static resourceOptions(options: AkanCodeServicesOptions) {
    // A path that does not exist is reported as a load error rather than skipped, and these two are optional.
    const present = (dir: string) => (existsSync(dir) ? [dir] : []);
    return {
      noExtensions: true,
      // Disables only the engine's default skill locations (`~/.pi/skills`, `.pi/`); `additionalSkillPaths` merge.
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: !options.profile.context.projectFiles,
      agentsFilesOverride: ({ agentsFiles }: { agentsFiles: AkanContextFile[] }) => ({
        agentsFiles: options.profile.context.projectFiles
          ? AkanContextFiles.extend(agentsFiles, { workspaceRoot: options.workspaceRoot, cwd: options.cwd })
          : agentsFiles,
      }),
      appendSystemPrompt: [akanSystemPrompt(options.profile)],
      additionalExtensionPaths: present(akanCodePaths.extensionsDir(options.workspaceRoot)),
      additionalSkillPaths: AkanCodeServices.#skillPaths(options.profile, options.workspaceRoot),
      extensionFactories: options.extensions,
    };
  }
}
