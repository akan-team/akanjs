// Windows Authenticode signing (CLI-9): SmartScreen and Smart App Control judge a downloaded program by its
// signature, so the executable, its DLL, every PE file the server and `bin` carry, the setup program and the
// uninstaller it writes are all signed, with an RFC 3161 timestamp so they stay valid after the certificate expires.
// signtool from the Windows SDK signs with a .pfx or a certificate in the store; any other signer (Azure Trusted
// Signing's dlib, a cloud HSM's tool) is a command run once per file.

import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { exec } from "./exec.ts";
import { ToolchainError } from "./log.ts";
import { SigningError } from "./prepare.ts";

export interface WindowsSigning {
  /** A .pfx holding the code-signing certificate and its key. */
  certificate?: { path: string; password: string };
  /** A certificate in the user's or the machine's store, by its SHA-1 thumbprint (a token or an HSM keeps its key there). */
  thumbprint?: string;
  /** Any other signer, run once per file with `{file}` replaced, e.g. signtool with Azure Trusted Signing's dlib. */
  command?: string[];
  /** RFC 3161 timestamp server. Default http://timestamp.digicert.com. */
  timestampUrl?: string;
}

export const DEFAULT_TIMESTAMP_URL = "http://timestamp.digicert.com";

/** signtool: AKAN_NATIVE_SIGNTOOL, PATH, then the newest Windows 10/11 SDK's for this CPU. */
export function findSigntool(env: Record<string, string | undefined> = process.env): string | null {
  if (env.AKAN_NATIVE_SIGNTOOL) return env.AKAN_NATIVE_SIGNTOOL;
  const onPath = Bun.which("signtool");
  if (onPath) return onPath;
  const kits = env["ProgramFiles(x86)"] ? join(env["ProgramFiles(x86)"], "Windows Kits", "10", "bin") : null;
  if (!kits || !existsSync(kits)) return null;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const versions = readdirSync(kits)
    .filter((name) => /^10\.\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => compareVersions(b, a));
  for (const version of versions) {
    const candidate = join(kits, version, arch, "signtool.exe");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function compareVersions(a: string, b: string): number {
  const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

/** signtool's arguments after the executable, for `files` in one call. */
export function signtoolArgs(signing: WindowsSigning, files: string[], description: string): string[] {
  const key = signing.certificate
    ? ["/f", signing.certificate.path, "/p", signing.certificate.password]
    : signing.thumbprint
      ? ["/sha1", signing.thumbprint]
      : null;
  if (!key) throw new SigningError("Windows signing needs a certificate (.pfx), a thumbprint or a command");
  return [
    "sign",
    "/fd",
    "sha256",
    "/tr",
    signing.timestampUrl ?? DEFAULT_TIMESTAMP_URL,
    "/td",
    "sha256",
    "/d",
    description,
    ...key,
    ...files,
  ];
}

/** The command a `command` signer runs for one file. */
export function signerCommand(command: string[], file: string): string[] {
  if (!command.some((part) => part.includes("{file}"))) return [...command, file];
  return command.map((part) => part.replaceAll("{file}", file));
}

/** Signs `files` (Authenticode, SHA-256, timestamped), then verifies each against the system's trusted roots. */
export async function signWindowsFiles(signing: WindowsSigning, files: string[], description: string): Promise<void> {
  if (!files.length) return;
  if (signing.command) {
    for (const file of files) {
      const result = await exec(signerCommand(signing.command, file), { echo: false });
      if (result.code !== 0)
        throw new SigningError(`the signing command failed for ${basename(file)}: ${tail(result)}`);
    }
  } else {
    const signtool = findSigntool();
    if (!signtool)
      throw new ToolchainError(
        "signtool signs Windows programs: install the Windows SDK's Signing Tools (winget install Microsoft.WindowsSDK.10.0.26100) or set AKAN_NATIVE_SIGNTOOL",
      );
    //? signtool takes the .pfx password only as an argument; the failure message below leaves the arguments out.
    const result = await exec([signtool, ...signtoolArgs(signing, files, description)], { echo: false });
    if (result.code !== 0) throw new SigningError(`signtool could not sign ${files.length} files: ${tail(result)}`);
    const verified = await exec([signtool, "verify", "/pa", "/q", ...files], { echo: false });
    if (verified.code !== 0) throw new SigningError(`signtool verify refuses the signed files: ${tail(verified)}`);
  }
}

const tail = (result: { stdout: string; stderr: string }) =>
  (result.stderr || result.stdout).trim().split("\n").slice(-10).join("\n");

/** Every PE file under `dir` (programs, DLLs, native addons), whatever its name. */
export function peFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((file) => join(dir, file))
    .filter((file) => statSync(file).isFile() && isPe(file));
}

function isPe(file: string): boolean {
  const head = Buffer.alloc(2);
  const fd = openSync(file, "r");
  try {
    return readSync(fd, head, 0, 2, 0) === 2 && head.readUInt16LE(0) === 0x5a4d;
  } finally {
    closeSync(fd);
  }
}

/**
 * Settings from the environment (the API takes them as options only): AKAN_NATIVE_WINDOWS_CERTIFICATE + _PASSWORD,
 * AKAN_NATIVE_WINDOWS_THUMBPRINT, or AKAN_NATIVE_WINDOWS_SIGN_COMMAND (a JSON array of arguments, `{file}` replaced),
 * and AKAN_NATIVE_WINDOWS_TIMESTAMP_URL.
 */
export function windowsSigningFromEnv(
  env: Record<string, string | undefined> = process.env,
): WindowsSigning | undefined {
  const certificate = env.AKAN_NATIVE_WINDOWS_CERTIFICATE?.trim();
  const thumbprint = env.AKAN_NATIVE_WINDOWS_THUMBPRINT?.replace(/\s/g, "");
  const rawCommand = env.AKAN_NATIVE_WINDOWS_SIGN_COMMAND?.trim();
  const timestampUrl = env.AKAN_NATIVE_WINDOWS_TIMESTAMP_URL?.trim();
  if (certificate && env.AKAN_NATIVE_WINDOWS_CERTIFICATE_PASSWORD === undefined)
    throw new SigningError("AKAN_NATIVE_WINDOWS_CERTIFICATE is set without AKAN_NATIVE_WINDOWS_CERTIFICATE_PASSWORD");
  let command: string[] | undefined;
  if (rawCommand) {
    try {
      command = JSON.parse(rawCommand) as string[];
    } catch {
      command = undefined;
    }
    if (!Array.isArray(command) || !command.length || command.some((part) => typeof part !== "string"))
      throw new SigningError(
        'AKAN_NATIVE_WINDOWS_SIGN_COMMAND must be a JSON array of strings, e.g. ["signer", "{file}"]',
      );
  }
  if (!certificate && !thumbprint && !command) return undefined;
  return {
    ...(certificate
      ? { certificate: { path: certificate, password: env.AKAN_NATIVE_WINDOWS_CERTIFICATE_PASSWORD ?? "" } }
      : {}),
    ...(thumbprint ? { thumbprint } : {}),
    ...(command ? { command } : {}),
    ...(timestampUrl ? { timestampUrl } : {}),
  };
}
