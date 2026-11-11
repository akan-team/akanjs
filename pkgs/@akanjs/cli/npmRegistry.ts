import { ShellOnlyEnv } from "@akanjs/devkit/util/shellOnlyEnv";
import { Logger } from "akanjs/common";

interface NpmPackageMetadata {
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, unknown>;
}

export interface PublishedVersions {
  tags: Record<string, string>;
  versions: string[];
}

const defaultNpmRegistry = "https://registry.npmjs.org";

//? The registry picks the code `akan` installs and runs, so a repo's dotenv cannot choose it.
const registryEnv = new ShellOnlyEnv(["AKAN_NPM_REGISTRY"]);

export const npmRegistryFromEnv = () => registryEnv.get("AKAN_NPM_REGISTRY");

export const warnIgnoredNpmRegistry = () => {
  for (const line of registryEnv.ignored()) Logger.warn(line);
};

export const getNpmRegistryUrl = (registryUrl = npmRegistryFromEnv() ?? defaultNpmRegistry) =>
  registryUrl.replace(/\/+$/, "");

const packageUrl = (registry: string, packageName: string) =>
  `${registry}/${encodeURIComponent(packageName).replace(/^%40/, "@")}`;

export async function getPublishedVersions(
  packageName: string,
  registryUrl?: string,
): Promise<PublishedVersions | null> {
  const registry = getNpmRegistryUrl(registryUrl);
  const res = await fetch(packageUrl(registry, packageName), {
    headers: { Accept: "application/vnd.npm.install-v1+json" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch ${packageName} metadata from ${registry} (${res.status})`);
  const metadata = (await res.json()) as NpmPackageMetadata;
  return { tags: metadata["dist-tags"] ?? {}, versions: Object.keys(metadata.versions ?? {}) };
}

export async function getLatestPackageVersion(
  packageName: string,
  tag = "latest",
  registryUrl?: string,
): Promise<string> {
  const registry = getNpmRegistryUrl(registryUrl);
  const res = await fetch(packageUrl(registry, packageName));
  if (!res.ok) throw new Error(`Failed to fetch ${packageName} metadata from ${registry}`);
  const metadata = (await res.json()) as NpmPackageMetadata;
  const version = metadata["dist-tags"]?.[tag];
  if (!version) throw new Error(`No npm dist-tag "${tag}" found for ${packageName}`);
  return version;
}
