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

// The origin remote, not the clone's folder name, so generated files agree across clones. `AKAN_PUBLIC_REPO_NAME` is a
// deployment namespace (queue prefixes, cache keys) and deliberately not consulted.
export const resolveRepoName = (workspaceRoot: string): string => {
  const cached = resolved.get(workspaceRoot);
  if (cached) return cached;
  const repoName = readRemoteName(workspaceRoot) ?? path.basename(workspaceRoot);
  resolved.set(workspaceRoot, repoName);
  return repoName;
};
