import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { Logger, toError } from "akanjs/common";

export interface ServerEnvProfileProps {
  envDir: string;
  environment: string;
  profile: string;
}

export interface ServerEnvSource {
  loader: "ts" | "js";
  contents: string;
}

export interface LibEnvSource extends ServerEnvSource {
  profileFile: boolean;
  stripped: string[];
}

type EnvLoad = (envFile: string) => Promise<ServerEnvSource>;

interface Stripped {
  value: unknown;
  stripped: string[];
}

interface EnvFold<T> {
  text(value: string, at: string, underSecret: boolean): T;
  other(value: unknown): T;
  node(value: object, children: (readonly [string, T])[]): T;
}

type EvaluatedMessage = { load: string } | { env: string; lossy: string[] } | { failure: string };

//* A server env profile is bundled in place of the environment's own file, for a server that runs where its bundle
//* can be read: the computers a desktop app is installed on. So it may hold no secret.
export class ServerEnvProfile {
  static readonly namePattern = /^[a-z][a-zA-Z0-9-]*$/;
  static readonly envFilePattern = /[\\/]env[\\/]env\.server\.[A-Za-z0-9-]+\.ts$/;

  static fileName(environment: string, profile: string) {
    return `env.server.${environment}.${profile}.ts`;
  }

  static profileFileOf(file: string, profile: string) {
    return file.replace(/\.ts$/, `.${profile}.ts`);
  }

  static #url(value: string) {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return null;
    try {
      return new URL(value);
    } catch {
      return null;
    }
  }

  static #carriesCredential(url: URL) {
    return !!url.password || [...url.searchParams.keys()].some((name) => Logger.isSecretKey(name));
  }

  static #isCredentialUrl(value: string) {
    const url = ServerEnvProfile.#url(value);
    return !!url && ServerEnvProfile.#carriesCredential(url);
  }

  static #isSecret(value: string, underSecret: boolean) {
    return (underSecret && !!value.trim()) || ServerEnvProfile.#isCredentialUrl(value);
  }

  //* The one walk over an env value: each string with its path, and whether a secret-named key holds it at any depth.
  static #fold<T>(value: unknown, fold: EnvFold<T>, at = "", underSecret = false): T {
    if (typeof value === "string") return fold.text(value, at, underSecret);
    if (!value || typeof value !== "object") return fold.other(value);
    return fold.node(
      value,
      Object.entries(value).map(
        ([key, child]) =>
          [
            key,
            ServerEnvProfile.#fold(child, fold, at ? `${at}.${key}` : key, underSecret || Logger.isSecretKey(key)),
          ] as const,
      ),
    );
  }

  static #collect<T>(text: EnvFold<T[]>["text"]): EnvFold<T[]> {
    return { text, other: () => [], node: (_, children) => children.flatMap(([, found]) => found) };
  }

  static strip(value: unknown): Stripped {
    return ServerEnvProfile.#fold<Stripped>(value, {
      text: (text, at, underSecret) =>
        ServerEnvProfile.#isSecret(text, underSecret)
          ? { value: undefined, stripped: [at] }
          : { value: text, stripped: [] },
      other: (other) => ({ value: other, stripped: [] }),
      node: (node, children) => {
        const stripped = children.flatMap(([, result]) => result.stripped);
        //? An array leaves out a stripped element whole, so neither a `null` nor an emptied `{}` takes its place.
        if (Array.isArray(node))
          return {
            value: children.flatMap(([, result]) =>
              result.value === undefined ||
              (result.stripped.length && typeof result.value === "object" && !Object.keys(result.value ?? {}).length)
                ? []
                : [result.value],
            ),
            stripped,
          };
        return {
          value: Object.fromEntries(
            children.flatMap(([key, result]) => (result.value === undefined ? [] : [[key, result.value]])),
          ),
          stripped,
        };
      },
    });
  }

  //* The values to look for in a bundle: each under a secret-named key, and each long one in a block that is a
  //* credential whole — but not a lowercase constant there (`service_account`), nor a URL holding no credential
  //* (a token endpoint), which library code holds as well. A webhook's URL is a credential whole.
  static secretValues(value: unknown): { path: string; value: string }[] {
    return ServerEnvProfile.#fold(
      value,
      ServerEnvProfile.#collect((text, at, underSecret) => {
        const url = ServerEnvProfile.#url(text);
        if (url)
          return ServerEnvProfile.#carriesCredential(url) ||
            (underSecret && (/webhook/i.test(at) || ServerEnvProfile.distinctive(text)))
            ? [...new Set([text, url.password])]
                .filter((part) => part.length >= 8)
                .map((part) => ({ path: at, value: part }))
            : [];
        const named = Logger.isSecretKey(at.split(".").at(-1) ?? "");
        return underSecret && text.length >= 8 && (named || ServerEnvProfile.distinctive(text))
          ? [{ path: at, value: text }]
          : [];
      }),
    );
  }

  static distinctive(value: string): boolean {
    const url = ServerEnvProfile.#url(value);
    if (url)
      return (
        ServerEnvProfile.#carriesCredential(url) ||
        [...url.pathname.split("/"), ...url.searchParams.values()].some((part) => ServerEnvProfile.distinctive(part))
      );
    return value.length >= 16 && !/^https?:\/\//.test(value) && !/^[a-z]+(?:[._-][a-z]+)*$/.test(value);
  }

  static secretPaths(value: unknown): string[] {
    return ServerEnvProfile.#fold(
      value,
      ServerEnvProfile.#collect((text, at, underSecret) => (ServerEnvProfile.#isSecret(text, underSecret) ? [at] : [])),
    );
  }

  //* Evaluated in a child with no app env, so `process.env.X ?? "fallback"` reads as the fallback the bundle carries.
  //* The result comes back over IPC, as an import may write to stdout; `load` answers for each env file it reaches.
  static async evaluate(file: string, cwd: string, load?: EnvLoad): Promise<unknown> {
    return (await ServerEnvProfile.#evaluated(file, cwd, load)).value;
  }

  //? Bun prints a failing module's source line with its error, so stderr is never read: the child sends the error's
  //? name and place, and its message without JSC's `(evaluating '…')` or any string literal of the files at fault.
  static async #evaluated(file: string, cwd: string, load?: EnvLoad): Promise<{ value: unknown; lossy: string[] }> {
    const pattern = (regex: RegExp, flags = "") => `new RegExp(${JSON.stringify(regex.source)}, "${flags}")`;
    const literal = /(["'`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/;
    const frame = /^\s*at (?:[^(]*\()?(.+):(\d+):(\d+)\)?\s*$/;
    const script = [
      "const waiting = new Map();",
      'process.on("message", ({ load, error, loader, contents }) => {',
      "  const reply = waiting.get(load);",
      "  waiting.delete(load);",
      "  if (error === undefined) reply?.resolve({ loader, contents });",
      "  else reply?.reject(new Error(error));",
      "});",
      "if (process.env.AKAN_PROFILE_ENV_LOAD)",
      "  Bun.plugin({",
      '    name: "akan-server-env",',
      "    setup(build) {",
      "      build.onLoad({ filter: new RegExp(process.env.AKAN_PROFILE_ENV_LOAD) }, (args) =>",
      "        new Promise((resolve, reject) => {",
      "          waiting.set(args.path, { resolve, reject });",
      "          process.send({ load: args.path });",
      "        }));",
      "    },",
      "  });",
      `const literal = ${pattern(literal, "g")};`,
      `const interpolation = ${pattern(/\$\{[^}]*\}/)};`,
      `const frameOf = ${pattern(frame)};`,
      `const evaluating = ${pattern(/\s*\(evaluating '[\s\S]*'\)\s*$/)};`,
      "const literalsOf = async (file) =>",
      '  [...(await Bun.file(file).text().catch(() => "")).matchAll(literal)].flatMap((match) => match[2].split(interpolation));',
      "const describe = async (error) => {",
      "  const first = Array.isArray(error?.errors) && error.errors.length ? error.errors[0] : error;",
      '  const frame = String(first?.stack ?? "").split("\\n").map((line) => frameOf.exec(line)).find(Boolean);',
      "  const at = first?.position?.file ? [first.position.file, first.position.line, first.position.column] : frame ? frame.slice(1, 4) : [];",
      "  const files = [process.env.AKAN_PROFILE_ENV_FILE, at[0]].filter(Boolean);",
      "  const literals = (await Promise.all(files.map(literalsOf))).flat().filter((part) => part.length >= 4);",
      '  let message = String(first?.message ?? first).replace(evaluating, "");',
      "  for (const part of literals.sort((a, b) => b.length - a.length))",
      '    message = message.split(part).join("[redacted]");',
      '  const name = typeof first?.name === "string" && /^[A-Za-z]+$/.test(first.name) ? first.name : "Error";',
      '  return name + ": " + message.slice(0, 200) + (at.length ? " (at " + at.join(":") + ")" : "");',
      "};",
      "try {",
      "  const { env } = await import(process.env.AKAN_PROFILE_ENV_FILE);",
      "  const lossy = [];",
      "  const walk = (value, at) => {",
      '    if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint" || (typeof value === "number" && !Number.isFinite(value))) return lossy.push(at);',
      '    if (!value || typeof value !== "object") return;',
      "    const proto = Object.getPrototypeOf(value);",
      "    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return lossy.push(at);",
      '    for (const [key, child] of Object.entries(value)) walk(child, at ? at + "." + key : key);',
      "  };",
      '  walk(env, "");',
      '  const plain = (_, value) => (typeof value === "function" || typeof value === "symbol" ? undefined : typeof value === "bigint" ? String(value) : value);',
      '  process.send({ env: JSON.stringify(env ?? null, plain) ?? "null", lossy }, undefined, undefined, () => process.disconnect());',
      "} catch (error) {",
      "  process.exitCode = 1;",
      "  process.send({ failure: await describe(error) }, undefined, undefined, () => process.disconnect());",
      "}",
    ].join("\n");
    let sent: { env: string; lossy: string[] } | undefined;
    let failure: string | undefined;
    let loadError: unknown;
    const child = Bun.spawn([process.execPath, "--eval", script], {
      cwd,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        AKAN_PROFILE_ENV_FILE: file,
        ...(load ? { AKAN_PROFILE_ENV_LOAD: ServerEnvProfile.envFilePattern.source } : {}),
      },
      stdout: "ignore",
      stderr: "ignore",
      serialization: "json",
      ipc: (message: EvaluatedMessage, subprocess) => {
        if ("env" in message) {
          sent = message;
          return;
        }
        if ("failure" in message) {
          failure = message.failure;
          return;
        }
        if (!load) return;
        const requested = message.load;
        void load(requested)
          .then(
            ({ loader, contents }) => ({ load: requested, loader, contents }),
            (error: unknown) => {
              loadError ??= error;
              return { load: requested, error: toError(error).message };
            },
          )
          .then((reply) => subprocess.send(reply))
          //? The child is gone, and its exit says why.
          .catch(() => undefined);
      },
    });
    const exitCode = await child.exited;
    if (exitCode !== 0 || !sent) {
      if (loadError) throw loadError;
      throw new Error(
        `${path.basename(file)} could not be evaluated to check it for secrets: ${failure ?? `its process exited with code ${exitCode} and sent nothing`}`,
      );
    }
    return { value: JSON.parse(sent.env) as unknown, lossy: sent.lossy };
  }

  //? A profile is served under the path of the file it replaces, so its import of that file would import itself.
  static async sourceInPlaceOf(profileFile: string, replacedFile: string, profile: string) {
    const contents = await Bun.file(profileFile).text();
    const dir = path.dirname(profileFile);
    const replaced = ServerEnvProfile.#real(replacedFile);
    const selfImports = new Bun.Transpiler({ loader: "ts" }).scanImports(contents).flatMap(({ path: specifier }) => {
      try {
        return ServerEnvProfile.#real(Bun.resolveSync(specifier, dir)) === replaced ? [specifier] : [];
      } catch {
        //? An import that resolves nowhere fails the build on its own.
        return [];
      }
    });
    if (selfImports.length)
      throw new Error(
        `${path.basename(profileFile)} imports ${selfImports.join(", ")}, the file a "${profile}" build bundles it in place of, so it would import itself. Write the values it needs into it instead.`,
      );
    return contents;
  }

  static #real(file: string) {
    return existsSync(file) ? realpathSync.native(file) : path.resolve(file);
  }

  //* A lib's `server.ts` hands its `env.server.testing.ts` to the server as defaults, so a profile swaps those as it
  //* swaps the app's: for the lib's `env.server.<name>.<profile>.ts`, else for the defaults without a secret in them.
  static async libEnvSource(file: string, profile: string, chain: string[] = []): Promise<LibEnvSource> {
    if (chain.includes(file))
      throw new Error(
        `${[...chain, file].join(" -> ")}: lib env files reach each other, which a "${profile}" build cannot swap.`,
      );
    const profileFile = ServerEnvProfile.profileFileOf(file, profile);
    const libRoot = path.dirname(path.dirname(file));
    if (await Bun.file(profileFile).exists()) {
      const contents = await ServerEnvProfile.sourceInPlaceOf(profileFile, file, profile);
      const reached = [...chain, file];
      const value = await ServerEnvProfile.evaluate(profileFile, libRoot, (envFile) =>
        ServerEnvProfile.#underProfile(envFile, profile, new Set(), reached),
      );
      const secrets = ServerEnvProfile.secretPaths(value);
      if (secrets.length)
        throw new Error(
          `${profileFile} holds secret-named values, which the "${profile}" bundle carries to every computer it runs on: ${secrets.join(", ")}.`,
        );
      return { loader: "ts", contents, profileFile: true, stripped: [] };
    }
    const { exports } = new Bun.Transpiler({ loader: "ts" }).scan(await Bun.file(file).text());
    if (exports.some((name) => name !== "env"))
      throw new Error(
        `${file} exports ${exports.join(", ")}: a "${profile}" build carries only a lib env's \`env\`, so give the lib ${path.basename(profileFile)}.`,
      );
    const evaluated = await ServerEnvProfile.#evaluated(file, libRoot);
    if (evaluated.lossy.length)
      throw new Error(
        `${file} holds ${evaluated.lossy.join(", ")}, which a "${profile}" build cannot carry: it bundles a lib env's defaults as JSON, which keeps no function, Map, Set, Date or class instance. Give the lib ${path.basename(profileFile)}.`,
      );
    const { value, stripped } = ServerEnvProfile.strip(evaluated.value);
    return {
      loader: "js",
      contents: `export const env = ${JSON.stringify(value ?? {})};\n`,
      profileFile: false,
      stripped,
    };
  }

  static async #underProfile(
    envFile: string,
    profile: string,
    appEnvDirs: ReadonlySet<string>,
    chain: string[],
  ): Promise<ServerEnvSource> {
    const name = path.basename(envFile, ".ts").slice("env.server.".length);
    if (appEnvDirs.has(path.dirname(envFile)) || name === "type" || name === "example")
      return { loader: "ts", contents: await Bun.file(envFile).text() };
    const { loader, contents } = await ServerEnvProfile.libEnvSource(envFile, profile, chain);
    return { loader, contents };
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
    await ServerEnvProfile.sourceInPlaceOf(file, path.join(envDir, `env.server.${environment}.ts`), profile);
    //? Evaluated as the bundle carries it: the lib env defaults it reaches swapped, as the build's plugin swaps them.
    const appEnvDirs = new Set([path.resolve(envDir), realpathSync.native(envDir)]);
    const value = await ServerEnvProfile.evaluate(file, path.dirname(envDir), (envFile) =>
      ServerEnvProfile.#underProfile(envFile, profile, appEnvDirs, []),
    );
    const secrets = ServerEnvProfile.secretPaths(value);
    if (secrets.length)
      throw new Error(
        `env/${name} holds secret-named values, which a profile's bundle carries to every computer it runs on: ${secrets.join(", ")}. Leave them out, or read them from the process env of the server that needs them.`,
      );
  }
}
