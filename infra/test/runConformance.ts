import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

/**
 * Runs the database-mode conformance suites against the backends in `compose.yaml`.
 *
 *   bun run testConformance                   framework suites, oldest and newest backend versions
 *   bun run testConformance --libs            also the lib signal suites in multiple and cluster mode (newest only)
 *   bun run testConformance --row=latest      one version row only (`min` or `latest`)
 *   bun run testConformance --keep            leave the backends up and print the variables that reach them
 *
 * Exits non-zero when a framework suite fails, or when a lib suite fails a test in multiple or cluster mode that it
 * passes in single mode — the lib suites run in single mode first as the baseline, so a failure the checkout has in
 * every mode (a missing credential, an uninstalled package) does not count against a mode. A known defect is a passing
 * `test.failing`, so a red run is a regression or a fixed defect whose marker was not removed.
 */
class ConformanceRun {
  static readonly #root = path.resolve(import.meta.dir, "../..");
  static readonly #composeFile = path.join(import.meta.dir, "compose.yaml");
  static readonly rows = {
    min: { redis: "redis-min", postgres: "postgres-min" },
    latest: { redis: "redis", postgres: "postgres" },
  } as const;
  static readonly #frameworkSuites = [
    "conformance",
    "queryEvaluatorParity",
    "insightQuery",
    "server/di/predefinedAdaptor",
  ];
  static readonly #libs = (process.env.TEST_LIBS ?? "util,shared").split(",").filter(Boolean);

  readonly #keep: boolean;
  readonly #withLibs: boolean;
  readonly #rowNames: (keyof typeof ConformanceRun.rows)[];
  readonly #project: string;

  constructor(args: string[]) {
    this.#keep = args.includes("--keep");
    this.#withLibs = args.includes("--libs");
    const row = args.find((arg) => arg.startsWith("--row="))?.slice("--row=".length);
    if (row && !(row in ConformanceRun.rows)) throw new Error(`--row must be min or latest, not "${row}"`);
    this.#rowNames = row ? [row as keyof typeof ConformanceRun.rows] : ["min", "latest"];
    const owner = (process.env.BRANCH ?? "local").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    this.#project = this.#keep ? `akan-conformance-${owner}` : `akan-conformance-${owner}-${process.pid}`;
  }

  async run() {
    const results: { name: string; exitCode: number; gating: boolean; beyondSingle?: string[] }[] = [];
    await this.#compose(["up", "-d", "--wait"]);
    try {
      for (const rowName of this.#rowNames) {
        const env = await this.#envFor(rowName);
        results.push({
          name: `framework suites (${rowName})`,
          exitCode: await this.#spawn(
            ["bun", "test", "--isolate", ...ConformanceRun.#frameworkSuites],
            env,
            "pkgs/akanjs",
          ),
          gating: true,
        });
        if (!this.#withLibs || rowName !== "latest") continue;
        await this.#ensureCli();
        for (const lib of ConformanceRun.#libs) {
          const single = await this.#libSuite(lib, "single", env);
          results.push({ name: `${lib} signal suite (single)`, exitCode: single.exitCode, gating: false });
          for (const mode of ["multiple", "cluster"] as const) {
            const run = await this.#libSuite(lib, mode, env);
            const beyondSingle = [...run.failures].filter((name) => !single.failures.has(name));
            // A run that failed without naming a test (a crash, a suite that never loaded) cannot be compared.
            const unexplained = run.exitCode !== 0 && run.failures.size === 0;
            results.push({
              name: `${lib} signal suite (${mode})`,
              exitCode: beyondSingle.length || unexplained ? 1 : 0,
              gating: true,
              beyondSingle,
            });
          }
        }
      }
      if (this.#keep) this.#printEnv(await this.#envFor("latest"));
    } finally {
      if (!this.#keep) await this.#compose(["down", "-v"]);
    }
    for (const { name, exitCode, gating, beyondSingle = [] } of results) {
      console.info(`${exitCode === 0 ? "pass" : gating ? "FAIL" : "fail (reported)"}  ${name}`);
      for (const failure of beyondSingle) console.info(`      fails only here: ${failure}`);
    }
    return results.some(({ exitCode, gating }) => gating && exitCode !== 0) ? 1 : 0;
  }

  async #libSuite(lib: string, mode: "single" | "multiple" | "cluster", env: Record<string, string>) {
    const proc = Bun.spawn(["bun", "dist/pkgs/@akanjs/cli/index.js", "test", lib], {
      cwd: ConformanceRun.#root,
      env: { ...process.env, ...env, AKAN_TEST_DATABASE_MODE: mode },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err] = await Promise.all([
      ConformanceRun.#tee(proc.stdout, process.stdout),
      ConformanceRun.#tee(proc.stderr, process.stderr),
    ]);
    const exitCode = await proc.exited;
    await rm(path.join(ConformanceRun.#root, "libs", lib, "local"), { recursive: true, force: true });
    const text = Bun.stripANSI(`${out}\n${err}`);
    const failures = new Set([...text.matchAll(/^\(fail\) (.+?) \[[^\]]+\]$/gm)].map((match) => match[1] as string));
    return { exitCode, failures };
  }

  static async #tee(stream: ReadableStream<Uint8Array>, sink: NodeJS.WriteStream) {
    const decoder = new TextDecoder();
    let text = "";
    for await (const chunk of stream) {
      sink.write(chunk);
      text += decoder.decode(chunk, { stream: true });
    }
    return text;
  }

  async #envFor(rowName: keyof typeof ConformanceRun.rows) {
    const row = ConformanceRun.rows[rowName];
    return {
      AKAN_TEST_REDIS_URL: `redis://localhost:${await this.#port(row.redis, 6379)}`,
      AKAN_TEST_POSTGRES_URL: `postgres://akan:akan@localhost:${await this.#port(row.postgres, 5432)}/akan`,
      AKAN_TEST_LIBSQL_URL: `http://localhost:${await this.#port("libsql", 8080)}`,
    };
  }

  async #port(service: string, containerPort: number) {
    const proc = Bun.spawn(
      [
        "docker",
        "compose",
        "-p",
        this.#project,
        "-f",
        ConformanceRun.#composeFile,
        "port",
        service,
        String(containerPort),
      ],
      { stdout: "pipe", stderr: "inherit" },
    );
    const output = (await new Response(proc.stdout).text()).trim();
    if ((await proc.exited) !== 0 || !output) throw new Error(`no published port for ${service}:${containerPort}`);
    return output.slice(output.lastIndexOf(":") + 1);
  }

  async #compose(args: string[]) {
    const exitCode = await this.#spawn(
      ["docker", "compose", "-p", this.#project, "-f", ConformanceRun.#composeFile, ...args],
      {},
    );
    if (exitCode !== 0) throw new Error(`docker compose ${args.join(" ")} exited with ${exitCode}`);
  }

  async #ensureCli() {
    if (existsSync(path.join(ConformanceRun.#root, "dist/pkgs/@akanjs/cli/index.js"))) return;
    if ((await this.#spawn(["bun", "run", "buildAkan"], {})) !== 0) throw new Error("bun run buildAkan failed");
  }

  async #spawn(command: string[], env: Record<string, string>, cwd = "") {
    const proc = Bun.spawn(command, {
      cwd: path.join(ConformanceRun.#root, cwd),
      env: { ...process.env, ...env },
      stdout: "inherit",
      stderr: "inherit",
    });
    return await proc.exited;
  }

  #printEnv(env: Record<string, string>) {
    console.info("\nBackends left running. To run a suite against them:");
    for (const [key, value] of Object.entries(env)) console.info(`  export ${key}=${value}`);
    console.info(`Stop them with: docker compose -p ${this.#project} -f infra/test/compose.yaml down -v\n`);
  }
}

process.exit(await new ConformanceRun(process.argv.slice(2)).run());
