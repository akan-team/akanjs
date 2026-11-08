import fs from "node:fs";
import path from "node:path";

const isWithin = (child: string, parent: string) =>
  child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);

const realPathOf = (target: string): string | null => {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
};

// `akan sync` links public/libs/<lib> to libs/<lib>/public: the one place a served file may live out of the tree.
const libLinkTarget = (baseDir: string, filePath: string): string | null => {
  const [libs, lib] = path.relative(baseDir, filePath).split(path.sep);
  if (libs !== "libs" || !lib) return null;
  const target = realPathOf(path.join(baseDir, libs, lib));
  if (!target || path.basename(target) !== path.basename(baseDir)) return null;
  const libDir = path.dirname(target);
  return path.basename(libDir) === lib && path.basename(path.dirname(libDir)) === "libs" ? target : null;
};

export const staysInTree = (baseDir: string, filePath: string): boolean => {
  let real: string;
  try {
    real = fs.realpathSync(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR";
  }
  const base = path.resolve(baseDir);
  if (isWithin(real, realPathOf(base) ?? base)) return true;
  const libTarget = libLinkTarget(base, filePath);
  return !!libTarget && isWithin(real, libTarget);
};

// Order matters: decode (so %2e%2e is ..), refuse NUL, resolve, contain with a separator (/public-secrets vs /public),
// then contain the real path, so a symlink cannot lead out of the tree.
export const resolveStaticPath = (baseDir: string, urlPath: string): string | null => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const normalizedBase = path.resolve(baseDir);
  const rel = decoded.replace(/^[/\\]+/, "");
  const resolved = path.resolve(normalizedBase, rel);
  if (resolved === normalizedBase) return resolved;
  const baseWithSep = normalizedBase.endsWith(path.sep) ? normalizedBase : normalizedBase + path.sep;
  if (!resolved.startsWith(baseWithSep)) return null;
  return staysInTree(normalizedBase, resolved) ? resolved : null;
};
