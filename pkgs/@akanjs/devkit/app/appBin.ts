import { chmod, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { AkanAppConfig, BinPlatform } from "../akanConfig";
import type { App } from "../commandDecorators";
import { DesktopBin } from "../mobile/desktopBin";

//* `akan build` cannot know the CPU `docker build` targets, so the image carries every declared Linux file by Docker's arch name.
export class AppBin {
  static readonly dir = "bin";
  static readonly imageArchs: { [dockerArch: string]: BinPlatform } = { amd64: "linux-x64", arm64: "linux-arm64" };

  constructor(
    readonly app: App,
    readonly config: AkanAppConfig,
  ) {}

  static missing(names: string[], which: (name: string) => string | null = Bun.which): string | null {
    const missing = names.filter((name) => !which(name));
    if (!missing.length) return null;
    return `bin declares ${missing.join(", ")}, which this computer's PATH does not have: a dev server that spawns ${missing.length === 1 ? "it" : "one"} by name fails until it is installed here. The image and the desktop app carry their own.`;
  }

  async #chosen() {
    const scanInfo = this.app.getScanInfo({ allowEmpty: true }) ?? (await this.app.scan({ write: false }));
    return DesktopBin.select(this.config, scanInfo.getLibs());
  }

  async names(): Promise<string[]> {
    return [...(await this.#chosen()).keys()];
  }

  async stageImage(distDir: string): Promise<string[]> {
    const dir = path.join(distDir, AppBin.dir);
    await rm(dir, { recursive: true, force: true });
    const fetcher = new DesktopBin(this.app, this.config);
    const carried = new Set<string>();
    for (const [name, { owner, platforms }] of await this.#chosen())
      for (const [dockerArch, platform] of Object.entries(AppBin.imageArchs)) {
        const source = platforms[platform];
        if (!source) continue;
        const executable = await fetcher.executable(`${owner}: bin.${name}.${platform}`, source);
        const target = path.join(dir, dockerArch, name);
        await mkdir(path.dirname(target), { recursive: true });
        await Bun.write(target, Bun.file(executable));
        await chmod(target, 0o755);
        carried.add(name);
      }
    return [...carried];
  }
}
