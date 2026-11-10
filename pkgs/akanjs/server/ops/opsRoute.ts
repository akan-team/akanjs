import { AkanError } from "akanjs/base";
import { Logger } from "akanjs/common";
import { getEnv } from "../../base/baseEnv";
import { Ed25519Key } from "../ed25519Key";
import { MachineToken } from "../machine/machineToken";
import { SelfExec } from "../selfExec";
import type { AppDetailInfo } from "./appInfo";
import { FailureLimiter } from "./failureLimiter";
import { MigrateJobs, type MigrateProcessOutput } from "./migrateJobs";
import { type OpsTokenClaims, OpsTokenVerifier } from "./opsToken";
import { type SnapshotJobRequest, SnapshotJobs } from "./snapshotJobs";
import type { SnapshotSources } from "./snapshotTypes";
import { SqliteFiles } from "./sqliteFiles";
import { type SnapshotCapture, SqliteSnapshot } from "./sqliteSnapshot";

export interface OpsRouteOptions {
  verifier: OpsTokenVerifier;
  detail: () => AppDetailInfo;
  jobs: SnapshotJobs;
  migrateJobs: MigrateJobs;
  rateLimitPerMinute?: number;
  failuresPerMinute?: number;
}

export interface OpsRouteEnvOptions {
  detail: () => AppDetailInfo;
  sources?: () => SnapshotSources;
}

// Security: deliberately not a signal, so nothing here reaches MCP or the in-page agent.
export class OpsRoute {
  static readonly prefix = "/_akan/ops/";
  static readonly loggedRefusalsPerMinute = 10;

  readonly #logger = new Logger("OpsRoute");
  readonly #verifier: OpsTokenVerifier;
  readonly #detail: () => AppDetailInfo;
  readonly #jobs: SnapshotJobs;
  readonly #migrateJobs: MigrateJobs;
  readonly #rateLimit: number;
  readonly #failures: FailureLimiter;
  #window: number[] = [];
  #refusalWindowAt = 0;
  #refusalCount = 0;

  constructor({
    verifier,
    detail,
    jobs,
    migrateJobs,
    rateLimitPerMinute = 30,
    failuresPerMinute = 10,
  }: OpsRouteOptions) {
    this.#verifier = verifier;
    this.#detail = detail;
    this.#jobs = jobs;
    this.#migrateJobs = migrateJobs;
    this.#rateLimit = rateLimitPerMinute;
    this.#failures = new FailureLimiter({ limit: failuresPerMinute });
  }

  static fromEnv({ detail, sources = SqliteFiles.fromEnv }: OpsRouteEnvOptions): OpsRoute | null {
    const publicKey = process.env.AKAN_OPS_PUBLIC_KEY?.trim();
    if (!publicKey) return null;
    const { appName, environment } = getEnv();
    const logger = new Logger("OpsRoute");
    let verifier: OpsTokenVerifier;
    try {
      const key = OpsTokenVerifier.parsePublicKey(publicKey);
      //* A shared key would let whoever holds the machine signing key mint ops tokens as well.
      const machineKey = OpsRoute.#machinePublicKey();
      if (machineKey && Ed25519Key.rawPublic(machineKey) === Ed25519Key.rawPublic(key))
        throw new AkanError(
          "invalidConfig",
          "AKAN_OPS_PUBLIC_KEY is also the machine token key; give the ops channel a key of its own",
        );
      verifier = new OpsTokenVerifier(key, OpsTokenVerifier.audienceOf(appName, environment));
    } catch (error) {
      //* An edge keeps serving its residents with the ops channel off rather than crash-looping over a bad key.
      logger.error(`Ops channel disabled: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    const snapshotDir = SqliteFiles.snapshotDir(sources());
    void SqliteSnapshot.sweep(snapshotDir);
    const jobs = new SnapshotJobs({
      snapshotDir,
      capture: (request) => OpsRoute.captureInChild(request, sources(), snapshotDir),
    });
    logger.info(
      process.env.AKAN_OPS_INSTANCE?.trim()
        ? `Ops channel enabled for audience ${verifier.audience}`
        : `Ops channel enabled for audience ${verifier.audience}; without AKAN_OPS_INSTANCE a token for it is good on every instance of ${appName}/${environment}`,
    );
    const migrateJobs = new MigrateJobs((argv) => OpsRoute.migrateInChild(argv));
    return new OpsRoute({ verifier, detail, jobs, migrateJobs });
  }

  //* In a child: VACUUM INTO, integrity_check and gzip are sync or CPU-bound and would stall every request meanwhile.
  static async captureInChild(request: SnapshotJobRequest, sources: SnapshotSources, dir: string) {
    const args = ["ops", "snapshot", "--id", request.id, "--out", dir, "--db", sources.main, "--json"];
    if (sources.solid) args.push("--solid-db", sources.solid);
    if (request.includeSolid) args.push("--include-solid");
    const proc = Bun.spawn(SelfExec.command(Bun.main, ...args), {
      env: SelfExec.env(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const lastLine = stdout.trim().split("\n").at(-1) ?? "";
    if (code !== 0) throw new Error(stderr.trim().split("\n").at(-1) || `snapshot process exited with ${code}`);
    return JSON.parse(lastLine) as SnapshotCapture;
  }

  //* In a child: bun:sqlite would run the migration synchronously and stall every request, and a gateway has no server.
  static async migrateInChild(argv: string[], script = Bun.main): Promise<MigrateProcessOutput> {
    const proc = Bun.spawn(SelfExec.command(script, "ops", "migrate", ...argv), {
      env: SelfExec.env(),
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, stdout, stderr };
  }

  matches(pathname: string) {
    return pathname.startsWith(OpsRoute.prefix);
  }

  async handle(req: Request, client?: string | null): Promise<Response> {
    const url = new URL(req.url);
    if (this.#failures.blocked(client)) return OpsRoute.#rateLimited();
    const verdict = this.#verifier.verifyRequest(req);
    if (!verdict.ok) {
      this.#failures.fail(client);
      this.#noteRefusal(url.pathname, verdict.reason);
      return OpsRoute.#json({ error: "unauthorized" }, 401, { "www-authenticate": "Bearer" });
    }
    //* Counted only once verified, so an unsigned caller cannot spend the budget the control plane's calls need.
    if (!this.#admit()) return OpsRoute.#rateLimited();
    const route = url.pathname.slice(OpsRoute.prefix.length);
    if (route === "info" && req.method === "GET") return OpsRoute.#json(this.#detail(), 200);
    if (route === "snapshot" && req.method === "POST") return await this.#startSnapshot(req);
    if (route === "migrate" && req.method === "POST") return await this.#startMigrate(req, verdict.claims);
    const [kind, jobId, ...extra] = route.split("/");
    if ((kind === "snapshot" || kind === "migrate") && jobId && !extra.length && req.method === "GET") {
      const id = decodeURIComponent(jobId);
      const job = kind === "snapshot" ? this.#jobs.get(id) : this.#migrateJobs.get(id);
      if (job) return OpsRoute.#json(job, 200);
      return OpsRoute.#json({ error: kind === "snapshot" ? "unknown snapshot" : "unknown migrate job" }, 404);
    }
    return OpsRoute.#json({ error: "not found" }, 404);
  }

  async #startMigrate(req: Request, { sub }: OpsTokenClaims) {
    const request = MigrateJobs.requestOf(await req.json().catch(() => null), sub);
    if (typeof request === "string") return OpsRoute.#json({ error: request }, 400);
    const started = this.#migrateJobs.start(request);
    if (started === "exists") return OpsRoute.#json({ error: "migrate job id already used" }, 409);
    if (started === "busy") return OpsRoute.#json({ error: "another migrate job is running" }, 409);
    this.#logger.info(`Migrate job ${request.id} started: ${request.argv.slice(0, -1).join(" ")}`);
    return OpsRoute.#json(started, 202);
  }

  async #startSnapshot(req: Request) {
    const body = (await req.json().catch(() => null)) as {
      id?: unknown;
      includeSolid?: unknown;
      uploadUrls?: { main?: unknown; solid?: unknown; manifest?: unknown };
    } | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!SqliteSnapshot.idPattern.test(id))
      return OpsRoute.#json({ error: `id must match ${SqliteSnapshot.idPattern.source}` }, 400);
    const includeSolid = body?.includeSolid === true;
    const main = OpsRoute.#uploadUrl(body?.uploadUrls?.main);
    const manifest = OpsRoute.#uploadUrl(body?.uploadUrls?.manifest);
    const solid = body?.uploadUrls?.solid === undefined ? undefined : OpsRoute.#uploadUrl(body.uploadUrls.solid);
    if (!main || !manifest || solid === null)
      return OpsRoute.#json({ error: "uploadUrls.main and uploadUrls.manifest must be https URLs" }, 400);
    if (includeSolid && !solid) return OpsRoute.#json({ error: "includeSolid needs uploadUrls.solid" }, 400);
    const started = this.#jobs.start({ id, includeSolid, uploadUrls: { main, manifest, ...(solid ? { solid } : {}) } });
    if (started === "exists") return OpsRoute.#json({ error: "snapshot id already used" }, 409);
    if (started === "busy") return OpsRoute.#json({ error: "another snapshot is running" }, 409);
    return OpsRoute.#json(started, 202);
  }

  //* Plain http only to loopback (a local test bucket): anywhere else it would carry the database in cleartext.
  static #uploadUrl(value: unknown): string | null {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      if (url.protocol === "https:") return url.toString();
      if (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) return url.toString();
      return null;
    } catch {
      return null;
    }
  }

  #admit() {
    const now = Date.now();
    this.#window = this.#window.filter((at) => now - at < 60_000);
    if (this.#window.length >= this.#rateLimit) return false;
    this.#window.push(now);
    return true;
  }

  #noteRefusal(pathname: string, reason: string) {
    const now = Date.now();
    if (now - this.#refusalWindowAt >= 60_000) {
      this.#refusalWindowAt = now;
      this.#refusalCount = 0;
    }
    this.#refusalCount += 1;
    if (this.#refusalCount <= OpsRoute.loggedRefusalsPerMinute)
      this.#logger.warn(`Refused ops call to ${pathname}: ${reason}`);
    else if (this.#refusalCount === OpsRoute.loggedRefusalsPerMinute + 1)
      this.#logger.warn("Refusing further ops calls this minute without logging each");
  }

  static #machinePublicKey() {
    try {
      return MachineToken.publicKey();
    } catch {
      return null;
    }
  }

  static #rateLimited() {
    return OpsRoute.#json({ error: "rate limited" }, 429, { "retry-after": "60" });
  }

  static #json(value: unknown, status: number, headers: Record<string, string> = {}) {
    return Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } });
  }
}
