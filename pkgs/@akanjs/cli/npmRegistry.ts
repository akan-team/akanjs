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

export async function getPublishedPeerDependencies(
  packageName: string,
  version: string,
  registryUrl?: string,
): Promise<Record<string, string>> {
  const registry = getNpmRegistryUrl(registryUrl);
  const res = await fetch(`${packageUrl(registry, packageName)}/${encodeURIComponent(version)}`);
  if (!res.ok) throw new Error(`Failed to fetch ${packageName}@${version} metadata from ${registry} (${res.status})`);
  return ((await res.json()) as { peerDependencies?: Record<string, string> }).peerDependencies ?? {};
}

export const akanReleasePackages = ["akanjs", "@akanjs/devkit", "@akanjs/cli", "@akanjs/language"] as const;

//? @akanjs/code is installed only by a workspace that runs `akan code`, and releases before it was split out lack it.
export const akanReleasePackagesOf = (packageJson: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}) => [
  ...akanReleasePackages,
  ...["@akanjs/code"].filter((name) => packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name]),
];

//? npm has served a release's packages up to an hour apart (@akanjs/cli after the rest, 3.3.0-rc.42 and rc.43), and an
//? install that pins them all fails until the last one is there. The package document is asked too: an install
//? resolves from it, and it can list a version minutes after the version's own document answers.
export async function getServedReleasePeers(
  version: string,
  registryUrl?: string,
  packages: readonly string[] = akanReleasePackages,
): Promise<Record<string, string>> {
  const registry = getNpmRegistryUrl(registryUrl);
  const served = await Promise.all(
    packages.map(async (name) => {
      const res = await fetch(`${packageUrl(registry, name)}/${encodeURIComponent(version)}`);
      if (res.status === 404) return false;
      if (!res.ok) throw new Error(`Failed to fetch ${name}@${version} metadata from ${registry} (${res.status})`);
      const tarball = ((await res.json()) as { dist?: { tarball?: string } }).dist?.tarball;
      if (!tarball || !(await fetch(tarball, { method: "HEAD" })).ok) return false;
      return !!(await getPublishedVersions(name, registry))?.versions.includes(version);
    }),
  );
  const missing = packages.filter((_, idx) => !served[idx]).map((name) => `${name}@${version}`);
  if (missing.length)
    throw new Error(
      `akanjs@${version} is published, but ${registry} does not serve ${missing.join(", ")} yet: a release's packages can appear up to an hour apart. Nothing was changed; run the update again once they are there.`,
    );
  return await getPublishedPeerDependencies("akanjs", version, registry);
}
