import { Logger } from "akanjs/common";
import { getEnv } from "../../base/baseEnv";
import type { AppDetailInfo } from "./appInfo";
import { OpsTokenVerifier } from "./opsToken";
import { type SnapshotJobRequest, SnapshotJobs } from "./snapshotJobs";
import type { SnapshotSources } from "./snapshotTypes";
import { SqliteFiles } from "./sqliteFiles";
import { type SnapshotCapture, SqliteSnapshot } from "./sqliteSnapshot";

export interface OpsRouteOptions {
  verifier: OpsTokenVerifier;
  detail: () => AppDetailInfo;
  jobs: SnapshotJobs;
  rateLimitPerMinute?: number;
}

export interface OpsRouteEnvOptions {
  detail: () => AppDetailInfo;
  sources?: () => SnapshotSources;
}

/**
 * `/_akan/ops/*` — the control plane's door into one running app. Mounted only when AKAN_OPS_PUBLIC_KEY is set,
 * served by the process that owns `/_akan/app/*`, and never a signal: nothing here reaches MCP or the in-page agent.
 */
export class OpsRoute {
  static readonly prefix = "/_akan/ops/";

  readonly #logger = new Logger("OpsRoute");
  readonly #verifier: OpsTokenVerifier;
  readonly #detail: () => AppDetailInfo;
  readonly #jobs: SnapshotJobs;
  readonly #rateLimit: number;
  #window: number[] = [];

  constructor({ verifier, detail, jobs, rateLimitPerMinute = 30 }: OpsRouteOptions) {
    this.#verifier = verifier;
    this.#detail = detail;
    this.#jobs = jobs;
    this.#rateLimit = rateLimitPerMinute;
  }

  static fromEnv({ detail, sources = SqliteFiles.fromEnv }: OpsRouteEnvOptions): OpsRoute | null {
    const publicKey = process.env.AKAN_OPS_PUBLIC_KEY?.trim();
    if (!publicKey) return null;
    const { appName, environment } = getEnv();
    const logger = new Logger("OpsRoute");
    let verifier: OpsTokenVerifier;
    try {
      verifier = new OpsTokenVerifier(
        OpsTokenVerifier.parsePublicKey(publicKey),
        OpsTokenVerifier.audienceOf(appName, environment),
      );
    } catch (error) {
      //* An edge keeps serving its residents with the ops channel off rather than crash-looping over a bad key.
      logger.error(`Ops channel disabled: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    const resolved = sources();
    const snapshotDir = SqliteFiles.snapshotDir(resolved);
    const jobs = new SnapshotJobs({
      snapshotDir,
      capture: (request) => OpsRoute.captureInChild(request, sources(), snapshotDir),
    });
    logger.info(`Ops channel enabled for audience ${verifier.audience}`);
    return new OpsRoute({ verifier, detail, jobs });
  }

  //* In a child process because VACUUM INTO, integrity_check and gzip are synchronous or CPU-bound work that would
  //* otherwise stall every request this process serves for as long as the database takes to copy.
  static async captureInChild(request: SnapshotJobRequest, sources: SnapshotSources, dir: string) {
    const args = ["ops", "snapshot", "--id", request.id, "--out", dir, "--db", sources.main, "--json"];
    if (sources.solid) args.push("--solid-db", sources.solid);
    if (request.includeSolid) args.push("--include-solid");
    const proc = Bun.spawn([process.execPath, Bun.main, ...args], {
      env: process.env,
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

  matches(pathname: string) {
    return pathname.startsWith(OpsRoute.prefix);
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (!this.#admit()) return OpsRoute.#json({ error: "rate limited" }, 429, { "retry-after": "60" });
    const verdict = this.#verifier.verifyRequest(req);
    if (!verdict.ok) {
      this.#logger.warn(`Refused ops call to ${url.pathname}: ${verdict.reason}`);
      return OpsRoute.#json({ error: "unauthorized" }, 401, { "www-authenticate": "Bearer" });
    }
    const route = url.pathname.slice(OpsRoute.prefix.length);
    if (route === "info" && req.method === "GET") return OpsRoute.#json(this.#detail(), 200);
    if (route === "snapshot" && req.method === "POST") return await this.#startSnapshot(req);
    const jobMatch = /^snapshot\/([^/]+)$/.exec(route);
    if (jobMatch?.[1] && req.method === "GET") {
      const job = this.#jobs.get(decodeURIComponent(jobMatch[1]));
      return job ? OpsRoute.#json(job, 200) : OpsRoute.#json({ error: "unknown snapshot" }, 404);
    }
    return OpsRoute.#json({ error: "not found" }, 404);
  }

  async #startSnapshot(req: Request) {
    const body = (await req.json().catch(() => null)) as {
      id?: unknown;
      includeSolid?: unknown;
      uploadUrls?: { main?: unknown; solid?: unknown; manifest?: unknown };
    } | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!SqliteSnapshot.idPattern.test(id)) return OpsRoute.#json({ error: "id must match [A-Za-z0-9._-]{1,64}" }, 400);
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

  //* Plain http only to loopback, which is what a local test bucket is; anything else would put the database in
  //* cleartext on the path the tunnel exists to protect.
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

  static #json(value: unknown, status: number, headers: Record<string, string> = {}) {
    return Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } });
  }
}
