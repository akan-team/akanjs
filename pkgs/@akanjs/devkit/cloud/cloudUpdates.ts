import path from "node:path";
import { Logger } from "akanjs/common";
import type { NativeEnv } from "../akanConfig";
import type { App } from "../commandDecorators";
import { ExitCodeError } from "../commandDecorators/exitCodeError";
import type { DesktopRelease, DesktopSigner } from "../mobile/desktopRelease";
import { type MobilePlatform, resolveMobileTargets } from "../mobile/mobileTarget";
import { NativeApp } from "../mobile/nativeApp";
import { NativePublicEnv } from "../mobile/nativePublicEnv";
import { type NativeUpdatePack, UpdatePackFolder } from "../mobile/updatePackFolder";
import { type AppBinaryDistribution, CloudApi } from "./cloudApi";
import { UpdatePackUpload } from "./updatePackUpload";

//* A phone app's over-the-air updates through an Akan Cloud project, which keeps the signing key: a pack uploaded for
//* it to sign and publish, and the store build a pack of the same commit is embedded in. A desktop release is signed
//* where it was published, and goes up as it is.
export class CloudUpdates {
  constructor(
    readonly cloudApi: CloudApi,
    readonly devProjectId: string,
  ) {}

  /** The bundle.json the target's last `akan release-<platform>` wrote. */
  static async storeBundlePath(app: App, target: string | undefined, platform: MobilePlatform) {
    const [mobileTarget] = await resolveMobileTargets(app, target);
    if (!mobileTarget) throw new Error(`Native target '${target}' was not found.`);
    return path.join(new NativeApp(app, mobileTarget).outDir(platform), UpdatePackFolder.bundleFile);
  }

  /** A pack `akan pack-update` wrote, refused unless it is this app's and agrees with every flag given beside it. */
  static async readPack(
    app: App,
    dir: string,
    {
      platform,
      target,
      env,
      allowLocalRelease,
    }: { platform: MobilePlatform | null; target: string | null; env: NativeEnv | null; allowLocalRelease: boolean },
  ) {
    const pack = await UpdatePackFolder.read(dir);
    const what = `The pack in ${pack.out} is ${pack.app} ${pack.target} ${pack.platform} --env ${pack.env}`;
    if (pack.app !== app.name) throw new Error(`${what}, not ${app.name}'s.`);
    if (platform && platform !== pack.platform) throw new Error(`${what}, not ${platform}.`);
    if (env && env !== pack.env) throw new Error(`${what}, not --env ${env}.`);
    if (target) {
      const targets = (await resolveMobileTargets(app, target)).map(({ name }) => name);
      if (targets.length !== 1 || targets[0] !== pack.target)
        throw new Error(`${what}, not --target ${target} (${targets.join(", ")}).`);
    }
    if (pack.env === "local" && !allowLocalRelease)
      throw new Error(
        `${what}, and a local pack is blocked. Pass --allow-local-release only for explicit local release testing.`,
      );
    return pack;
  }

  async push(pack: NativeUpdatePack, { channel, notes }: { channel: string | null; notes: string | null }) {
    const target = channel ?? pack.channel;
    return await UpdatePackFolder.withArchive(pack, async (archive) => {
      const release = await new UpdatePackUpload(this.cloudApi, this.devProjectId)
        .send(archive, { appName: pack.app, target: pack.target, platform: pack.platform, channel: target, notes })
        .catch((error: unknown) => {
          throw CloudApi.refusal(error, "a pack is uploaded by a project member signed in with `akan login`");
        });
      const label = `${pack.app} ${pack.target} ${pack.platform} on channel ${target}: release ${release.id}`;
      if (release.status === "rejected")
        throw new ExitCodeError(
          `The project rejected ${label}:\n${(release.problems ?? []).map((problem) => `  - ${problem}`).join("\n")}`,
          2,
        );
      if (release.status === "published")
        Logger.rawLog(`Published ${label} (${pack.files} files, native API ${pack.nativeApi}).`);
      else
        Logger.rawLog(
          `Staged ${label} (${pack.files} files, native API ${pack.nativeApi}). Publish it from the project's release screen.`,
        );
      return release;
    });
  }

  //? `manifestUrl` is where the project serves the channel once published; before that, the URL the app was built with.
  async pushRelease(
    release: DesktopRelease,
    {
      appName,
      target,
      notes,
      signer,
      url,
    }: { appName: string; target: string; notes: string | null; signer: DesktopSigner; url: string },
  ) {
    const { platform, arch, channel } = release;
    return await release.withArchive(release.record(signer), async (archive) => {
      const record = await new UpdatePackUpload(this.cloudApi, this.devProjectId)
        .send(archive, { appName, target, platform, kind: "app", arch, channel, notes })
        .catch((error: unknown) => {
          throw CloudApi.refusal(error, "a release is uploaded by a project member signed in with `akan login`");
        });
      const label = `${appName} ${target} ${platform}-${arch} on channel ${channel}: release ${record.id}`;
      const problems = (record.problems ?? []).map((problem) => `  - ${problem}`).join("\n");
      if (record.status === "rejected") throw new ExitCodeError(`The project rejected ${label}:\n${problems}`, 2);
      const manifestUrl =
        typeof record.manifestUrl === "string" ? record.manifestUrl : `${url}/${platform}-${arch}/${channel}.json`;
      const what = `${label} (${release.manifest.bundle}, ${release.payloads.length + 3} files)`;
      Logger.rawLog(
        record.status === "published"
          ? `Published ${what}. Installed apps read ${manifestUrl}.`
          : `Staged ${what}. Publish it from the project's release screen; installed apps read ${manifestUrl}.`,
      );
      if (problems) Logger.rawLog(`The project noted:\n${problems}`);
      return record;
    });
  }

  //? The store build first, then a pack of the same commit: a server that registers the binary checks the pack runs in it.
  async registerBinary(
    app: App,
    pack: NativeUpdatePack,
    { distribution, env }: { distribution: AppBinaryDistribution; env: NativeEnv },
  ) {
    const { cloudApi, devProjectId } = this;
    const bundlePath = await CloudUpdates.storeBundlePath(app, pack.target, pack.platform);
    const bundleFile = Bun.file(bundlePath);
    const rebuild = `akan release-${pack.platform} ${app.name} --target ${pack.target} --env ${env}`;
    if (!(await bundleFile.exists())) throw new Error(`No store build at ${bundlePath}: run \`${rebuild}\` first.`);
    const bundle = await UpdatePackFolder.readBundle(bundlePath);
    if (!bundle.updates)
      throw new Error(`The store build at ${bundlePath} takes no updates: give the target native.updates.`);
    const packBundle = path.join(pack.out, UpdatePackFolder.bundleFile);
    const envProblem = await NativePublicEnv.problemAgainst(bundlePath, packBundle);
    if (envProblem) throw new ExitCodeError(`The pack in ${pack.out} cannot run in the store build: ${envProblem}.`, 2);
    //? Every native build of the target rewrites this file, so a debug or another env's build replaces the release's.
    if (bundle.web.hash !== pack.webHash)
      throw new Error(
        `The store build at ${bundlePath} is not this commit's --env ${env} build: its web bundle differs from the pack's. Run \`${rebuild}\`, then register that build.`,
      );
    const compat = await NativeApp.compareBundles(app.cwdPath, bundlePath, packBundle);
    const verdict = UpdatePackFolder.storeBuildVerdict(
      { out: pack.out, compat: { against: bundlePath, ...compat } },
      `Run \`${rebuild}\`, then register that build.`,
    );
    if (verdict) throw verdict;
    if (bundle.updates.channel !== pack.channel)
      throw new Error(
        `The store build at ${bundlePath} reads updates channel ${bundle.updates.channel}, and this commit's --env ${env} pack is for ${pack.channel}. Run \`${rebuild}\`, then register that build.`,
      );
    const { channel } = pack;
    const upload = new UpdatePackUpload(cloudApi, devProjectId);
    return await UpdatePackFolder.withArchive(pack, async (archive) => {
      const binary = await upload
        .stage(archive, { appName: pack.app, target: pack.target, platform: pack.platform, channel, notes: null })
        .then((packUploadId) =>
          upload.settle(() =>
            cloudApi.registerAppBinary(devProjectId, {
              appName: pack.app,
              target: pack.target,
              distribution,
              bundle: bundleFile,
              packUploadId,
              channel,
            }),
          ),
        )
        .catch((error: unknown) => {
          throw CloudApi.refusal(error, "a binary is registered by a project member signed in with `akan login`");
        });
      Logger.rawLog(
        `Registered ${pack.app} ${pack.target} ${pack.platform} (${distribution}): binary ${binary.id}, native API ${pack.nativeApi}.`,
      );
      return binary;
    });
  }
}
