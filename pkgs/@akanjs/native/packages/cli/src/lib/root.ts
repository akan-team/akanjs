import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The package's own folder, where the native shells (native/), the Maven lock, the Rust toolchain
 * file and the builtin plugins (plugins/) are. Found by walking up from this file to a file that
 * ships with the package, not by counting folders or reading package.json: akanjs copies the
 * package into its dist vendor/ folder without package.json, tsconfig.json or tests.
 */
function findRoot(): string {
  for (let dir = import.meta.dir; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "native", "android", "maven.lock.json")) && existsSync(join(dir, "plugins"))) return dir;
    if (dirname(dir) === dir)
      throw new Error(`the package root (native/android/maven.lock.json) is not above ${import.meta.dir}`);
  }
}

export const PACKAGE_ROOT = findRoot();
