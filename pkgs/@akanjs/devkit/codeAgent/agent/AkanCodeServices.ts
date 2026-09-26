import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type InlineExtension, ModelRuntime, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { CodeAgentProfile } from "akanjs/common";
import { AkanEnvKeys } from "../tools/AkanEnvKeys";
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

/**
 * Assembles the engine's injectable services from akan's own storage.
 *
 * Every one of the four is passed explicitly. Leave any of them out and the engine falls back to `~/.pi/` —
 * measured: with all four injected it writes nothing outside the paths named here.
 */
export class AkanCodeServices {
  static settings() {
    // Settings are in memory on purpose: the engine's file settings would be a second configuration surface
    // beside `akan.config.ts` with its own precedence, for options akan already decides through the profile.
    // `enableInstallTelemetry` defaults to true and attaches pi-branded headers to OpenRouter, NVIDIA and
    // Cloudflare requests, so it is turned off here rather than per host — a host that changes provider later
    // would otherwise turn it back on without meaning to.
    return SettingsManager.inMemory({
      enableInstallTelemetry: false,
      enableAnalytics: false,
      quietStartup: true,
      // Twice the engine's 16,384. The reserve is all the room the response at the threshold gets — a request
      // clamps its output to the window less the prompt less 4,096 — and 80% of it caps the summary. At 16k a
      // reasoning model stops mid-thought there, and the recovery re-sends a near-full window to retry the turn.
      compaction: { reserveTokens: 32_768 },
    });
  }

  /**
   * The model catalogue and the credentials behind it, both under `~/.akan/`.
   *
   * `authPath` is the whole of what akan's own credential file used to need a storage backend for: the engine
   * locks and rewrites that file itself, so a second `akan code` refreshing an OAuth token at the same moment
   * cannot clobber the first. Nothing lands in `~/.pi/`, and a user who removes akan takes their keys with them.
   */
  static async runtime(workspaceRoot: string, proxy: CodeAgentProxy | null = null) {
    mkdirSync(akanCodePaths.globalDir(), { recursive: true, mode: 0o700 });
    if (proxy) {
      //* Behind a proxy neither `auth.json` nor an env key may reach a request, so credentials live in a throwaway
      //* file and the only key the engine ever sends is the proxy token.
      const runtime = await ModelRuntime.create({
        authPath: path.join(mkdtempSync(path.join(tmpdir(), "akan-code-proxy-")), "auth.json"),
        modelsPath: akanCodePaths.modelsFile(),
      });
      await proxy.apply(runtime);
      return runtime;
    }
    const runtime = await ModelRuntime.create({
      authPath: akanCodePaths.authFile(),
      modelsPath: akanCodePaths.modelsFile(),
    });
    await AkanEnvKeys.apply(runtime, workspaceRoot);
    return runtime;
  }

  static sessions(workspaceRoot: string, cwd: string, profile: CodeAgentProfile, resume?: string) {
    //* `remote` has no store of its own yet, so it keeps a file session rather than none: a pod's worker is long-lived
    //* and its suspended asks and resume need the file more than a laptop does.
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

  /**
   * The akan skill set, then the person's own, then the workspace's.
   *
   * `~/.akan/code/skills` is read because a skill somebody wrote for themselves is theirs, not one checkout's,
   * and having to copy it into every repo is the same friction that makes people stop writing them. It is
   * text the model may read, never code that runs — which is why extensions stay workspace-only below.
   *
   * A path that does not exist is a reported load error rather than a skip, so each is checked first.
   */
  static #skillPaths(profile: CodeAgentProfile, workspaceRoot: string) {
    if (!profile.context.skills) return [];
    const dirs = [
      akanCodePaths.builtinSkillsDir(),
      akanCodePaths.globalSkillsDir(),
      akanCodePaths.skillsDir(workspaceRoot),
    ];
    return dirs.filter((dir): dir is string => !!dir && existsSync(dir));
  }

  /**
   * What the engine's resource loader may discover. Extensions come from the workspace and nowhere else: a
   * globally installed extension is code that runs in every checkout, so an agent would behave differently in
   * two clones of the same repo for reasons nothing in the repo explains. Skills are text and are read from
   * the home directory too — see `#skillPaths`.
   */
  static resourceOptions(options: AkanCodeServicesOptions) {
    // A path that does not exist is reported as a load error rather than skipped, and these two are optional.
    const present = (dir: string) => (existsSync(dir) ? [dir] : []);
    return {
      noExtensions: true,
      // Always on: it turns off the engine's *default* skill locations, which are `~/.pi/skills` and the
      // checkout's own `.pi/`. Explicit `additionalSkillPaths` are merged either way, so this is the switch
      // that keeps a skill in whoever's home directory from changing how the agent works here.
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: !options.profile.context.projectFiles,
      // The engine takes one context file per directory and looks at no editor's own rules, so a repo whose
      // conventions live in a `CLAUDE.md` or under `.cursor/rules` hands this agent less than it hands the
      // editor beside it — see {@link AkanContextFiles}. Gated on the same flag, so a profile that wants no
      // project context still gets none.
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
