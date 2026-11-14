import fs from "node:fs";
import path from "node:path";
import { Logger } from "akanjs/common";
import { resolveArtifactDir } from "../proxy/hostBasePathWebProxy";

export class DevBaseArtifact {
  static readonly #pollMs = 20;

  //? `akan start` sets the key on a server it boots beside the first base build, which renames its artifact in last.
  static async arrived({
    artifactDir = resolveArtifactDir(),
    env = process.env,
    stopped = () => false,
    warnAfterMs = 30_000,
    warn = (message: string) => new Logger("DevBaseArtifact").warn(message),
  }: {
    artifactDir?: string;
    env?: Record<string, string | undefined>;
    stopped?: () => boolean;
    warnAfterMs?: number;
    warn?: (message: string) => void;
  } = {}): Promise<number> {
    if (env.AKAN_DEV_AWAIT_ARTIFACT !== "1") return 0;
    const file = path.join(artifactDir, "base-artifact.json");
    const started = performance.now();
    let warned = false;
    while (!fs.existsSync(file)) {
      if (stopped()) return performance.now() - started;
      if (!warned && performance.now() - started >= warnAfterMs) {
        warned = true;
        warn(
          `still waiting for the first base build to write ${file} after ${Math.round(warnAfterMs / 1000)}s; this server finishes booting once the file is there`,
        );
      }
      await Bun.sleep(DevBaseArtifact.#pollMs);
    }
    //? Dropped once seen: a process this one spawns would inherit it, and wait for a file its own folder never gets.
    delete env.AKAN_DEV_AWAIT_ARTIFACT;
    return performance.now() - started;
  }
}
