import path from "node:path";
import type { NativeEnv } from "@akanjs/devkit/akanConfig";
import type { App } from "@akanjs/devkit/commandDecorators";
import {
  type DesktopPlatform,
  type DesktopServerBundle,
  NativeApp,
  type PublishedUpdate,
  type ResolvedMobileTarget,
  resolveAppId,
  resolveMobileTargets,
  UpdatePackFolder,
  type UpdateUploader,
} from "@akanjs/devkit/mobile";

export interface DesktopUpdatePackOptions {
  target?: string;
  env?: NativeEnv;
  out?: string;
  arch?: "arm64" | "x64";
  sign?: boolean;
  notarize?: boolean;
  /** The archive of the release the channel has now (`<tar sha256>.tar.gz`, a path or a URL): packs the delta from it. */
  previous?: string;
}

interface UploadRequest {
  uploader: UpdateUploader | null;
  /** `--upload` as it was typed, for the line that says where the release went. */
  upload: string | undefined;
}

//* A target that shares its app id with another shares its key too, so each id is answered once.
export const printUpdateKeys = async (app: App, platform: "desktop" | "android" | "ios", target?: string) => {
  const nativePlatform = platform === "desktop" ? NativeApp.desktopPlatform() : platform;
  const seen = new Set<string>();
  for (const mobileTarget of await resolveMobileTargets(app, target ?? "all")) {
    const appId = resolveAppId(mobileTarget.config.appId, nativePlatform);
    if (seen.has(appId)) continue;
    seen.add(appId);
    const { publicKey, keyId, keyPath, created } = await new NativeApp(app, mobileTarget).updateKeygen(nativePlatform);
    app.log(
      `${appId}: ${created ? "made" : "read"} ${keyPath}${created ? " (keep it private and backed up: without it, installed apps take no more updates)" : ""}`,
    );
    app.log(`  native: { updates: { url: "https://…/${app.name}", publicKeys: [${JSON.stringify(publicKey)}] } }`);
    if (platform === "desktop")
      app.log(
        "  url: hosted on Akan Cloud, register this public key as an external key on the release screen and use the URL it gives; self-hosted, the public address you upload the release to",
      );
    app.log(`  keyId ${keyId}: what publish-update --revoke and updates.revokedKeys name this key by`);
    const { publicKey: one, publicKeys } = mobileTarget.config.updates ?? {};
    const declared = publicKeys ?? (one ? [one] : null);
    if (declared && !declared.includes(publicKey))
      app.logger.warn(
        `native.targets.${mobileTarget.name}.updates.publicKeys does not hold this key; releases it signs would not verify.`,
      );
  }
};

//* The key stays with whoever signs: this computer builds the app and its archive, and holds no update key. `stage`
//* is the runner's web build and, for a target that carries one, its server.
export const packDesktopUpdate = async (
  app: App,
  { target, env = "main", out, arch, sign = false, notarize = false, previous }: DesktopUpdatePackOptions,
  stage: (
    platform: DesktopPlatform,
    mobileTarget: ResolvedMobileTarget,
    env: NativeEnv,
  ) => Promise<DesktopServerBundle | undefined>,
) => {
  const targets = await resolveMobileTargets(app, target);
  const [mobileTarget] = targets;
  if (!mobileTarget || targets.length > 1)
    throw new Error("pack-update packs one native target at a time; pass --target <name>.");
  const platform = NativeApp.desktopPlatform();
  if (arch === "x64" && platform === "macos") throw new Error("A macOS app is built for Apple silicon (arm64) only.");
  const nativeApp = new NativeApp(app, mobileTarget, env);
  //? Before the build: a pack failing anywhere leaves no record of the previous one for a signer to take as this one.
  await UpdatePackFolder.clear(path.resolve(out ?? nativeApp.appPackDir(platform, arch)));
  const server = await stage(platform, mobileTarget, env);
  const { pack, build } = await nativeApp.packAppUpdate(platform, {
    ...(out ? { out } : {}),
    ...(arch ? { arch } : {}),
    sign,
    notarize,
    ...(previous ? { previous } : {}),
    ...(server ? { server } : {}),
  });
  for (const warning of build.warnings) app.logger.warn(warning);
  const { archive, patch, signer } = pack;
  const signed = signer
    ? `signed by ${signer.teamId ?? signer.subject ?? signer.thumbprint}`
    : "not signed by a team or certificate";
  app.logger.info(
    `packed ${mobileTarget.name} ${platform}-${pack.arch} ${pack.appVersion} to ${pack.out}: ${archive.url}, ${(archive.gzSize / 1024 / 1024).toFixed(1)} MiB${patch ? `, and the delta from ${patch.from.slice(0, 12)} (${(patch.size / 1024).toFixed(0)} KiB)` : ""}; ${signed}`,
  );
  return pack;
};

export const reportUpload = async (
  app: App,
  nativeApp: NativeApp,
  mobileTarget: ResolvedMobileTarget,
  published: PublishedUpdate,
  { uploader, upload }: UploadRequest,
) => {
  if (!uploader) {
    app.log(
      `Upload ${nativeApp.updatesDir} to ${mobileTarget.config.updates?.url}, the manifests last, without pack-update's records (pack.json, compat.json, manifest.template.json, bundle.json); --upload s3://… sends just this release.`,
    );
    return;
  }
  const { uploaded, skipped } = await uploader.upload(nativeApp.updatesDir, published);
  app.log(
    `Uploaded ${uploaded} file(s) to ${upload}, the manifests last; ${skipped} the bucket already held. Installed apps read ${mobileTarget.config.updates?.url}.`,
  );
};

//* A rollback by whoever holds the key: nothing is built, and installs on any other build take the archive whole.
export const republishDesktopUpdate = async (
  app: App,
  targets: ResolvedMobileTarget[],
  env: NativeEnv,
  platform: DesktopPlatform,
  {
    bundle,
    channel,
    arch,
    revoke,
    resetSequence,
  }: { bundle: string; channel?: string; arch?: "arm64" | "x64"; revoke?: string[]; resetSequence?: boolean },
  request: UploadRequest,
) => {
  const [mobileTarget] = targets;
  if (!mobileTarget || targets.length > 1)
    throw new Error("--republish signs one target's release again; pass --target <name>.");
  const nativeApp = new NativeApp(app, mobileTarget, env);
  const published = await nativeApp.republishUpdate(platform, {
    bundle,
    ...(channel ? { channel } : {}),
    ...(arch ? { arch } : {}),
    revoke,
    resetSequence,
  });
  app.log(
    `${app.name}/${mobileTarget.name} ${published.bundle}: ${published.from} signed again for channel '${published.channel}' in ${published.dir}, with no patch`,
  );
  await reportUpload(app, nativeApp, mobileTarget, published, request);
};
