// Whose signature a desktop release carries, checked before it replaces the app (desktop.ts): macOS `codesign`, and
// the installed app's team; Windows Authenticode, by the installed app's signer or updates.windowsSigners.
import { closeSync, openSync, readSync } from "node:fs";
import { join } from "node:path";

export type SignatureTool = (cmd: string[], env?: Record<string, string>) => Promise<{ code: number; output: string }>;

export interface SignerCheck {
  mac: boolean;
  windows: boolean;
  /** Runs codesign (macOS) or PowerShell (Windows) on a signature. */
  tool: SignatureTool;
  /** updates.windowsSigners. */
  pins: string[];
  /** The executable inside an app with the running one's name. */
  executableIn(app: string): string;
}

const powershell = () =>
  join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

/**
 * Whether the release's executable is signed by the installed one's signer, decided in PowerShell and printed as one
 * ASCII verdict line: `unsigned` (the installed one has no valid signature), `same` or `other`. With thumbprints in
 * AKAN_NATIVE_SIGNERS, `same` only for a valid signature by one of them, whatever signed the installed one. Constrained
 * Language Mode (WDAC, AppLocker) refuses .NET type literals and method calls, so the script makes none, and an error
 * ends it before any verdict.
 */
const AUTHENTICODE = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$release = Get-AuthenticodeSignature -LiteralPath $env:AKAN_NATIVE_RELEASE_EXE
$pins = @("$env:AKAN_NATIVE_SIGNERS" -split ',' | Where-Object { $_ })
if ($pins.Count -gt 0) {
  if ("$($release.Status)" -ceq 'Valid' -and $pins -contains "$($release.SignerCertificate.Thumbprint)") { 'akan-signer: same' }
  else { 'akan-signer: other' }
} else {
  $own = Get-AuthenticodeSignature -LiteralPath $env:AKAN_NATIVE_INSTALLED_EXE
  if ("$($own.Status)" -cne 'Valid') { 'akan-signer: unsigned' }
  elseif ("$($release.Status)" -ceq 'Valid' -and "$($release.SignerCertificate.Subject)" -ceq "$($own.SignerCertificate.Subject)") { 'akan-signer: same' }
  else { 'akan-signer: other' }
}`;

/**
 * Whether an executable is unsigned, read from its PE header without PowerShell: an x64 or arm64 image (PE32+) whose
 * certificate table, where Authenticode embeds a signature, is empty.
 */
function isUnsignedImage(exe: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(exe, "r");
    const head = Buffer.alloc(4096);
    const size = readSync(fd, head, 0, head.length, 0);
    if (size < 64 || head.toString("latin1", 0, 2) !== "MZ") return false;
    const pe = head.readUInt32LE(0x3c);
    if (pe + 176 > size || head.toString("latin1", pe, pe + 4) !== "PE\0\0") return false;
    //? The optional header follows the signature and the 20-byte COFF header. Its data directories start 112 bytes in,
    //? 8 bytes each, after their count; the certificate table (IMAGE_DIRECTORY_ENTRY_SECURITY) is the fifth.
    const optional = pe + 24;
    if (head.readUInt16LE(optional) !== 0x20b) return false;
    if (head.readUInt32LE(optional + 108) < 5) return true;
    return head.readUInt32LE(optional + 112 + 32) === 0 && head.readUInt32LE(optional + 112 + 36) === 0;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** A signature tool's exit code and what it printed; -1 when it could not start. */
export async function runSignatureTool(
  cmd: string[],
  env?: Record<string, string>,
): Promise<{ code: number; output: string }> {
  try {
    const p = Bun.spawn(cmd, {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
    const [out, err, code] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    return { code, output: `${out}${err}` };
  } catch (error) {
    return { code: -1, output: String(error) };
  }
}

//? A release signed otherwise would lose the app's TCC grants and Keychain items (macOS) or its publisher (Windows).
//? An app signed ad hoc or not at all (a development build) still takes any release.
export async function signerRefusal(check: SignerCheck, staged: string, app: string): Promise<string | null> {
  if (check.mac) {
    const shown = await check.tool(["/usr/bin/codesign", "--display", "--verbose=2", app]);
    const team = shown.code === 0 ? /^TeamIdentifier=([A-Z0-9]{10})$/m.exec(shown.output)?.[1] : undefined;
    if (!team) return null;
    const requirement = `anchor apple generic and certificate leaf[subject.OU] = "${team}"`;
    const { code } = await check.tool(["/usr/bin/codesign", "--verify", `-R=${requirement}`, staged]);
    return code === 0 ? null : `the release is not signed by team ${team}, as this app is; publish it with --sign`;
  }
  if (!check.windows) return null;
  const { pins } = check;
  const { code, output } = await check.tool(
    [
      powershell(),
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(AUTHENTICODE, "utf16le").toString("base64"),
    ],
    {
      AKAN_NATIVE_INSTALLED_EXE: check.executableIn(app),
      AKAN_NATIVE_RELEASE_EXE: check.executableIn(staged),
      AKAN_NATIVE_SIGNERS: pins.join(","),
    },
  );
  const verdict = code === 0 ? /^akan-signer: (unsigned|same|other)\r?$/m.exec(output)?.[1] : undefined;
  if (verdict === "same" || (verdict === "unsigned" && !pins.length)) return null;
  if (verdict && pins.length)
    return "the release is not Authenticode-signed by a certificate of updates.windowsSigners; publish it with --sign";
  if (verdict) return "the release is not Authenticode-signed by the signer of this app; publish it with --sign";
  if (pins.length)
    return "PowerShell could not check the release's signer against updates.windowsSigners; install the release with its installer";
  //? No verdict (PowerShell blocked by AppLocker, SRP or WDAC, or a script it refused) does not make this app unsigned:
  //? only its PE header shows that. Any other app refuses, so a leaked update key alone cannot replace it.
  if (isUnsignedImage(check.executableIn(app))) return null;
  return "PowerShell could not check the release's signer against this app's; install the release with its installer";
}

export async function codesignProblem(check: SignerCheck, staged: string): Promise<string | null> {
  if (!check.mac) return null;
  const verified = await check.tool(["/usr/bin/codesign", "--verify", "--deep", "--strict", staged]);
  return verified.code === 0 ? null : `codesign failed: ${verified.output.trim()}`;
}
