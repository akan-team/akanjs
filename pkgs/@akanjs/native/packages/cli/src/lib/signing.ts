// A stable local code-signing identity for macOS dev builds (Q8 follow-up): `akan-native signing setup`.
//
// Ad-hoc signatures change with every build, and macOS keys everything it remembers about an app to
// the signature's designated requirement: TCC grants (camera, notifications) and Keychain item
// ACLs. Ad-hoc builds have `cdhash H"…"` as their requirement, so every rebuild is a new app.
// Signed with one self-signed certificate, the requirement becomes
// `identifier "<app id>" and certificate leaf = H"<sha1>"` and stays the same across builds.
// This is not Developer ID signing: Gatekeeper still rejects such apps on other Macs (CLI-9).
//
// Steps (all system tools): LibreSSL makes the key and a certificate with the codeSigning EKU,
// `security import -T /usr/bin/codesign` puts the identity in the login keychain (codesign may use
// the key without asking), and `security add-trusted-cert -p codeSign` trusts it for code signing
// (without that codesign reports "no identity found", verified; macOS asks for the login password).

import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { exec, execOrThrow } from "./exec.ts";
import { CliError } from "./log.ts";
import { akanNativeHome } from "./toolchains.ts";

export interface SigningIdentity {
  /** SHA-1 of the certificate, what `codesign --sign` takes. */
  hash: string;
  name: string;
}

const LOGIN_KEYCHAIN = join(userInfo().homedir, "Library", "Keychains", "login.keychain-db");
export const identityName = () => `akan-native dev: ${userInfo().username}`;
const recordPath = (env = process.env) => join(akanNativeHome(env), "signing.json");

/** Valid (trusted) code-signing identities in the keychains, or in `keychain` only. */
export async function validIdentities(keychain?: string): Promise<SigningIdentity[]> {
  const args = ["/usr/bin/security", "find-identity", "-v", "-p", "codesigning", ...(keychain ? [keychain] : [])];
  const out = (await exec(args, { echo: false })).stdout;
  return [...out.matchAll(/\d+\) ([0-9A-F]{40}) "([^"]+)"/g)].map((m) => ({ hash: m[1]!, name: m[2]! }));
}

/** The identity `akan-native signing setup` made, if it is still valid; null means ad-hoc signing. */
export async function devIdentity(env = process.env): Promise<SigningIdentity | null> {
  if (env.AKAN_NATIVE_SIGNING === "adhoc" || !existsSync(recordPath(env))) return null;
  const record = JSON.parse(readFileSync(recordPath(env), "utf8")) as SigningIdentity;
  return (await validIdentities()).find((i) => i.hash === record.hash) ?? null;
}

export async function setupSigning(): Promise<{ identity: SigningIdentity; created: boolean }> {
  if (process.platform !== "darwin") throw new CliError("akan-native signing setup is for macOS");
  const name = identityName();
  const existing = (await validIdentities()).find((i) => i.name === name);
  if (existing) {
    writeFileSync(recordPath(), `${JSON.stringify(existing, null, 2)}\n`);
    return { identity: existing, created: false };
  }
  const dir = mkdtempSync(join(tmpdir(), "akan-native-signing-"));
  try {
    const cnf = join(dir, "cert.cnf");
    writeFileSync(
      cnf,
      `[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = ${name}
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
`,
    );
    const key = join(dir, "key.pem");
    const cert = join(dir, "cert.pem");
    const p12 = join(dir, "identity.p12");
    const pass = randomBytes(16).toString("hex");
    await execOrThrow(
      [
        "/usr/bin/openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        key,
        "-out",
        cert,
        "-days",
        "3650",
        "-config",
        cnf,
      ],
      { echo: false },
    );
    await execOrThrow(
      [
        "/usr/bin/openssl",
        "pkcs12",
        "-export",
        "-inkey",
        key,
        "-in",
        cert,
        "-out",
        p12,
        "-passout",
        `pass:${pass}`,
        "-name",
        name,
      ],
      { echo: false },
    );
    await execOrThrow(
      ["/usr/bin/security", "import", p12, "-k", LOGIN_KEYCHAIN, "-P", pass, "-T", "/usr/bin/codesign"],
      { echo: false },
    );
    // Shows macOS's authorization dialog (login password) for the user's trust settings.
    await execOrThrow(
      ["/usr/bin/security", "add-trusted-cert", "-r", "trustRoot", "-p", "codeSign", "-k", LOGIN_KEYCHAIN, cert],
      { echo: false, inherit: true },
    );
    const identity = (await validIdentities()).find((i) => i.name === name);
    if (!identity)
      throw new CliError(`the certificate "${name}" was imported but is not a valid code-signing identity`);
    writeFileSync(recordPath(), `${JSON.stringify(identity, null, 2)}\n`);
    return { identity, created: true };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
