import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type AkanAppConfig,
  type AkanBinConfig,
  type AkanBinSource,
  type AkanBinUrlSource,
  type BinPlatform,
  binPlatforms,
} from "../akanConfig";
import type { App } from "../commandDecorators";

type BinPlatforms = AkanBinConfig[string];
export type DesktopArch = "arm64" | "x64";

//* A desktop app is built on its own OS, for this computer's CPU or the one `--arch` names, so only that platform's file
//* is fetched. It is copied byte for byte into the folder the app carries as `desktop.bin`: no extended attribute, so
//* no quarantine flag, travels into the bundle.
export class DesktopBin {
  constructor(
    readonly app: App,
    readonly config: AkanAppConfig,
  ) {}

  static platform(arch: string = process.arch): BinPlatform | null {
    const platform = `${process.platform}-${arch}`;
    return (binPlatforms as readonly string[]).includes(platform) ? (platform as BinPlatform) : null;
  }

  /** The app's own entries, then those of the libs it depends on: the app's wins a name, two libs may not differ on one. */
  static select(config: Pick<AkanAppConfig, "app" | "bin" | "libBins">, libs: string[]) {
    const chosen = new Map<string, { owner: string; platforms: BinPlatforms }>();
    for (const [name, platforms] of Object.entries(config.bin))
      chosen.set(name, { owner: `apps/${config.app.name}/akan.config.ts`, platforms });
    for (const { lib, bin } of config.libBins) {
      if (!libs.includes(lib)) continue;
      const owner = `libs/${lib}/akan.config.ts`;
      for (const [name, platforms] of Object.entries(bin)) {
        const held = chosen.get(name);
        if (!held) chosen.set(name, { owner, platforms });
        else if (held.owner.startsWith("libs/") && JSON.stringify(held.platforms) !== JSON.stringify(platforms))
          throw new Error(
            `${held.owner} and ${owner} declare bin.${name} differently; declare it in apps/${config.app.name}/akan.config.ts to pick one.`,
          );
      }
    }
    return chosen;
  }

  /** Windows finds an executable on PATH by its extension, so the carried file keeps one. */
  static fileName(name: string, executable: string, platform: NodeJS.Platform = process.platform) {
    if (platform !== "win32" || /\.(exe|cmd|bat|com)$/i.test(name)) return name;
    return `${name}${path.extname(executable).toLowerCase() || ".exe"}`;
  }

  //? Only the extension is taken from the URL: unzip and a Windows PATH lookup read it, and a decoded name could carry
  //? a separator or `..` out of the cache folder.
  static downloadName(url: string) {
    const extension = /(?:\.tar)?\.[A-Za-z0-9]{1,8}$/.exec(path.posix.basename(new URL(url).pathname))?.[0] ?? "";
    return `download${extension.toLowerCase()}`;
  }

  static extractCommand(archive: string, dir: string, platform: NodeJS.Platform = process.platform): string[] {
    if (platform === "linux" && /\.zip$/i.test(archive)) return ["unzip", "-q", "-o", archive, "-d", dir];
    //? Windows' own bsdtar reads zip, and a GNU tar ahead of it on PATH (Git's) takes `C:` for a remote host.
    const tar =
      platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
    return [tar, "-xf", archive, "-C", dir];
  }

  static async sha256(file: string) {
    return new Bun.CryptoHasher("sha256").update(await Bun.file(file).arrayBuffer()).digest("hex");
  }

  get #cacheDir() {
    return path.join(this.app.cwdPath, ".akan", "cache", "bin");
  }

  /** Copies each chosen executable into `dir`, emptied first, and answers the names it carries. */
  async stage(dir: string, arch: DesktopArch = process.arch as DesktopArch): Promise<string[]> {
    const scanInfo = this.app.getScanInfo({ allowEmpty: true }) ?? (await this.app.scan({ write: false }));
    const chosen = DesktopBin.select(this.config, scanInfo.getLibs());
    if (!chosen.size) return [];
    const platform = DesktopBin.platform(arch);
    if (!platform)
      throw new Error(
        `bin: this desktop app is for ${process.platform}-${arch}, and a bin names only ${binPlatforms.join(", ")}.`,
      );
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const [name, { owner, platforms }] of chosen) {
      const source = platforms[platform];
      if (!source)
        throw new Error(
          `${owner}: bin.${name} names no ${platform} file, the platform this desktop app is built for (it names ${Object.keys(platforms).join(", ") || "none"}).`,
        );
      const executable = await this.#executable(`${owner}: bin.${name}.${platform}`, source);
      const target = path.join(dir, DesktopBin.fileName(name, executable));
      await Bun.write(target, Bun.file(executable));
      await chmod(target, 0o755);
      this.app.logger.info(`The desktop app carries ${name} from ${"url" in source ? source.url : source.path}`);
    }
    return [...chosen.keys()];
  }

  async #executable(at: string, source: AkanBinSource): Promise<string> {
    const file = "url" in source ? await this.#download(at, source) : source.path;
    if (!(await Bun.file(file).exists())) throw new Error(`${at}: ${file} does not exist`);
    if (!source.file) return file;
    const key = "url" in source ? source.sha256 : await DesktopBin.sha256(file);
    const executable = path.join(await this.#extract(file, key), ...source.file.split("/"));
    if (!(await Bun.file(executable).exists())) throw new Error(`${at}: the archive holds no ${source.file}`);
    return executable;
  }

  async #download(at: string, { url, sha256 }: AkanBinUrlSource): Promise<string> {
    const dir = path.join(this.#cacheDir, sha256);
    const file = path.join(dir, DesktopBin.downloadName(url));
    if (await Bun.file(file).exists()) return file;
    await mkdir(dir, { recursive: true });
    this.app.logger.info(`Downloading ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(600_000) });
    if (!res.ok) throw new Error(`${at}: ${url} answered ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const digest = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    if (digest !== sha256) throw new Error(`${at}: ${url} hashes to ${digest}, not the declared ${sha256}`);
    await Bun.write(`${file}.partial`, bytes);
    await rename(`${file}.partial`, file);
    return file;
  }

  async #extract(archive: string, key: string): Promise<string> {
    const dir = path.join(this.#cacheDir, key, "extracted");
    if (await Bun.file(`${dir}.done`).exists()) return dir;
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    const [command = "tar", ...args] = DesktopBin.extractCommand(archive, dir);
    if (command === "unzip" && !Bun.which("unzip"))
      throw new Error(`${archive} is a zip, and this computer has no unzip: install it, or use a .tar.gz or .tar.xz.`);
    await this.app.spawn(command, args, { cwd: dir });
    await writeFile(`${dir}.done`, "");
    return dir;
  }
}
