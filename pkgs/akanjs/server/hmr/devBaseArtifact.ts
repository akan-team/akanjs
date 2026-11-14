import fs from "node:fs";
import path from "node:path";
import { resolveArtifactDir } from "../proxy/hostBasePathWebProxy";

export class DevBaseArtifact {
  static readonly #pollMs = 20;

  //? `akan start` sets the key on a server it boots beside the first base build, which renames its artifact in last.
  static async arrived({
    artifactDir = resolveArtifactDir(),
    env = process.env,
    stopped = () => false,
  }: {
    artifactDir?: string;
    env?: Record<string, string | undefined>;
    stopped?: () => boolean;
  } = {}): Promise<number> {
    if (env.AKAN_DEV_AWAIT_ARTIFACT !== "1") return 0;
    const file = path.join(artifactDir, "base-artifact.json");
    const started = performance.now();
    while (!fs.existsSync(file) && !stopped()) await Bun.sleep(DevBaseArtifact.#pollMs);
    return performance.now() - started;
  }
}
