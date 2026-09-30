import path from "node:path";
import type { AkanNativeConfig } from "@akanjs/native/config";
import type {
  AkanMobileTargetConfig,
  AkanNativeValue,
  AkanPluginNativeConfig,
  MobileEnv,
  MobilePermission,
} from "akanjs";
import { type NativePlatform, resolveAppId } from "./mobileTarget";
import { toIosInfoPlistUsageDescriptions } from "./usageDescriptions";

export interface NativeConfigInput {
  /** The app folder; every relative path in the target resolves against it. */
  appPath: string;
  target: AkanMobileTargetConfig;
  /** The assembled web root the app loads. */
  webDir: string;
  /** What the app's and its libs' plugins declare. */
  contributions: AkanPluginNativeConfig[];
  locales: readonly string[];
  /** The backend the binary talks to; an updates channel left unnamed follows it. */
  env?: MobileEnv;
  platform: NativePlatform;
}

export interface NativeConfigResult {
  config: AkanNativeConfig;
  warnings: string[];
}

type NativeIos = NonNullable<NonNullable<AkanNativeConfig["native"]>["ios"]>;

export class NativeConfig {
  //* What every akanjs page may call: routing, lifecycle, links, storage, the device facts the runtime reads, and the
  //* system sheet useCamera asks camera-or-library with.
  static readonly basePlugins = [
    "app",
    "app-state",
    "browser",
    "opener",
    "auth-session",
    "device",
    "dialog",
    "keyboard",
    "preferences",
    "secure-storage",
    "haptics",
  ] as const;
  //* Used when no plugin of the app or its libs claims the permission; speech has no native plugin yet.
  static readonly builtinContributions: { [permission in MobilePermission]: AkanPluginNativeConfig } = {
    camera: {
      permission: "camera",
      plugins: ["camera"],
      usageDescriptions: {
        cameraUsageDescription: "$(PRODUCT_NAME) requires access to the camera to take photos.",
        photoAddUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
        photoUsageDescription: "$(PRODUCT_NAME) requires access to the photo library to take photos.",
      },
    },
    contacts: {
      permission: "contacts",
      plugins: ["contacts"],
      usageDescriptions: {
        contactsUsageDescription: "$(PRODUCT_NAME) requires access to the contacts to find people you know.",
      },
    },
    location: {
      permission: "location",
      plugins: ["geolocation"],
      usageDescriptions: {
        locationAlwaysUsageDescription: "$(PRODUCT_NAME) requires access to the location to get the user's location.",
        locationWhenInUseUsageDescription:
          "$(PRODUCT_NAME) requires access to the location to get the user's location.",
      },
    },
    push: { permission: "push", plugins: ["push"] },
    speech: { permission: "speech" },
  };

  static build({
    appPath,
    target,
    webDir,
    contributions,
    locales,
    env,
    platform,
  }: NativeConfigInput): NativeConfigResult {
    const warnings: string[] = [];
    const applied = (target.permissions ?? []).flatMap((permission) => {
      const claimed = contributions.filter((contribution) => contribution.permission === permission);
      const used = claimed.length ? claimed : [NativeConfig.builtinContributions[permission]];
      if (!used.some((contribution) => contribution.plugins?.length))
        warnings.push(`Permission '${permission}' has no native plugin yet; the app ships without it.`);
      return used;
    });
    const abs = (relative: string) => path.resolve(appPath, relative);
    const plugins = [
      ...new Set([
        ...NativeConfig.basePlugins,
        //? Windows and Linux open a link by starting the app again; without the hand-over it runs as a second app and
        //? the instance whose auth-session start() waits for the callback never hears it.
        ...(target.deepLinks?.schemes?.length ? ["single-instance"] : []),
        ...(target.updates ? ["updates"] : []),
        ...applied.flatMap((contribution) => contribution.plugins ?? []),
        ...(target.native?.plugins ?? []),
      ]),
    ];
    const usageDescriptions = Object.fromEntries(
      Object.entries(
        toIosInfoPlistUsageDescriptions(
          Object.assign({}, ...applied.map((contribution) => contribution.usageDescriptions ?? {})),
        ),
      ).map(([key, text]) => [key, text.replaceAll("$(PRODUCT_NAME)", target.appName)]),
    );
    const ios = NativeConfig.#compact<NativeIos>({
      infoPlist: NativeConfig.#merged(
        applied.map((c) => c.infoPlist),
        target.native?.ios?.infoPlist,
      ),
      entitlements: NativeConfig.#merged(
        applied.map((c) => c.entitlements),
        target.native?.ios?.entitlements,
      ),
    });
    const manifest = [
      ...[...new Set(applied.flatMap((c) => c.androidPermissions ?? []))].map(
        (name) => `<uses-permission android:name="android.permission.${name}" />`,
      ),
      ...[...new Set(applied.flatMap((c) => c.androidFeatures ?? []))].map(
        (name) => `<uses-feature android:name="${name}" android:required="false" />`,
      ),
      ...(target.native?.android?.manifest ?? []),
    ];
    const android = NativeConfig.#compact({
      manifest,
      application: target.native?.android?.application ?? [],
      activity: target.native?.android?.activity ?? [],
    });
    const resources = Object.entries(target.files ?? {}).map(([to, from]) => ({ from: abs(from), to }));
    const native = NativeConfig.#compact({ ios, android, resources });
    const googleServices = target.native?.android?.googleServices;
    const pushAndroid = target.native?.push?.android;
    const updates = target.updates && {
      url: target.updates.url,
      publicKey: target.updates.publicKey,
      ...((target.updates.channel ?? env) ? { channel: target.updates.channel ?? env } : {}),
      ...(target.updates.readyTimeout !== undefined ? { readyTimeout: target.updates.readyTimeout } : {}),
    };
    const config: AkanNativeConfig = {
      app: {
        id: resolveAppId(target.appId, platform),
        name: target.appName,
        fileName: target.fileName ?? NativeConfig.fileNameOf(path.basename(appPath)),
        version: target.version,
        build: target.buildNum,
      },
      web: { dir: webDir },
      plugins,
      //? PL-11: named, not implied: every plugin with its own default permissions, which is what a build without
      //? capabilities grants too, so a release states what it allows.
      capabilities: [
        {
          identifier: "app",
          description: `The plugins ${target.appName} ships, each with its default permissions`,
          permissions: plugins.map((plugin) => `${plugin}:default`),
        },
      ],
      ...(Object.keys(usageDescriptions).length ? { usageDescriptions } : {}),
      ...(target.deepLinks?.schemes?.length || target.deepLinks?.domains?.length
        ? { deepLinks: NativeConfig.#deepLinks(target, locales) }
        : {}),
      ...(native ? { native } : {}),
      ...(updates ? { updates } : {}),
      ...(pushAndroid
        ? {
            push: {
              android: { ...pushAndroid, ...(pushAndroid.smallIcon ? { smallIcon: abs(pushAndroid.smallIcon) } : {}) },
            },
          }
        : {}),
      ...(target.native?.privacy ? { privacy: target.native.privacy } : {}),
      //? assetlinks.json vouches for `<appId>.debug` outside main, the suffix a debug build installs under.
      android: { debugAppIdSuffix: ".debug", ...(googleServices ? { googleServices: abs(googleServices) } : {}) },
      keyboard: { resize: "none" },
      ...(target.assets?.icon ? { icon: NativeConfig.#icon(target.assets.icon, abs) } : {}),
      ...(target.assets?.splash ? { splash: NativeConfig.#splash(target.assets.splash, abs) } : {}),
    };
    return { config, warnings };
  }

  static #icon(
    icon: NonNullable<NonNullable<AkanMobileTargetConfig["assets"]>["icon"]>,
    abs: (relative: string) => string,
  ): NonNullable<AkanNativeConfig["icon"]> {
    return typeof icon === "string" ? abs(icon) : { ...icon, image: abs(icon.image) };
  }

  static #splash(
    splash: NonNullable<NonNullable<AkanMobileTargetConfig["assets"]>["splash"]>,
    abs: (relative: string) => string,
  ): NonNullable<AkanNativeConfig["splash"]> {
    if (typeof splash === "string") return { image: abs(splash) };
    return { ...splash, ...(splash.image ? { image: abs(splash.image) } : {}) };
  }

  /** Letters, digits, `.`, `_` and `-` only; the folder name of an akan app already is one almost always. */
  static fileNameOf(name: string) {
    return name.replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "app";
  }

  /** Drops empty arrays and objects, and answers undefined when nothing is left. */
  static #compact<T extends object>(value: { [key: string]: unknown }): T | undefined {
    const kept = Object.entries(value).filter(([, entry]) =>
      Array.isArray(entry)
        ? entry.length > 0
        : entry && typeof entry === "object"
          ? Object.keys(entry).length > 0
          : entry !== undefined,
    );
    return kept.length ? (Object.fromEntries(kept) as T) : undefined;
  }

  static #merged(
    contributed: (Record<string, AkanNativeValue> | undefined)[],
    own: Record<string, AkanNativeValue> | undefined,
  ): Record<string, AkanNativeValue> {
    return Object.assign({}, ...contributed, own);
  }

  //* Every route sits under /:lang, so an app link limited to a basePath lists it once per locale.
  static #deepLinks(target: AkanMobileTargetConfig, locales: readonly string[]) {
    const basePath = target.basePath?.replace(/^\/+|\/+$/g, "");
    const pathPrefixes = basePath ? locales.map((locale) => `/${locale}/${basePath}`) : undefined;
    return {
      ...(target.deepLinks?.schemes?.length ? { schemes: target.deepLinks.schemes } : {}),
      ...(target.deepLinks?.domains?.length
        ? { domains: target.deepLinks.domains.map((host) => (pathPrefixes ? { host, pathPrefixes } : host)) }
        : {}),
    };
  }
}
