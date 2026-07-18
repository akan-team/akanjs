import path from "node:path";

export const SIGNAL_TEST_PRELOAD_PATH = "test/signalTest.preload.ts";

export interface SignalTestPreloadTarget {
  cwdPath: string;
}

export async function resolveSignalTestPreloadPath(target: SignalTestPreloadTarget) {
  const candidates: string[] = [];
  const addResolvedPackageCandidate = (basePath: string) => {
    try {
      candidates.push(
        path.join(path.dirname(Bun.resolveSync("akanjs/package.json", basePath)), SIGNAL_TEST_PRELOAD_PATH),
      );
    } catch {
      // Source workspaces and published installs can resolve Akan packages from different roots.
    }
  };

  addResolvedPackageCandidate(target.cwdPath);
  addResolvedPackageCandidate(process.cwd());
  addResolvedPackageCandidate(path.dirname(Bun.main));
  addResolvedPackageCandidate(import.meta.dir);

  candidates.push(
    path.join(target.cwdPath, "../../node_modules/akanjs", SIGNAL_TEST_PRELOAD_PATH),
    path.join(target.cwdPath, "../../pkgs/akanjs", SIGNAL_TEST_PRELOAD_PATH),
    path.join(process.cwd(), "node_modules/akanjs", SIGNAL_TEST_PRELOAD_PATH),
    path.join(process.cwd(), "pkgs/akanjs", SIGNAL_TEST_PRELOAD_PATH),
    path.join(path.dirname(Bun.main), "../../akanjs", SIGNAL_TEST_PRELOAD_PATH),
    path.resolve(import.meta.dir, "../../akanjs", SIGNAL_TEST_PRELOAD_PATH),
  );

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    if (await Bun.file(candidate).exists()) return candidate;
  }

  throw new Error(
    `Failed to locate ${SIGNAL_TEST_PRELOAD_PATH} from ${target.cwdPath}.\nProbed paths:\n${uniqueCandidates
      .map((candidate) => `  - ${candidate}`)
      .join("\n")}`,
  );
}
