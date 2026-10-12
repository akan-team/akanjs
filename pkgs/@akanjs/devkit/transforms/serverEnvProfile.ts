import path from "node:path";

export interface ServerEnvProfileProps {
  envDir: string;
  environment: string;
  profile: string;
}

//* The logger's redaction pattern plus what a config carries as a credential under another name: a webhook URL, a
//* cloud access key, a mailer's `pass`, an HMAC key, a registry's `regcred`, and blocks that are credentials whole —
//* `iapVerify` (its `apple` is the App Store shared secret) and a service account.
const secretKey =
  /password|passwd|passphrase|^pass$|token|jwt|authorization|cookie|secret|api[-_]?key|private[-_]?key|access[-_]?key|auth[-_]?key|hash[-_]?key|webhook|cred|iap[-_]?verify|service[-_]?account/i;

//* A server env profile is bundled in place of the environment's own file, for a server that runs where its bundle
//* can be read: the computers a desktop app is installed on. So it may hold no secret.
export class ServerEnvProfile {
  static readonly namePattern = /^[a-z][a-zA-Z0-9-]*$/;

  static fileName(environment: string, profile: string) {
    return `env.server.${environment}.${profile}.ts`;
  }

  /** `env.server.<name>.ts` → `env.server.<name>.<profile>.ts`, the file a profile build bundles in its place. */
  static profileFileOf(file: string, profile: string) {
    return file.replace(/\.ts$/, `.${profile}.ts`);
  }

  /** The value with every string `secretPaths` names left out, and those paths. */
  static strip(value: unknown, at = "", underSecret = false): { value: unknown; stripped: string[] } {
    if (typeof value === "string")
      return underSecret && value.trim() ? { value: undefined, stripped: [at] } : { value, stripped: [] };
    if (!value || typeof value !== "object") return { value, stripped: [] };
    const stripped: string[] = [];
    const strip = (key: string, child: unknown) => {
      const result = ServerEnvProfile.strip(child, at ? `${at}.${key}` : key, underSecret || secretKey.test(key));
      stripped.push(...result.stripped);
      return result.value;
    };
    if (Array.isArray(value)) return { value: value.map((child, idx) => strip(String(idx), child)), stripped };
    const kept = Object.fromEntries(
      Object.entries(value)
        .map(([key, child]) => [key, strip(key, child)] as const)
        .filter(([, child]) => child !== undefined),
    );
    return { value: kept, stripped };
  }

  /**
   * The values to look for in a bundle: each under a secret-named key, and each long one in a block that is a
   * credential whole — not a URL or a lowercase constant there (`service_account`), which library code holds as well.
   */
  static secretValues(value: unknown, at = "", underSecret = false): { path: string; value: string }[] {
    if (typeof value === "string") {
      const named = secretKey.test(at.split(".").at(-1) ?? "");
      const distinct = value.length >= 16 && !/^https?:\/\//.test(value) && !/^[a-z]+(?:[._-][a-z]+)*$/.test(value);
      return underSecret && value.length >= 8 && (named || distinct) ? [{ path: at, value }] : [];
    }
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) =>
      ServerEnvProfile.secretValues(child, at ? `${at}.${key}` : key, underSecret || secretKey.test(key)),
    );
  }

  /** Every secret-named key holding a non-empty string, or one beneath it, as a dotted path. */
  static secretPaths(value: unknown, at = "", underSecret = false): string[] {
    if (typeof value === "string") return underSecret && value.trim() ? [at] : [];
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) =>
      ServerEnvProfile.secretPaths(child, at ? `${at}.${key}` : key, underSecret || secretKey.test(key)),
    );
  }

  //* Evaluated in a child with no app env, so `process.env.X ?? "fallback"` reads as the fallback the bundle carries.
  static async evaluate(file: string, cwd: string): Promise<unknown> {
    const script = [
      "const { env } = await import(process.env.AKAN_PROFILE_ENV_FILE);",
      'const plain = (_, value) => (typeof value === "function" || typeof value === "symbol" ? undefined : typeof value === "bigint" ? String(value) : value);',
      "process.stdout.write(JSON.stringify(env ?? null, plain));",
    ].join("\n");
    const child = Bun.spawn([process.execPath, "--eval", script], {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", AKAN_PROFILE_ENV_FILE: file },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (exitCode !== 0)
      throw new Error(`${path.basename(file)} could not be evaluated to check it for secrets:\n${stderr.trim()}`);
    return JSON.parse(stdout || "null") as unknown;
  }

  static async assertShippable({ envDir, environment, profile }: ServerEnvProfileProps) {
    if (!ServerEnvProfile.namePattern.test(profile))
      throw new Error(
        `The server env profile "${profile}" must be a lowercase-first name of letters, digits and dashes.`,
      );
    const name = ServerEnvProfile.fileName(environment, profile);
    const file = path.join(envDir, name);
    if (!(await Bun.file(file).exists()))
      throw new Error(
        `The server env profile "${profile}" bundles env/${name} in place of env/env.server.${environment}.ts, and there is no such file.`,
      );
    const secrets = ServerEnvProfile.secretPaths(await ServerEnvProfile.evaluate(file, path.dirname(envDir)));
    if (secrets.length)
      throw new Error(
        `env/${name} holds secret-named values, which a profile's bundle carries to every computer it runs on: ${secrets.join(", ")}. Leave them out, or read them from the process env of the server that needs them.`,
      );
  }
}
