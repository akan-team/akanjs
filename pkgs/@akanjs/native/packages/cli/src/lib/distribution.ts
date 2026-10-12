import { basename } from "node:path";
import { CliError } from "./log.ts";
import { type MacosNotarization, type MacosSigning, macosDistributionFromEnv } from "./macossigning.ts";
import { type WindowsSigning, windowsSigningFromEnv } from "./windowssigning.ts";

export interface DistributionRequest {
  /** Sign the app with the identity the env names (Developer ID on macOS, Authenticode on Windows). */
  sign?: boolean;
  /** macOS: upload the signed app to Apple's notary service. */
  notarize?: boolean;
}

export interface Distribution {
  macos?: { signing?: MacosSigning; notarize?: MacosNotarization };
  windows?: { signing?: WindowsSigning };
  /** One line saying who signs and where the app goes, for before the build; null when nothing is signed. */
  notice: string | null;
  /** The env names that configure a signature this build was not asked to make. */
  unused: string[];
}

const SIGNING_ENV =
  /^AKAN_NATIVE_(?:MACOS_(?:IDENTITY|CERTIFICATE|NOTARY_PROFILE|NOTARY_KEY)|WINDOWS_(?:CERTIFICATE|THUMBPRINT|SIGN_COMMAND))$/;

//* The env says which identity a signature uses, never whether to sign: a shell profile exporting a Developer ID
//* would otherwise sign every release build, and notarize it, which uploads the app to Apple unasked.
export function requestedDistribution(
  platform: string,
  profile: "debug" | "release",
  { sign = false, notarize = false }: DistributionRequest,
  env: Record<string, string | undefined> = process.env,
): Distribution {
  const unused = Object.keys(env)
    .filter((name) => SIGNING_ENV.test(name) && env[name]?.trim())
    .sort();
  if (!sign && !notarize) return { notice: null, unused };
  if (platform !== "macos" && platform !== "windows")
    throw new CliError(`--sign and --notarize are for a macOS or Windows app, not ${platform}`);
  if (profile !== "release") throw new CliError("--sign and --notarize take a release build");
  if (notarize && platform !== "macos") throw new CliError("--notarize is Apple's: a Windows app is only signed");
  if (notarize && !sign) throw new CliError("--notarize takes --sign: Apple notarizes a signed app only");
  if (platform === "windows") {
    const signing = windowsSigningFromEnv(env);
    if (!signing)
      throw new CliError(
        "--sign needs the identity: AKAN_NATIVE_WINDOWS_CERTIFICATE (+ _PASSWORD), AKAN_NATIVE_WINDOWS_THUMBPRINT or AKAN_NATIVE_WINDOWS_SIGN_COMMAND",
      );
    const by = signing.command
      ? `the signing command ${basename(signing.command[0] ?? "")}, which may send each file to its signing service`
      : signing.thumbprint
        ? `the certificate ${signing.thumbprint}`
        : `the certificate in ${basename(signing.certificate?.path ?? "")}`;
    return { windows: { signing }, notice: `Signs the Windows app with ${by}.`, unused: [] };
  }
  const { signing, notarize: notarization } = macosDistributionFromEnv(env);
  if (!signing)
    throw new CliError(
      "--sign needs the identity: AKAN_NATIVE_MACOS_IDENTITY, or AKAN_NATIVE_MACOS_CERTIFICATE (+ _PASSWORD)",
    );
  if (notarize && !notarization)
    throw new CliError(
      "--notarize needs the credentials: AKAN_NATIVE_MACOS_NOTARY_PROFILE, or AKAN_NATIVE_MACOS_NOTARY_KEY + _KEY_ID",
    );
  const identity = signing.identity ?? `the certificate in ${basename(signing.certificate?.path ?? "")}`;
  const notary = notarization?.profile
    ? `notarytool profile ${notarization.profile}`
    : `API key ${notarization?.keyId}`;
  return {
    macos: { signing, ...(notarize && notarization ? { notarize: notarization } : {}) },
    notice: notarize
      ? `Signs the macOS app as ${identity} and uploads it to Apple's notary service (${notary}).`
      : `Signs the macOS app as ${identity}; nothing is uploaded without --notarize.`,
    unused: [],
  };
}
