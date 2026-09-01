import { execFileSync } from "node:child_process";
import path from "node:path";

// Resolved once per root: every CLI command builds a WorkspaceExecutor, and this would otherwise fork git on each.
const resolved = new Map<string, string>();

const readRemoteName = (workspaceRoot: string): string | null => {
  try {
    const url = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd: workspaceRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    // Both remote spellings end in the repository: git@host:owner/name.git and https://host/owner/name.git.
    return (
      url
        .replace(/\.git$/, "")
        .split(/[/:]/)
        .pop() || null
    );
  } catch {
    // No git, no origin, or no git binary — a fresh `akan workspace` before its first commit lands here.
    return null;
  }
};

/**
 * The repository's own name.
 *
 * Deriving it from the working directory made every generated file that names the repo — the AGENTS.md title, its
 * `- Repo:` line — depend on what each person happened to call the folder they cloned into, so one commit rendered
 * a different guide per developer and the diff never settled. The origin remote is the one identity every clone
 * shares. `AKAN_PUBLIC_REPO_NAME` is deliberately not consulted: that is a deployment namespace (queue prefixes,
 * cache keys, secret paths) which a monorepo hosting several products legitimately points somewhere else.
 */
export const resolveRepoName = (workspaceRoot: string): string => {
  const cached = resolved.get(workspaceRoot);
  if (cached) return cached;
  const repoName = readRemoteName(workspaceRoot) ?? path.basename(workspaceRoot);
  resolved.set(workspaceRoot, repoName);
  return repoName;
};
