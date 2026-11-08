import { createHash } from "node:crypto";
import type { App } from "../commandDecorators";
import { WorkspaceExecutor } from "../executors";
import { CsrArtifactBuilder } from "../frontendBuild/csrArtifactBuilder";

export type PublicEnv = Record<string, string>;

//* The `AKAN_PUBLIC_*` a native web build inlines: an update has to repeat them, because the API host and the env an
//* installed binary talks to live there and nowhere else. Keys akan.config.ts derives are left out, as Akan Cloud does.
export class NativePublicEnv {
  static readonly derivedKeys = [
    "AKAN_PUBLIC_APP_NAME",
    "AKAN_PUBLIC_BASE_PATHS",
    "AKAN_PUBLIC_API_PREFIX",
    "AKAN_PUBLIC_WS_PREFIX",
    "AKAN_PUBLIC_RENDER_ENV",
    "AKAN_PUBLIC_DEFAULT_LOCALE",
    "AKAN_PUBLIC_LOCALES",
    "AKAN_PUBLIC_LOCALE_PREFIX",
  ];
  //? Akan Cloud's own limits on a recorded env: a build it would refuse fails here, before anything is signed.
  static readonly #keyPattern = /^AKAN_PUBLIC_[A-Z0-9_]{1,128}$/;
  static readonly #secretWords = ["SECRET", "TOKEN", "PASSWORD", "PRIVATE", "CREDENTIAL"];
  static readonly #maxKeys = 256;
  static readonly #maxBytes = 64 * 1024;

  static of(env: Record<string, unknown>): PublicEnv {
    return Object.fromEntries(
      Object.keys(env)
        .filter((key) => key.startsWith("AKAN_PUBLIC_") && !NativePublicEnv.derivedKeys.includes(key))
        .sort()
        .map((key) => [key, String(env[key])]),
    );
  }

  static hash(publicEnv: PublicEnv) {
    return createHash("sha256")
      .update(JSON.stringify(NativePublicEnv.of(publicEnv)))
      .digest("hex");
  }

  static problems(publicEnv: Record<string, unknown>) {
    const keys = Object.keys(publicEnv);
    const problems = keys.flatMap((key) => {
      const value = publicEnv[key];
      if (!NativePublicEnv.#keyPattern.test(key)) return [`${key} is not an AKAN_PUBLIC_[A-Z0-9_] name`];
      const word = NativePublicEnv.#secretWords.find((secret) => key.includes(secret));
      if (word) return [`${key} names a ${word.toLowerCase()}, which a page bundle must not carry`];
      if (typeof value !== "string") return [`${key} is not a string`];
      // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
      if (/[\u0000-\u001f\u007f]/.test(value)) return [`${key} holds a control character`];
      return [];
    });
    if (keys.length > NativePublicEnv.#maxKeys)
      problems.push(`${keys.length} keys, more than ${NativePublicEnv.#maxKeys}`);
    const bytes = Buffer.byteLength(JSON.stringify(publicEnv));
    if (bytes > NativePublicEnv.#maxBytes) problems.push(`${bytes} bytes, more than ${NativePublicEnv.#maxBytes}`);
    return problems;
  }

  /** The keys whose values differ, or that only one side has. */
  static diff(a: PublicEnv, b: PublicEnv) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((key) => a[key] !== b[key])
      .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  }

  /** What the app's last `akan build` inlined, or null when it built no CSR bundle. */
  static async built(app: App): Promise<PublicEnv | null> {
    const file = Bun.file(CsrArtifactBuilder.publicEnvPath(app));
    if (!(await file.exists())) return null;
    return NativePublicEnv.of((await file.json()) as Record<string, unknown>);
  }

  /** A bundle.json's record, or null when it has none (a build from before the record, or no file at all). */
  static async recordedIn(bundleFile: string): Promise<PublicEnv | null> {
    const file = Bun.file(bundleFile);
    if (!(await file.exists())) return null;
    const bundle = (await file.json()) as { web?: { publicEnv?: PublicEnv } };
    return bundle.web?.publicEnv ?? null;
  }

  /** `--public-env`: a JSON map of the values, or the bundle.json of the store build that recorded them. */
  static async load(file: string): Promise<PublicEnv> {
    const source = Bun.file(file);
    if (!(await source.exists())) throw new Error(`--public-env ${file} does not exist.`);
    const json = (await source.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || typeof json !== "object" || Array.isArray(json))
      throw new Error(`--public-env ${file} is not a JSON object of AKAN_PUBLIC_* values or a bundle.json.`);
    const isBundle = json.schema === 1 && typeof json.web === "object";
    const map = isBundle ? (json.web as { publicEnv?: Record<string, unknown> }).publicEnv : json;
    if (!map) throw new Error(`--public-env ${file} is a bundle.json from a build that recorded no public env.`);
    const derived = Object.keys(map).filter((key) => NativePublicEnv.derivedKeys.includes(key));
    if (derived.length)
      throw new Error(`--public-env ${file} sets ${derived.join(", ")}, which akan.config.ts decides.`);
    const problems = NativePublicEnv.problems(map);
    if (problems.length) throw new Error(`--public-env ${file} is refused:\n- ${problems.join("\n- ")}`);
    return NativePublicEnv.of(map);
  }

  //* Exactly these values and the ones akan.config.ts derives: the shell's and `.env`'s other AKAN_PUBLIC_* are dropped.
  static pin(publicEnv: PublicEnv) {
    for (const key of Object.keys(process.env))
      if (key.startsWith("AKAN_PUBLIC_") && !NativePublicEnv.derivedKeys.includes(key)) delete process.env[key];
    Object.assign(process.env, publicEnv);
    WorkspaceExecutor.publicEnvPin = publicEnv;
  }

  /** Why a pack's bundle cannot ship to the store build `shipped`, as far as the public env goes. */
  static async problemAgainst(shipped: string, bundle: string) {
    const [before, now] = await Promise.all([NativePublicEnv.recordedIn(shipped), NativePublicEnv.recordedIn(bundle)]);
    if (!before) return null;
    const differs = NativePublicEnv.diff(before, now ?? {});
    if (!differs.length) return null;
    return `public env ${differs.join(", ")} differs from the store build's (pass --public-env ${shipped} to repeat it)`;
  }
}
