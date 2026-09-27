// iOS device signing (akanjs readiness O1-2, O1-3): identities from the login keychain, provisioning
// profiles that Xcode (or the developer site) made, and the check that a profile allows what the app's
// entitlements ask for. Only Apple's own command line tools: security, plutil, codesign.
// Stage 1 (D7) uses what Xcode created locally; the App Store Connect API comes later.

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { exec, execOrThrow } from "./exec.ts";
import { type PlistValue, parsePlist } from "./plist.ts";
import { SigningError } from "./prepare.ts";

export interface SigningIdentity {
  /** The certificate's SHA-1, which codesign takes without ambiguity. */
  sha1: string;
  /** e.g. "Apple Development: Jane Doe (ABCDE12345)". */
  name: string;
}

export type ProfileKind = "development" | "ad-hoc" | "app-store" | "enterprise";

export interface ProvisioningProfile {
  path: string;
  name: string;
  uuid: string;
  teamId: string;
  /** application-identifier, e.g. "TEAMID.com.akanjs.sample" or "TEAMID.*". */
  appId: string;
  entitlements: Record<string, PlistValue>;
  expires: Date;
  kind: ProfileKind;
  /** Device UDIDs (development and ad-hoc). */
  devices: string[];
  /** SHA-1 of the certificates the profile allows to sign. */
  certificates: string[];
}

/** Valid code signing identities (`security find-identity -v`: revoked and expired ones are left out). */
export async function signingIdentities(): Promise<SigningIdentity[]> {
  const out = (await exec(["security", "find-identity", "-v", "-p", "codesigning"], { echo: false })).stdout;
  return parseIdentities(out);
}

export function parseIdentities(out: string): SigningIdentity[] {
  return [...out.matchAll(/^\s*\d+\)\s+([0-9A-F]{40})\s+"([^"]+)"\s*$/gm)].map((m) => ({ sha1: m[1]!, name: m[2]! }));
}

/**
 * The identity to sign with: `wanted` as a SHA-1 or a name (a name two valid certificates share is an
 * error), else the only valid "Apple Development" (development) or "Apple Distribution" identity.
 */
export function pickIdentity(
  identities: SigningIdentity[],
  kind: "development" | "distribution",
  wanted?: string,
): SigningIdentity {
  if (wanted) {
    const matches = identities.filter(
      (i) => i.sha1 === wanted.toUpperCase() || i.name === wanted || i.name.startsWith(`${wanted} (`),
    );
    if (matches.length === 1) return matches[0]!;
    if (matches.length > 1)
      throw new SigningError(
        `several valid identities are called ${JSON.stringify(wanted)}; give its SHA-1 instead (security find-identity -v -p codesigning)`,
      );
    throw new SigningError(`no valid code signing identity ${JSON.stringify(wanted)} in the keychain`);
  }
  const prefix =
    kind === "development" ? /^(Apple Development|iPhone Developer):/ : /^(Apple Distribution|iPhone Distribution):/;
  const candidates = identities.filter((i) => prefix.test(i.name));
  if (candidates.length === 1) return candidates[0]!;
  if (candidates.length === 0) {
    throw new SigningError(
      `no valid ${kind === "development" ? "Apple Development" : "Apple Distribution"} identity in the keychain: create one in Xcode (Settings → Accounts → Manage Certificates)`,
    );
  }
  throw new SigningError(
    `several ${kind} identities: choose one (AKAN_NATIVE_IOS_IDENTITY or signing.identity): ${candidates.map((c) => c.name).join(", ")}`,
  );
}

/** The folders Xcode and older tools keep provisioning profiles in. */
export function profileFolders(home = homedir()): string[] {
  return [
    join(home, "Library", "Developer", "Xcode", "UserData", "Provisioning Profiles"),
    join(home, "Library", "MobileDevice", "Provisioning Profiles"),
  ];
}

/** Decodes a .mobileprovision (a CMS-signed plist). */
export async function readProfile(path: string): Promise<ProvisioningProfile> {
  const dir = mkdtempSync(join(tmpdir(), "akan-native-profile-"));
  try {
    const plist = join(dir, "profile.plist");
    await execOrThrow(["security", "cms", "-D", "-i", path, "-o", plist], { echo: false });
    // plutil's JSON cannot hold the profile's <data> and <date> values.
    return profileFromPlist(path, parsePlist(readFileSync(plist, "utf8")) as Record<string, unknown>);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A profile from its decoded plist (parsePlist: data as base64, dates as Date). */
export function profileFromPlist(path: string, p: Record<string, unknown>): ProvisioningProfile {
  const entitlements = (p.Entitlements ?? {}) as Record<string, PlistValue>;
  const devices = (p.ProvisionedDevices as string[] | undefined) ?? [];
  const kind: ProfileKind =
    p.ProvisionsAllDevices === true
      ? "enterprise"
      : entitlements["get-task-allow"] === true
        ? "development"
        : devices.length
          ? "ad-hoc"
          : "app-store";
  return {
    path,
    name: String(p.Name ?? ""),
    uuid: String(p.UUID ?? ""),
    teamId: String((p.TeamIdentifier as string[] | undefined)?.[0] ?? ""),
    appId: String(entitlements["application-identifier"] ?? ""),
    entitlements,
    expires: p.ExpirationDate instanceof Date ? p.ExpirationDate : new Date(String(p.ExpirationDate ?? 0)),
    kind,
    devices,
    certificates: ((p.DeveloperCertificates as string[] | undefined) ?? []).map((der) =>
      createHash("sha1").update(Buffer.from(der, "base64")).digest("hex").toUpperCase(),
    ),
  };
}

/** Whether a profile's application-identifier covers the bundle id (exactly, or a wildcard like TEAM.* or TEAM.com.akanjs.*). */
export function profileCovers(profile: ProvisioningProfile, bundleId: string): "exact" | "wildcard" | null {
  const id = profile.appId.slice(profile.teamId.length + 1);
  if (id === bundleId) return "exact";
  if (id.endsWith("*") && bundleId.startsWith(id.slice(0, -1))) return "wildcard";
  return null;
}

/** The profiles in Xcode's folders; unreadable ones are left out. */
export async function localProfiles(): Promise<ProvisioningProfile[]> {
  const profiles: ProvisioningProfile[] = [];
  for (const dir of profileFolders()) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".mobileprovision")) continue;
      const profile = await readProfile(join(dir, name)).catch(() => null);
      if (profile) profiles.push(profile);
    }
  }
  return profiles;
}

export interface SigningQuery {
  bundleId: string;
  /** development for run and dev; app-store for release, ad-hoc only when asked for. */
  kinds: ProfileKind[];
  identityKind: "development" | "distribution";
  /** Only this team's profiles. */
  teamId?: string;
  /** A certificate name or SHA-1: only it. */
  identity?: string;
  /** The iPhone the build goes on: development and ad hoc profiles must list it. */
  device?: { udid: string; name?: string };
  /** The entitlements the app asks for, as signing with this profile would request them. */
  entitlementsFor(profile: ProvisioningProfile): Record<string, PlistValue>;
  now?: Date;
}

export interface SigningChoice {
  identity: SigningIdentity;
  profile: ProvisioningProfile;
}

const describe = (p: ProvisioningProfile) =>
  `"${p.name}" (team ${p.teamId}, ${p.kind}, until ${p.expires.toISOString().slice(0, 10)})`;

/**
 * The identity and profile an iPhone build signs with (D7 step 1: what Xcode made on this Mac;
 * docs/api.md §3 "Finding the signing"). A profile fits when it covers the bundle id (a wildcard
 * only when the app asks for neither push nor associated domains), is of the wanted kind, has not
 * expired, belongs to `teamId` when one is given, lists `device` when it is a development or ad hoc
 * profile, allows every entitlement the app asks for, and one of its certificates is a valid identity
 * in the keychain (or the chosen one). Of the fitting ones,
 * exact bundle ids beat wildcards; then several teams, or several certificates, are not decided
 * here: the error lists the candidates. One team and one certificate: the profile that expires last
 * (Xcode makes a new one when it renews).
 */
export function chooseSigning(
  identities: SigningIdentity[],
  profiles: ProvisioningProfile[],
  q: SigningQuery,
): SigningChoice {
  const now = q.now ?? new Date();
  const pool = q.identity
    ? [pickIdentity(identities, q.identityKind, q.identity)]
    : identities.filter((i) =>
        (q.identityKind === "development"
          ? /^(Apple Development|iPhone Developer):/
          : /^(Apple Distribution|iPhone Distribution):/
        ).test(i.name),
      );
  if (!pool.length) pickIdentity(identities, q.identityKind); // throws: no identity of the kind
  const skipped: string[] = [];
  const candidates: (SigningChoice & { exact: boolean })[] = [];
  const device = q.device && `device ${q.device.name ? `"${q.device.name}" ` : ""}(${q.device.udid})`;
  let onlyDevice = false; // a profile that failed for the device alone
  for (const profile of profiles) {
    const cover = profileCovers(profile, q.bundleId);
    if (!cover) continue;
    const why: string[] = [];
    if (!q.kinds.includes(profile.kind))
      why.push(`${profile.kind === "development" ? "a" : "an"} ${profile.kind} profile, not ${q.kinds.join(" or ")}`);
    if (profile.expires.getTime() <= now.getTime()) why.push("expired");
    if (q.teamId && profile.teamId !== q.teamId) why.push(`team ${profile.teamId}, not ${q.teamId}`);
    const missesDevice =
      !!q.device &&
      (profile.kind === "development" || profile.kind === "ad-hoc") &&
      !profile.devices.includes(q.device.udid);
    if (missesDevice) why.push(`it does not include ${device}`);
    const requested = q.entitlementsFor(profile);
    if (
      cover === "wildcard" &&
      (requested["aps-environment"] !== undefined || requested["com.apple.developer.associated-domains"] !== undefined)
    ) {
      why.push("a wildcard profile cannot carry push or associated domains");
    } else why.push(...entitlementProblems(requested, profile));
    const allowed = pool.filter((i) => profile.certificates.includes(i.sha1));
    if (!allowed.length)
      why.push(
        q.identity
          ? `it does not include the certificate of "${pool[0]!.name}"`
          : "none of its certificates is a valid identity in this keychain",
      );
    if (why.length) {
      if (missesDevice && why.length === 1) onlyDevice = true;
      skipped.push(`${describe(profile)}: ${why.join("; ")}`);
      continue;
    }
    for (const identity of allowed) candidates.push({ identity, profile, exact: cover === "exact" });
  }
  if (!candidates.length) {
    throw new SigningError(
      `no ${q.kinds.join(" or ")} provisioning profile fits ${q.bundleId}` +
        (skipped.length ? "" : " (none on this Mac covers it)") +
        (onlyDevice
          ? `. The ${device} is not in the profile: register it (build once for this device in Xcode, or add it on the developer site), then get the profile again.`
          : `. Create one with Xcode (a project with this bundle id and your team, built once for the device), or pass signing.provisioningProfile.`),
      skipped,
    );
  }
  const best = candidates.some((c) => c.exact) ? candidates.filter((c) => c.exact) : candidates;
  const list = () => best.map((c) => `${describe(c.profile)} with ${c.identity.name}`);
  if (new Set(best.map((c) => c.profile.teamId)).size > 1)
    throw new SigningError(`profiles of several teams fit ${q.bundleId}: choose one with signing.teamId`, list());
  if (new Set(best.map((c) => c.identity.sha1)).size > 1)
    throw new SigningError(
      `several certificates can sign with the profile for ${q.bundleId}: choose one with signing.identity`,
      list(),
    );
  best.sort((a, b) => b.profile.expires.getTime() - a.profile.expires.getTime());
  return { identity: best[0]!.identity, profile: best[0]!.profile };
}

/**
 * Entitlements the app asks for that the profile does not allow (App Store Connect and the device
 * refuse such a signature). A profile lists what the App ID has: an array value there is a set of
 * allowed values, where "*" or "TEAM.*" allows any.
 */
export function entitlementProblems(requested: Record<string, PlistValue>, profile: ProvisioningProfile): string[] {
  const allowed = profile.entitlements;
  const problems: string[] = [];
  const matches = (value: PlistValue, pattern: PlistValue) =>
    pattern === "*" ||
    value === pattern ||
    (typeof pattern === "string" &&
      pattern.endsWith(".*") &&
      typeof value === "string" &&
      value.startsWith(pattern.slice(0, -1)));
  for (const [key, value] of Object.entries(requested)) {
    if (key === "application-identifier" || key === "com.apple.developer.team-identifier" || key === "get-task-allow")
      continue;
    const has = allowed[key];
    if (has === undefined) {
      problems.push(`${key}: the profile's App ID does not have this capability`);
      continue;
    }
    if (Array.isArray(value)) {
      const patterns = Array.isArray(has) ? has : [has];
      for (const v of value)
        if (!patterns.some((p) => matches(v, p)))
          problems.push(`${key}: ${JSON.stringify(v)} is not allowed by the profile (${JSON.stringify(has)})`);
    } else if (!matches(value, has) && !(typeof has === "boolean" && has === true && value === true)) {
      problems.push(`${key}: the app asks for ${JSON.stringify(value)}, the profile has ${JSON.stringify(has)}`);
    }
  }
  return problems;
}
