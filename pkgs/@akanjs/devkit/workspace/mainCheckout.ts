import path from "node:path";
import { FileSys } from "../util/fileSys";

export interface LinkedWorktree {
  worktree: string;
  main: string;
}

export class MainCheckout {
  //? A linked worktree's `.git` is a file naming its gitdir, whose `commondir` names the main checkout's `.git`.
  //? A submodule's `.git` is a file too, with no `commondir`, and a bare repository has no checkout beside it.
  static async rootsOf(dir: string): Promise<LinkedWorktree | null> {
    const worktree = await MainCheckout.#nearestRepo(path.resolve(dir));
    if (!worktree) return null;
    const dotGit = path.join(worktree, ".git");
    if (!(await FileSys.fileExists(dotGit))) return null;
    const named = (await FileSys.readText(dotGit)).match(/^gitdir: (.+)$/m)?.[1]?.trim();
    if (!named) return null;
    const gitDir = path.resolve(worktree, named);
    const commonDirFile = path.join(gitDir, "commondir");
    if (!(await FileSys.fileExists(commonDirFile))) return null;
    const commonDir = path.resolve(gitDir, (await FileSys.readText(commonDirFile)).trim());
    return path.basename(commonDir) === ".git" ? { worktree, main: path.dirname(commonDir) } : null;
  }

  static async counterpartOf(file: string): Promise<string | null> {
    const roots = await MainCheckout.rootsOf(path.dirname(file));
    if (!roots) return null;
    const counterpart = path.join(roots.main, path.relative(roots.worktree, path.resolve(file)));
    return (await FileSys.fileExists(counterpart)) ? counterpart : null;
  }

  static async #nearestRepo(dir: string): Promise<string | null> {
    if (await FileSys.exists(path.join(dir, ".git"))) return dir;
    const parent = path.dirname(dir);
    return parent === dir ? null : await MainCheckout.#nearestRepo(parent);
  }
}
