// macOS distribution signing (CLI-9): Developer ID, the hardened runtime, notarization and the dmg.
//
// A downloaded app carries the quarantine attribute, and Gatekeeper opens it only when it is signed
// with a Developer ID Application certificate, with the hardened runtime and a secure timestamp on
// every Mach-O file, and notarized by Apple. The ticket is stapled so a first launch works offline.
// Only Apple's command line tools: security, codesign, notarytool, stapler, hdiutil, ditto, spctl.

import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { exec, execOrThrow } from "./exec.ts";
import { CliError, dim, log } from "./log.ts";
import { type PlistValue, toPlist } from "./plist.ts";
import { SigningError } from "./prepare.ts";
import { type SigningIdentity, validIdentities } from "./signing.ts";

export interface MacosSigning {
  /** A certificate name ("Developer ID Application: Name (TEAMID)") or its SHA-1, in a keychain already. */
  identity?: string;
  /** A .p12 holding the identity: imported into a keychain of its own for the build, then removed. */
  certificate?: { path: string; password: string };
}

/** App Store Connect API key (key, keyId, issuer), or a profile `xcrun notarytool store-credentials` saved. */
export interface MacosNotarization {
  /** The AuthKey_<id>.p8 file. */
  key?: string;
  keyId?: string;
  /** The issuer id; left out for an individual API key. */
  issuer?: string;
  profile?: string;
}

export interface MacosBuild {
  signing?: MacosSigning;
  /** Release builds signed with a Developer ID only. */
  notarize?: MacosNotarization;
  /** A .dmg beside the app, with an Applications link; signed and notarized as the app is. */
  dmg?: boolean;
}

export type MacosSignature = "adhoc" | "identity" | "development" | "distribution";

export interface ResolvedMacosIdentity {
  /** The certificate's SHA-1, or "-" for ad hoc. */
  sign: string;
  name: string;
  kind: MacosSignature;
  teamId?: string;
  /** Set when the identity lives in a keychain made for this build. */
  keychain?: string;
}

/**
 * Entitlements the hardened runtime needs for the app's own code: Bun's JavaScriptCore writes JIT code, and the
 * TCC resources the Info.plist asks for are refused to a hardened app that does not claim them.
 */
export const RUNTIME_ENTITLEMENTS: Record<string, PlistValue> = {
  "com.apple.security.cs.allow-jit": true,
  "com.apple.security.cs.allow-unsigned-executable-memory": true,
};

const USAGE_ENTITLEMENTS: Record<string, string> = {
  NSCameraUsageDescription: "com.apple.security.device.camera",
  NSMicrophoneUsageDescription: "com.apple.security.device.audio-input",
  NSLocationUsageDescription: "com.apple.security.personal-information.location",
  NSLocationWhenInUseUsageDescription: "com.apple.security.personal-information.location",
  NSContactsUsageDescription: "com.apple.security.personal-information.addressbook",
  NSCalendarsUsageDescription: "com.apple.security.personal-information.calendars",
  NSPhotoLibraryUsageDescription: "com.apple.security.personal-information.photos-library",
};

/** The main executable's entitlements: the runtime's, those of the usage texts in `infoPlist`, then the app's own. */
export function appEntitlements(
  infoPlist: Record<string, PlistValue>,
  extra: Record<string, PlistValue> = {},
): Record<string, PlistValue> {
  const out: Record<string, PlistValue> = { ...RUNTIME_ENTITLEMENTS };
  for (const key of Object.keys(infoPlist)) {
    const entitlement = USAGE_ENTITLEMENTS[key];
    if (entitlement) out[entitlement] = true;
  }
  return { ...out, ...extra };
}

/**
 * The kind of a certificate by its name. A Developer ID's parentheses hold the team id; an Apple Development
 * certificate's hold the member's own id, so its team is not read from the name.
 */
export function identityKind(name: string): { kind: MacosSignature; teamId?: string } {
  if (name.startsWith("Developer ID Application:")) {
    const teamId = /\(([A-Z0-9]{10})\)\s*$/.exec(name)?.[1];
    return { kind: "distribution", ...(teamId ? { teamId } : {}) };
  }
  if (name.startsWith("Apple Development:") || name.startsWith("Mac Developer:")) return { kind: "development" };
  return { kind: "identity" };
}

/** The identity `wanted` names (a name or a SHA-1) among `identities`. */
export function pickMacosIdentity(identities: SigningIdentity[], wanted: string): SigningIdentity {
  const upper = wanted.toUpperCase();
  const found = identities.filter((i) => i.hash === upper || i.name === wanted);
  const [only, ...more] = found;
  if (only && more.length === 0) return only;
  if (more.length)
    throw new SigningError(`several valid identities are called ${JSON.stringify(wanted)}; give its SHA-1 instead`);
  throw new SigningError(
    `no valid code-signing identity ${JSON.stringify(wanted)} in the keychains`,
    identities.map((i) => i.name),
  );
}

/**
 * Runs `fn` with the identity `signing` names, or ad hoc without one. A certificate file goes into a keychain made for
 * this build (on the user's search list meanwhile, so codesign finds its chain), deleted afterwards.
 */
export async function withMacosIdentity<T>(
  signing: MacosSigning | undefined,
  fn: (identity: ResolvedMacosIdentity) => Promise<T>,
  fallback: () => Promise<ResolvedMacosIdentity>,
): Promise<T> {
  if (!signing?.certificate) {
    if (!signing?.identity) return fn(await fallback());
    const picked = pickMacosIdentity(await validIdentities(), signing.identity);
    return fn({ sign: picked.hash, name: picked.name, ...identityKind(picked.name) });
  }
  const dir = mkdtempSync(join(tmpdir(), "akan-native-macos-signing-"));
  const keychain = join(dir, "signing.keychain-db");
  const password = randomBytes(24).toString("hex");
  const before = await searchList();
  try {
    await security(["create-keychain", "-p", password, keychain]);
    await security(["set-keychain-settings", "-lut", "21600", keychain]);
    await security(["unlock-keychain", "-p", password, keychain]);
    //? `security import` takes the .p12 password only as an argument (electron-builder and fastlane pass it the
    //? same way); the failure message below leaves it out.
    await security(
      [
        "import",
        signing.certificate.path,
        "-k",
        keychain,
        "-P",
        signing.certificate.password,
        "-T",
        "/usr/bin/codesign",
      ],
      `the certificate ${signing.certificate.path} could not be imported (is the password right?)`,
    );
    //? Without it codesign asks for the keychain password in a dialog, which no CI answers.
    await security(["set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", password, keychain]);
    await security(["list-keychains", "-d", "user", "-s", keychain, ...before]);
    const identities = await validIdentities(keychain);
    const picked = signing.identity
      ? pickMacosIdentity(identities, signing.identity)
      : (identities.find((i) => identityKind(i.name).kind === "distribution") ?? identities[0]);
    if (!picked) throw new SigningError(`${signing.certificate.path} holds no valid code-signing identity`);
    return await fn({ sign: picked.hash, name: picked.name, keychain, ...identityKind(picked.name) });
  } finally {
    await exec(["/usr/bin/security", "list-keychains", "-d", "user", "-s", ...before], { echo: false });
    await exec(["/usr/bin/security", "delete-keychain", keychain], { echo: false });
    rmSync(dir, { recursive: true, force: true });
  }
}

async function searchList(): Promise<string[]> {
  const out = (await exec(["/usr/bin/security", "list-keychains", "-d", "user"], { echo: false })).stdout;
  return [...out.matchAll(/"([^"]+)"/g)].flatMap((m) => (m[1] ? [m[1]] : []));
}

/** A `security` call whose failure never repeats its arguments: some carry a password. */
async function security(args: string[], failure?: string): Promise<void> {
  const result = await exec(["/usr/bin/security", ...args], { echo: false });
  if (result.code !== 0)
    throw new SigningError(failure ?? `security ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`);
}

export interface CodesignOptions {
  /** The hardened runtime and a secure timestamp, what notarization requires of every Mach-O file. */
  hardened: boolean;
  /** A secure timestamp without the runtime (a disk image). Default: `hardened`. */
  timestamp?: boolean;
  entitlements?: string;
}

/** codesign arguments for one file. Apple's timestamp server only stamps certificates Apple issued. */
export function codesignArgs(identity: ResolvedMacosIdentity, file: string, options: CodesignOptions): string[] {
  const timestamp = identity.sign !== "-" && (options.timestamp ?? options.hardened);
  return [
    "codesign",
    "--force",
    "--sign",
    identity.sign,
    ...(identity.keychain ? ["--keychain", identity.keychain] : []),
    ...(timestamp ? ["--timestamp"] : []),
    ...(options.hardened && identity.sign !== "-" ? ["--options", "runtime"] : []),
    ...(options.entitlements ? ["--entitlements", options.entitlements] : []),
    file,
  ];
}

export async function codesign(identity: ResolvedMacosIdentity, file: string, options: CodesignOptions): Promise<void> {
  const result = await exec(codesignArgs(identity, file, options), { echo: false });
  if (result.code !== 0)
    throw new SigningError(
      `codesign with "${identity.name}" failed for ${basename(file)}: ${(result.stderr || result.stdout).trim()}`,
    );
}

export function writeEntitlements(dir: string, entitlements: Record<string, PlistValue>): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "entitlements.plist");
  writeFileSync(file, toPlist(entitlements));
  return file;
}

export function notarytoolAuth(notarization: MacosNotarization): string[] {
  if (notarization.profile) return ["--keychain-profile", notarization.profile];
  if (!notarization.key || !notarization.keyId)
    throw new SigningError(
      "notarization needs an App Store Connect API key (key, keyId and, for a team key, issuer) or a keychain profile",
    );
  return [
    "--key",
    notarization.key,
    "--key-id",
    notarization.keyId,
    ...(notarization.issuer ? ["--issuer", notarization.issuer] : []),
  ];
}

interface NotarySubmission {
  id?: string;
  status?: string;
  message?: string;
}

/** Submits `file` (a .zip, .dmg or .pkg), waits for Apple's verdict and refuses anything but Accepted. */
export async function notarize(file: string, notarization: MacosNotarization): Promise<string> {
  const auth = notarytoolAuth(notarization);
  log.step(`notarize: ${basename(file)}`);
  const result = await exec(["xcrun", "notarytool", "submit", file, ...auth, "--wait", "--output-format", "json"], {
    echo: false,
  });
  const submission = parseSubmission(result.stdout);
  if (submission.status === "Accepted" && submission.id) {
    log.info(dim(`notarized: ${submission.id}`));
    return submission.id;
  }
  const issues = submission.id ? await notaryIssues(submission.id, auth) : [];
  throw new SigningError(
    `notarization of ${basename(file)} ended ${submission.status ?? "without a verdict"}${submission.message ? `: ${submission.message}` : ""}${result.code !== 0 && !submission.status ? `\n${(result.stderr || result.stdout).trim()}` : ""}`,
    issues,
  );
}

export function parseSubmission(stdout: string): NotarySubmission {
  try {
    return JSON.parse(stdout) as NotarySubmission;
  } catch {
    return {};
  }
}

async function notaryIssues(id: string, auth: string[]): Promise<string[]> {
  const result = await exec(["xcrun", "notarytool", "log", id, ...auth], { echo: false });
  return notaryLogIssues(result.stdout);
}

/** One line per issue of a notarytool log: the file and Apple's message. */
export function notaryLogIssues(stdout: string): string[] {
  try {
    const parsed = JSON.parse(stdout) as { issues?: { path?: string; message?: string }[] | null };
    return (parsed.issues ?? []).map((i) => `${i.path ?? "?"}: ${i.message ?? ""}`.trim());
  } catch {
    return [];
  }
}

export async function staple(file: string): Promise<void> {
  await execOrThrow(["xcrun", "stapler", "staple", file], { echo: false });
}

/** The .app as notarytool takes it: a zip that keeps the bundle's symlinks and signature. */
export async function zipForNotary(appPath: string, zip: string): Promise<void> {
  rmSync(zip, { force: true });
  await execOrThrow(["ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", appPath, zip], { echo: false });
}

/** A compressed disk image of the app beside a link to /Applications, the window people drag it into. */
export async function buildDmg(appPath: string, dmgPath: string, volumeName: string, workDir: string): Promise<void> {
  const staging = join(workDir, "dmg");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  await execOrThrow(["ditto", appPath, join(staging, basename(appPath))], { echo: false });
  symlinkSync("/Applications", join(staging, "Applications"));
  rmSync(dmgPath, { force: true });
  await execOrThrow(
    [
      "hdiutil",
      "create",
      "-volname",
      volumeName,
      "-srcfolder",
      staging,
      "-ov",
      "-fs",
      "HFS+",
      "-format",
      "UDZO",
      dmgPath,
    ],
    { echo: false },
  );
  rmSync(staging, { recursive: true, force: true });
}

/** What Gatekeeper says of a notarized app or disk image, as a downloaded copy would be judged. */
export async function assessGatekeeper(file: string, type: "execute" | "open"): Promise<void> {
  const args =
    type === "execute"
      ? ["spctl", "--assess", "--type", "execute", "-vv", file]
      : ["spctl", "--assess", "--type", "open", "--context", "context:primary-signature", "-vv", file];
  const result = await exec(args, { echo: false });
  if (result.code !== 0)
    throw new CliError(`Gatekeeper refuses ${basename(file)}: ${(result.stderr || result.stdout).trim()}`);
}

/**
 * Settings from the environment for the command line (the API takes them as options only):
 * AKAN_NATIVE_MACOS_IDENTITY, AKAN_NATIVE_MACOS_CERTIFICATE + _PASSWORD, and AKAN_NATIVE_MACOS_NOTARY_KEY +
 * _KEY_ID + _ISSUER or AKAN_NATIVE_MACOS_NOTARY_PROFILE.
 */
export function macosDistributionFromEnv(
  env: Record<string, string | undefined> = process.env,
): Pick<MacosBuild, "signing" | "notarize"> {
  const identity = env.AKAN_NATIVE_MACOS_IDENTITY?.trim();
  const certificate = env.AKAN_NATIVE_MACOS_CERTIFICATE?.trim();
  if (certificate && env.AKAN_NATIVE_MACOS_CERTIFICATE_PASSWORD === undefined)
    throw new SigningError("AKAN_NATIVE_MACOS_CERTIFICATE is set without AKAN_NATIVE_MACOS_CERTIFICATE_PASSWORD");
  const signing: MacosSigning | undefined =
    identity || certificate
      ? {
          ...(identity ? { identity } : {}),
          ...(certificate
            ? { certificate: { path: certificate, password: env.AKAN_NATIVE_MACOS_CERTIFICATE_PASSWORD ?? "" } }
            : {}),
        }
      : undefined;
  const profile = env.AKAN_NATIVE_MACOS_NOTARY_PROFILE?.trim();
  const key = env.AKAN_NATIVE_MACOS_NOTARY_KEY?.trim();
  const keyId = env.AKAN_NATIVE_MACOS_NOTARY_KEY_ID?.trim();
  const issuer = env.AKAN_NATIVE_MACOS_NOTARY_ISSUER?.trim();
  if (key && !keyId)
    throw new SigningError("AKAN_NATIVE_MACOS_NOTARY_KEY is set without AKAN_NATIVE_MACOS_NOTARY_KEY_ID");
  const notarize: MacosNotarization | undefined = profile
    ? { profile }
    : key && keyId
      ? { key, keyId, ...(issuer ? { issuer } : {}) }
      : undefined;
  return { ...(signing ? { signing } : {}), ...(notarize ? { notarize } : {}) };
}
