import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { FileSys } from "../../fileSys";
import { AkanCodeEnv } from "./AkanCodeEnv";

// Two candidates: the CLI bundle flattens entry chunks into the package root, where `skills/` is a sibling.
const builtinSkillsDir = () => {
  const candidates = [path.join(import.meta.dir, "skills"), path.join(import.meta.dir, "..", "skills")];
  return candidates.find((candidate) => existsSync(candidate));
};

// One override for the whole set, so a `models.json` and the `auth.json` it names never drift apart.
const globalDir = () => AkanCodeEnv.get("AKAN_CODE_HOME") ?? path.join(homedir(), ".akan", "code");

const ensureGlobalDir = () => FileSys.ensurePrivateDir(globalDir());

// Credentials live under the home directory, never the repo: a repo is what gets committed, zipped and shared.
export const akanCodePaths = {
  workspaceDir: (workspaceRoot: string) => path.join(workspaceRoot, ".akan", "code"),
  sessionsDir: (workspaceRoot: string) => path.join(workspaceRoot, ".akan", "code", "sessions"),
  extensionsDir: (workspaceRoot: string) => path.join(workspaceRoot, ".akan", "code", "extensions"),
  skillsDir: (workspaceRoot: string) => path.join(workspaceRoot, ".akan", "code", "skills"),
  mailDir: (workspaceRoot: string) => path.join(workspaceRoot, ".akan", "code", "mail"),
  builtinSkillsDir,
  mcpFile: (workspaceRoot: string) => path.join(workspaceRoot, ".akan", "code", "mcp.json"),
  /** Person-wide MCP servers; the workspace `mcpFile` wins on a name they share. */
  globalMcpFile: () => path.join(globalDir(), "mcp.json"),
  globalSkillsDir: () => path.join(globalDir(), "skills"),
  globalDir,
  ensureGlobalDir,
  authFile: () => path.join(globalDir(), "auth.json"),
  /** MCP bearer tokens, beside the provider keys and for the same reason: never in a directory that is shared. */
  mcpAuthFile: () => path.join(globalDir(), "mcpAuth.json"),
  modelsFile: () => path.join(globalDir(), "models.json"),
  trustFile: () => path.join(globalDir(), "trust.json"),
  rpcTokenFile: (port: number) => path.join(globalDir(), "rpc", `${port}.token`),
} as const;
