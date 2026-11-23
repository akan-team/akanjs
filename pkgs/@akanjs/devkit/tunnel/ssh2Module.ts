import { devInstallCommand } from "../util/devInstallCommand";

export type Ssh2 = typeof import("ssh2");

const resolveFrom = (dir: string) => {
  try {
    return Bun.resolveSync("ssh2", dir);
  } catch {
    return null;
  }
};

export const ssh2InstallCommand = (workspaceRoot: string) => devInstallCommand(workspaceRoot, "ssh2").join(" ");

//? A global akan resolves packages from its own install, so the workspace root is searched as well.
export const loadSsh2 = async (
  purpose: string,
  workspaceRoot: string,
  searchDirs = [import.meta.dir, workspaceRoot],
): Promise<Ssh2> => {
  for (const dir of searchDirs) {
    const entry = resolveFrom(dir);
    if (entry) return (await import(entry)) as Ssh2;
  }
  throw new Error(
    `${purpose} needs the ssh2 package, which an Akan workspace installs only to open a tunnel: run \`${ssh2InstallCommand(workspaceRoot)}\` in ${workspaceRoot}, then try again.`,
  );
};
