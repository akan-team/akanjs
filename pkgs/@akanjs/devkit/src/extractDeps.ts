import type { PackageJson } from "./types";

const NODE_NATIVE_MODULE_SET = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

export const extractDependencies = (
  filepaths: { path: string; text: string }[],
  pacakgeJson: PackageJson,
  defaultDependencies: string[] = []
) => {
  if (!pacakgeJson.dependencies) throw new Error("No dependencies found in package.json");
  const dependencies = new Set<string>(defaultDependencies);

  const existingDependencies = new Set<string>([
    ...Object.keys(pacakgeJson.dependencies ?? {}),
    ...Object.keys(pacakgeJson.devDependencies ?? {}),
  ]);
  const versionObj = {
    ...(pacakgeJson.dependencies ?? {}),
    ...(pacakgeJson.devDependencies ?? {}),
  };

  // Look for require statements: require('package-name') or import 'package-name'
  const requireRegex = /(?:require\s*\(|import\s*(?:[\w\s{},*]*\s+from\s*)?|import\s*\()\s*['"`]([^'"`]+)['"`]/g;
  for (const { text } of filepaths.filter(({ path }) => path.endsWith(".js") || path.endsWith(".ts"))) {
    let requireMatch: RegExpExecArray | null;
    while ((requireMatch = requireRegex.exec(text)) !== null) {
      const moduleName: string = requireMatch[1];
      const moduleNameParts = moduleName.split("/");
      const subModuleLength = moduleNameParts.length;
      for (let i = 0; i < subModuleLength; i++) {
        const libName = moduleNameParts.slice(0, i + 1).join("/");
        if (!NODE_NATIVE_MODULE_SET.has(libName) && existingDependencies.has(libName)) dependencies.add(libName);
      }
    }
  }
  return Object.fromEntries(
    [...dependencies].sort().map((dep) => {
      const version = versionObj[dep];
      if (!version) throw new Error(`No version found for ${dep}`);
      return [dep, version];
    })
  );
};
